//! Staff accounts and roles. Invitations are single-use links (never passwords); accounts are
//! deactivated, never deleted, so the audit trail stays intact; the last Super Admin is protected.

use std::collections::BTreeSet;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{PgConnection, Row};
use uuid::Uuid;

use crate::{
    audit::{self, Outcome},
    auth::{CurrentUser, revoke_all_sessions, routes::issue_invitation},
    error::{AppError, AppResult},
    jobs,
    mail::OutgoingEmail,
    state::AppState,
    text::{clean_line, valid_email},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/users", get(list).post(invite))
        .route("/users/preview-permissions", post(preview_permissions))
        .route("/users/{id}", get(detail).patch(update))
        .route("/users/{id}/deactivate", post(deactivate))
        .route("/users/{id}/reactivate", post(reactivate))
        .route("/users/{id}/reset-2fa", post(reset_2fa))
        .route("/users/{id}/resend-invitation", post(resend_invitation))
        .route("/roles", get(roles))
        .route("/roles/{id}", axum::routing::patch(update_role))
}

const PROTECTED_ROLE: &str = "super_admin";

async fn role_ids(
    conn: &mut PgConnection,
    codes: &[String],
) -> AppResult<Vec<(Uuid, String, bool)>> {
    let rows: Vec<(Uuid, String, bool)> = sqlx::query_as(
        "select r.id, r.code, exists(select 1 from role_permissions rp join permissions p on p.code = rp.permission where rp.role_id = r.id and p.sensitive)
         from roles r where r.code = any($1)",
    )
    .bind(codes)
    .fetch_all(&mut *conn)
    .await?;
    if rows.len() != codes.iter().collect::<BTreeSet<_>>().len() {
        return Err(AppError::field("roles", "Unknown role."));
    }
    Ok(rows)
}

/// Granting roles that carry sensitive permissions (or Super Admin) needs `roles.manage`.
fn check_grant(user: &CurrentUser, roles: &[(Uuid, String, bool)]) -> AppResult<()> {
    if roles
        .iter()
        .any(|(_, code, sensitive)| code == PROTECTED_ROLE || *sensitive)
        && !user.can("roles.manage")
    {
        return Err(AppError::forbidden(
            "Only someone who manages roles can grant roles with sensitive access.",
        ));
    }
    Ok(())
}

async fn active_super_admins(conn: &mut PgConnection, excluding: Uuid) -> AppResult<i64> {
    Ok(sqlx::query_scalar(
        "select count(*) from users u join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id
         where r.code = 'super_admin' and u.status = 'active' and u.totp_enabled_at is not null and u.id <> $1",
    )
    .bind(excluding)
    .fetch_one(&mut *conn)
    .await?)
}

async fn list(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    user.require("users.manage")?;
    let rows = sqlx::query(
        "select u.id, u.email, u.name, u.status, u.totp_enabled_at is not null as two_factor, u.last_login_at, u.created_at,
                coalesce((select array_agg(r.code order by r.code) from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = u.id), '{}') as roles,
                coalesce((select array_agg(b.name order by b.name) from user_branch_scopes s join branches b on b.id = s.branch_id where s.user_id = u.id), '{}') as branches
         from users u order by u.status = 'deactivated', u.name",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(json!({ "data": rows.iter().map(|r| json!({
        "id": r.get::<Uuid, _>("id"), "email": r.get::<String, _>("email"), "name": r.get::<String, _>("name"), "status": r.get::<String, _>("status"),
        "two_factor": r.get::<bool, _>("two_factor"), "last_login_at": r.get::<Option<DateTime<Utc>>, _>("last_login_at"),
        "created_at": r.get::<DateTime<Utc>, _>("created_at"), "roles": r.get::<Vec<String>, _>("roles"), "branches": r.get::<Vec<String>, _>("branches"),
    })).collect::<Vec<_>>() })))
}

async fn user_json(conn: &mut PgConnection, id: Uuid) -> AppResult<Value> {
    let r = sqlx::query("select id, email, name, status, totp_enabled_at is not null as two_factor, last_login_at, created_at, deactivated_at, deactivated_reason from users where id = $1")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or_else(AppError::not_found)?;
    let (permissions, roles, branches) = crate::auth::load_access(&mut *conn, id).await?;
    let sessions: i64 = sqlx::query_scalar("select count(*) from sessions where user_id = $1 and revoked_at is null and expires_at > now() and stage = 'full'").bind(id).fetch_one(&mut *conn).await?;
    let mut p: Vec<String> = permissions.into_iter().collect();
    p.sort();
    Ok(json!({
        "id": id, "email": r.get::<String, _>("email"), "name": r.get::<String, _>("name"), "status": r.get::<String, _>("status"),
        "two_factor": r.get::<bool, _>("two_factor"), "last_login_at": r.get::<Option<DateTime<Utc>>, _>("last_login_at"),
        "created_at": r.get::<DateTime<Utc>, _>("created_at"), "deactivated_at": r.get::<Option<DateTime<Utc>>, _>("deactivated_at"),
        "deactivated_reason": r.get::<Option<String>, _>("deactivated_reason"),
        "roles": roles, "branch_ids": branches, "permissions": p, "active_sessions": sessions,
    }))
}

async fn detail(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    user.require("users.manage")?;
    let mut conn = state.db.acquire().await?;
    Ok(Json(json!({ "data": user_json(&mut conn, id).await? })))
}

#[derive(Deserialize)]
struct InviteBody {
    email: String,
    name: String,
    roles: Vec<String>,
    #[serde(default)]
    branch_ids: Vec<Uuid>,
}

async fn set_scopes(conn: &mut PgConnection, user_id: Uuid, branch_ids: &[Uuid]) -> AppResult<()> {
    sqlx::query("delete from user_branch_scopes where user_id = $1")
        .bind(user_id)
        .execute(&mut *conn)
        .await?;
    let n = sqlx::query("insert into user_branch_scopes (user_id, branch_id) select $1, id from branches where id = any($2)")
        .bind(user_id)
        .bind(branch_ids)
        .execute(&mut *conn)
        .await?
        .rows_affected();
    if n as usize != branch_ids.iter().collect::<BTreeSet<_>>().len() {
        return Err(AppError::field("branch_ids", "Unknown branch."));
    }
    Ok(())
}

async fn invite(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(b): Json<InviteBody>,
) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("users.manage")?;
    user.require_recent_auth()?;
    let email = b.email.trim().to_lowercase();
    let name = clean_line(&b.name);
    if !valid_email(&email) {
        return Err(AppError::field("email", "Enter a valid email address."));
    }
    if name.is_empty() {
        return Err(AppError::field("name", "Enter the person's name."));
    }
    if b.roles.is_empty() {
        return Err(AppError::field("roles", "Choose at least one role."));
    }
    let mut tx = state.db.begin().await?;
    let roles = role_ids(&mut tx, &b.roles).await?;
    check_grant(&user, &roles)?;
    let id: Uuid = sqlx::query_scalar("insert into users (email, name, status, created_by) values ($1, $2, 'invited', $3) returning id")
        .bind(&email)
        .bind(&name)
        .bind(user.id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| match AppError::from(e) {
            x if x.code == "already_exists" => AppError::field("email", "Someone with this email already has an account."),
            x => x,
        })?;
    for (rid, _, _) in &roles {
        sqlx::query("insert into user_roles (user_id, role_id, granted_by) values ($1, $2, $3)")
            .bind(id)
            .bind(rid)
            .bind(user.id)
            .execute(&mut *tx)
            .await?;
    }
    set_scopes(&mut tx, id, &b.branch_ids).await?;
    let link = issue_invitation(&state, &mut tx, id, Some(user.id)).await?;
    jobs::enqueue_email(&mut tx, &OutgoingEmail {
        to: vec![email.clone()],
        subject: "You are invited to the Lokmangal admin panel".into(),
        text: format!("Hello {name},\n\n{} has invited you to the Lokmangal Multistate website admin panel.\n\nSet your password within 48 hours:\n{link}\n\nYou will also set up an authenticator app (Google or Microsoft Authenticator) for two-step sign-in.\n", user.name),
    })
    .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "user.invited",
        "user",
        id,
        Outcome::Success,
        json!({ "roles": b.roles, "branches": b.branch_ids.len() }),
    )
    .await?;
    tx.commit().await?;
    let mut conn = state.db.acquire().await?;
    let mut data = user_json(&mut conn, id).await?;
    // Shown once to the inviting admin in case email is not configured yet.
    data["invitation_link"] = json!(link);
    Ok((StatusCode::CREATED, Json(json!({ "data": data }))))
}

#[derive(Deserialize)]
struct UpdateBody {
    name: Option<String>,
    roles: Option<Vec<String>>,
    branch_ids: Option<Vec<Uuid>>,
    reason: Option<String>,
}

async fn update(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<UpdateBody>,
) -> AppResult<Json<Value>> {
    user.require("users.manage")?;
    user.require_recent_auth()?;
    let mut tx = state.db.begin().await?;
    let before = user_json(&mut tx, id).await?;
    if let Some(name) = b.name.as_deref().map(clean_line).filter(|n| !n.is_empty()) {
        sqlx::query("update users set name = $2, updated_at = now() where id = $1")
            .bind(id)
            .bind(name)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(codes) = &b.roles {
        if codes.is_empty() {
            return Err(AppError::field("roles", "Choose at least one role."));
        }
        let roles = role_ids(&mut tx, codes).await?;
        let current: Vec<String> =
            serde_json::from_value(before["roles"].clone()).unwrap_or_default();
        let added: Vec<_> = roles
            .iter()
            .filter(|(_, c, _)| !current.contains(c))
            .cloned()
            .collect();
        check_grant(&user, &added)?;
        let removing_super = current.iter().any(|c| c == PROTECTED_ROLE)
            && !codes.iter().any(|c| c == PROTECTED_ROLE);
        if removing_super {
            if !user.can("roles.manage") {
                return Err(AppError::forbidden(
                    "Only someone who manages roles can change Super Admin membership.",
                ));
            }
            if active_super_admins(&mut tx, id).await? == 0 {
                return Err(AppError::conflict(
                    "last_super_admin",
                    "At least one active Super Admin with two-factor authentication must remain.",
                ));
            }
        }
        sqlx::query("delete from user_roles where user_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        for (rid, _, _) in &roles {
            sqlx::query(
                "insert into user_roles (user_id, role_id, granted_by) values ($1, $2, $3)",
            )
            .bind(id)
            .bind(rid)
            .bind(user.id)
            .execute(&mut *tx)
            .await?;
        }
    }
    if let Some(branches) = &b.branch_ids {
        set_scopes(&mut tx, id, branches).await?;
    }
    let after = user_json(&mut tx, id).await?;
    audit::record(&mut *tx, &user.actor(), "user.updated", "user", id, Outcome::Success, json!({
        "reason": b.reason,
        "before": { "roles": before["roles"], "branches": before["branch_ids"], "name": before["name"] },
        "after": { "roles": after["roles"], "branches": after["branch_ids"], "name": after["name"] },
    }))
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "data": after })))
}

#[derive(Deserialize)]
struct ReasonBody {
    reason: String,
}

fn require_reason(r: &str) -> AppResult<String> {
    let r = r.trim();
    if r.is_empty() {
        Err(AppError::field(
            "reason",
            "Give a reason; it is kept in the audit log.",
        ))
    } else {
        Ok(r.to_owned())
    }
}

async fn deactivate(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<ReasonBody>,
) -> AppResult<Json<Value>> {
    user.require("users.manage")?;
    user.require_recent_auth()?;
    let reason = require_reason(&b.reason)?;
    let mut tx = state.db.begin().await?;
    let is_super: bool = sqlx::query_scalar("select exists(select 1 from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1 and r.code = 'super_admin')")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    if is_super && active_super_admins(&mut tx, id).await? == 0 {
        return Err(AppError::conflict(
            "last_super_admin",
            "This is the last active Super Admin and cannot be deactivated.",
        ));
    }
    let n = sqlx::query("update users set status = 'deactivated', deactivated_at = now(), deactivated_reason = $2, updated_at = now() where id = $1 and status <> 'deactivated'")
        .bind(id)
        .bind(&reason)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::conflict(
            "already_deactivated",
            "This account is already deactivated.",
        ));
    }
    let revoked = revoke_all_sessions(&mut *tx, id, None, "deactivated").await?;
    sqlx::query("update auth_tokens set revoked_at = now() where user_id = $1 and used_at is null and revoked_at is null").bind(id).execute(&mut *tx).await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "user.deactivated",
        "user",
        id,
        Outcome::Success,
        json!({ "reason": reason, "sessions_revoked": revoked }),
    )
    .await?;
    tx.commit().await?;
    let mut conn = state.db.acquire().await?;
    Ok(Json(json!({ "data": user_json(&mut conn, id).await? })))
}

async fn reactivate(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<ReasonBody>,
) -> AppResult<Json<Value>> {
    user.require("users.manage")?;
    user.require_recent_auth()?;
    let reason = require_reason(&b.reason)?;
    let n = sqlx::query("update users set status = case when password_hash is null then 'invited' else 'active' end, deactivated_at = null, deactivated_reason = null, updated_at = now() where id = $1 and status = 'deactivated'")
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::conflict(
            "not_deactivated",
            "This account is not deactivated.",
        ));
    }
    audit::record(
        &state.db,
        &user.actor(),
        "user.reactivated",
        "user",
        id,
        Outcome::Success,
        json!({ "reason": reason }),
    )
    .await?;
    let mut conn = state.db.acquire().await?;
    Ok(Json(json!({ "data": user_json(&mut conn, id).await? })))
}

/// After a verified identity check: removes the authenticator and recovery codes and signs the person out;
/// they set up two-factor again at their next sign-in.
async fn reset_2fa(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<ReasonBody>,
) -> AppResult<Json<Value>> {
    user.require("security.reset_2fa")?;
    user.require_recent_auth()?;
    let reason = require_reason(&b.reason)?;
    if id == user.id {
        return Err(AppError::forbidden(
            "Ask another administrator to reset your own two-factor authentication.",
        ));
    }
    let mut tx = state.db.begin().await?;
    let n = sqlx::query("update users set totp_secret_enc = null, totp_key_version = null, totp_enabled_at = null, totp_last_step = null, updated_at = now() where id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::not_found());
    }
    sqlx::query("delete from recovery_codes where user_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    let revoked = revoke_all_sessions(&mut *tx, id, None, "2fa_reset").await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "user.2fa_reset",
        "user",
        id,
        Outcome::Success,
        json!({ "reason": reason, "sessions_revoked": revoked }),
    )
    .await?;
    tx.commit().await?;
    let mut conn = state.db.acquire().await?;
    Ok(Json(json!({ "data": user_json(&mut conn, id).await? })))
}

async fn resend_invitation(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    user.require("users.manage")?;
    let mut tx = state.db.begin().await?;
    let (email, name, status): (String, String, String) =
        sqlx::query_as("select email, name, status from users where id = $1")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(AppError::not_found)?;
    if status != "invited" {
        return Err(AppError::conflict(
            "not_invited",
            "This person has already accepted their invitation.",
        ));
    }
    let link = issue_invitation(&state, &mut tx, id, Some(user.id)).await?;
    jobs::enqueue_email(&mut tx, &OutgoingEmail { to: vec![email], subject: "Your Lokmangal admin invitation".into(), text: format!("Hello {name},\n\nHere is a new link to set up your account (valid for 48 hours):\n{link}\n") }).await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "user.invitation_resent",
        "user",
        id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "data": { "invitation_link": link } })))
}

#[derive(Deserialize)]
struct PreviewBody {
    roles: Vec<String>,
}

async fn preview_permissions(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(b): Json<PreviewBody>,
) -> AppResult<Json<Value>> {
    user.require("users.manage")?;
    let perms: Vec<(String, String, bool)> = sqlx::query_as(
        "select distinct p.code, p.description, p.sensitive from roles r join role_permissions rp on rp.role_id = r.id join permissions p on p.code = rp.permission
         where r.code = any($1) order by p.code",
    )
    .bind(&b.roles)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "data": perms.into_iter().map(|(c, d, s)| json!({ "code": c, "description": d, "sensitive": s })).collect::<Vec<_>>() }),
    ))
}

async fn roles(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    user.require_any(&["users.manage", "roles.manage"])?;
    let roles = sqlx::query(
        "select r.id, r.code, r.name, r.description, r.is_system,
                coalesce((select array_agg(rp.permission order by rp.permission) from role_permissions rp where rp.role_id = r.id), '{}') as permissions,
                (select count(*) from user_roles ur join users u on u.id = ur.user_id where ur.role_id = r.id and u.status <> 'deactivated') as members
         from roles r order by r.name",
    )
    .fetch_all(&state.db)
    .await?;
    let catalogue: Vec<(String, String, bool)> =
        sqlx::query_as("select code, description, sensitive from permissions order by code")
            .fetch_all(&state.db)
            .await?;
    Ok(Json(json!({ "data": {
        "roles": roles.iter().map(|r| json!({ "id": r.get::<Uuid, _>("id"), "code": r.get::<String, _>("code"), "name": r.get::<String, _>("name"),
            "description": r.get::<String, _>("description"), "is_system": r.get::<bool, _>("is_system"), "permissions": r.get::<Vec<String>, _>("permissions"),
            "members": r.get::<i64, _>("members") })).collect::<Vec<_>>(),
        "permissions": catalogue.into_iter().map(|(c, d, s)| json!({ "code": c, "description": d, "sensitive": s })).collect::<Vec<_>>(),
    }})))
}

#[derive(Deserialize)]
struct RoleBody {
    permissions: Vec<String>,
    reason: String,
}

async fn update_role(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<RoleBody>,
) -> AppResult<Json<Value>> {
    user.require("roles.manage")?;
    user.require_recent_auth()?;
    let reason = require_reason(&b.reason)?;
    let mut tx = state.db.begin().await?;
    let code: String = sqlx::query_scalar("select code from roles where id = $1 for update")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(AppError::not_found)?;
    let wanted: BTreeSet<&str> = b.permissions.iter().map(String::as_str).collect();
    if code == PROTECTED_ROLE
        && !["users.manage", "roles.manage"]
            .iter()
            .all(|p| wanted.contains(p))
    {
        return Err(AppError::conflict(
            "protected_role",
            "Super Admin must keep the permissions needed to manage users and roles.",
        ));
    }
    let before: Vec<String> = sqlx::query_scalar(
        "select permission from role_permissions where role_id = $1 order by permission",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    sqlx::query("delete from role_permissions where role_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    let n = sqlx::query("insert into role_permissions (role_id, permission) select $1, code from permissions where code = any($2)")
        .bind(id)
        .bind(&b.permissions)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if n as usize != wanted.len() {
        return Err(AppError::field("permissions", "Unknown permission."));
    }
    sqlx::query("update roles set updated_at = now() where id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "role.updated",
        "role",
        &code,
        Outcome::Success,
        json!({ "reason": reason, "before": before, "after": b.permissions }),
    )
    .await?;
    tx.commit().await?;
    roles(State(state), user).await
}
