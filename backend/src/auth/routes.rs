//! /api/admin/auth/* — login, two-factor, sessions, password recovery and invitations.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{StatusCode, header},
    response::{AppendHeaders, IntoResponse, Response},
    routing::{get, post},
};
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use super::{
    CurrentUser, PendingAuth, Stage, clear_session_cookie, create_session, password,
    revoke_all_sessions, revoke_session, totp,
};
use crate::{
    audit::{self, Actor, Outcome},
    error::{AppError, AppResult},
    jobs,
    mail::OutgoingEmail,
    security::{decrypt, encrypt, hash_token, random_token},
    state::{AppState, ClientMeta, ip_network},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/2fa", post(verify_second_factor))
        .route("/2fa/enroll", post(enroll_start))
        .route("/2fa/verify", post(enroll_verify))
        .route("/logout", post(logout))
        .route("/me", get(me))
        .route("/keepalive", post(keepalive))
        .route("/reauth", post(reauth))
        .route("/sessions", get(sessions))
        .route("/sessions/{id}/revoke", post(revoke_one))
        .route("/sessions/revoke-others", post(revoke_others))
        .route("/password", post(change_password))
        .route("/recovery-codes", post(regenerate_recovery_codes))
        .route("/forgot-password", post(forgot_password))
        .route("/reset-password", post(reset_password))
        .route("/invitations/accept", post(accept_invitation))
}

const GENERIC_LOGIN_ERROR: &str = "Email or password is incorrect.";

#[derive(Deserialize)]
struct LoginBody {
    email: String,
    password: String,
}

async fn login(
    State(state): State<AppState>,
    meta: ClientMeta,
    Json(body): Json<LoginBody>,
) -> AppResult<Response> {
    let email = body.email.trim().to_lowercase();
    let ip = ip_network(meta.ip);

    // Throttling: 5 failures per account or 30 per address in 15 minutes.
    let recent: (i64, i64) = sqlx::query_as(
        "select count(*) filter (where email = $1), count(*) filter (where ip = $2)
         from login_attempts where at > now() - interval '15 minutes' and not success and (email = $1 or ip = $2)",
    )
    .bind(&email)
    .bind(ip)
    .fetch_one(&state.db)
    .await?;
    if recent.0 >= 5 || recent.1 >= 30 {
        audit::record_best_effort(
            &state.db,
            &Actor::anonymous(&meta),
            "auth.login_throttled",
            "user",
            &email,
            Outcome::Denied,
            json!({}),
        )
        .await;
        return Err(AppError::too_many(
            "Too many sign-in attempts. Wait 15 minutes, or reset your password.",
        ));
    }

    let user = sqlx::query("select id, name, password_hash, status, totp_enabled_at is not null as has_totp from users where email = $1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;
    let verified = match &user {
        Some(row) if row.get::<&str, _>("status") == "active" => {
            let hash: Option<String> = row.get("password_hash");
            let pw = body.password.clone();
            match hash {
                Some(h) => tokio::task::spawn_blocking(move || password::verify_password(&pw, &h))
                    .await
                    .unwrap_or(false),
                None => false,
            }
        }
        _ => {
            let pw = body.password.clone();
            let _ = tokio::task::spawn_blocking(move || password::burn_verification(&pw)).await;
            false
        }
    };
    sqlx::query("insert into login_attempts (email, ip, success) values ($1, $2, $3)")
        .bind(&email)
        .bind(ip)
        .bind(verified)
        .execute(&state.db)
        .await?;
    let Some(user) = user.filter(|_| verified) else {
        audit::record_best_effort(
            &state.db,
            &Actor::anonymous(&meta),
            "auth.login_failed",
            "user",
            &email,
            Outcome::Failure,
            json!({}),
        )
        .await;
        return Err(AppError::new(
            StatusCode::UNAUTHORIZED,
            "invalid_credentials",
            GENERIC_LOGIN_ERROR,
        ));
    };
    let user_id: Uuid = user.get("id");
    let stage = if user.get::<bool, _>("has_totp") {
        Stage::Password
    } else {
        Stage::Enroll
    };
    let (_, csrf, cookie) = create_session(&state, &state.db, user_id, stage, &meta, false).await?;
    Ok((AppendHeaders([(header::SET_COOKIE, cookie)]), Json(json!({ "data": { "stage": if stage == Stage::Password { "totp" } else { "enroll" }, "csrf_token": csrf } }))).into_response())
}

#[derive(Deserialize)]
struct CodeBody {
    code: Option<String>,
    recovery_code: Option<String>,
}

/// Completes sign-in with an authenticator code (or a one-time recovery code), rotating the session.
async fn verify_second_factor(
    State(state): State<AppState>,
    pending: PendingAuth,
    Json(body): Json<CodeBody>,
) -> AppResult<Response> {
    if pending.stage != Stage::Password {
        return Err(AppError::conflict(
            "wrong_stage",
            "Set up two-factor authentication first.",
        ));
    }
    let actor = Actor {
        user_id: Some(pending.user_id),
        label: pending.email.clone(),
        ip: pending.meta.ip,
        request_id: pending.meta.request_id.clone(),
    };
    let mut tx = state.db.begin().await?;
    let row =
        sqlx::query("select totp_secret_enc, totp_last_step from users where id = $1 for update")
            .bind(pending.user_id)
            .fetch_one(&mut *tx)
            .await?;
    let ok = if let Some(code) = body.code.as_deref().filter(|c| !c.trim().is_empty()) {
        let enc: Vec<u8> = row
            .get::<Option<Vec<u8>>, _>("totp_secret_enc")
            .ok_or_else(AppError::unauthorized)?;
        let secret = decrypt(&state.config.data_key, &enc)?;
        match totp::verify(
            &secret,
            code,
            Utc::now().timestamp() as u64,
            row.get("totp_last_step"),
        )? {
            Some(step) => {
                sqlx::query("update users set totp_last_step = $2 where id = $1")
                    .bind(pending.user_id)
                    .bind(step)
                    .execute(&mut *tx)
                    .await?;
                true
            }
            None => false,
        }
    } else if let Some(code) = body.recovery_code.as_deref() {
        let used = sqlx::query("update recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null")
            .bind(pending.user_id)
            .bind(totp::recovery_code_hash(&state.config.token_key, code))
            .execute(&mut *tx)
            .await?
            .rows_affected();
        if used == 1 {
            audit::record(
                &mut *tx,
                &actor,
                "auth.recovery_code_used",
                "user",
                pending.user_id,
                Outcome::Success,
                json!({}),
            )
            .await?;
        }
        used == 1
    } else {
        false
    };
    if !ok {
        tx.commit().await?;
        sqlx::query("insert into login_attempts (email, ip, success) values ($1, $2, false)")
            .bind(&pending.email)
            .bind(ip_network(pending.meta.ip))
            .execute(&state.db)
            .await?;
        audit::record_best_effort(
            &state.db,
            &actor,
            "auth.2fa_failed",
            "user",
            pending.user_id,
            Outcome::Failure,
            json!({}),
        )
        .await;
        return Err(AppError::field(
            "code",
            "That code is not valid. Check your authenticator app and try again.",
        ));
    }
    revoke_session(&mut *tx, pending.session_id, "rotated").await?;
    let (_, csrf, cookie) = create_session(
        &state,
        &mut *tx,
        pending.user_id,
        Stage::Full,
        &pending.meta,
        true,
    )
    .await?;
    sqlx::query("update users set last_login_at = now() where id = $1")
        .bind(pending.user_id)
        .execute(&mut *tx)
        .await?;
    audit::record(
        &mut *tx,
        &actor,
        "auth.login",
        "user",
        pending.user_id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    tx.commit().await?;
    Ok((
        AppendHeaders([(header::SET_COOKIE, cookie)]),
        Json(json!({ "data": { "stage": "done", "csrf_token": csrf } })),
    )
        .into_response())
}

/// First-time setup: a new secret is generated and returned once (QR code + manual key).
async fn enroll_start(
    State(state): State<AppState>,
    pending: PendingAuth,
) -> AppResult<Json<Value>> {
    if pending.stage != Stage::Enroll {
        return Err(AppError::conflict(
            "wrong_stage",
            "Two-factor authentication is already set up.",
        ));
    }
    let secret = totp::new_secret();
    sqlx::query("update users set totp_secret_enc = $2, totp_key_version = $3, totp_enabled_at = null, totp_last_step = null where id = $1 and totp_enabled_at is null")
        .bind(pending.user_id)
        .bind(encrypt(&state.config.data_key, &secret)?)
        .bind(state.config.data_key_version)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "data": {
        "otpauth_url": totp::otpauth_url(&secret, &pending.email),
        "secret": totp::base32(&secret),
    }})))
}

async fn enroll_verify(
    State(state): State<AppState>,
    pending: PendingAuth,
    Json(body): Json<CodeBody>,
) -> AppResult<Response> {
    if pending.stage != Stage::Enroll {
        return Err(AppError::conflict(
            "wrong_stage",
            "Two-factor authentication is already set up.",
        ));
    }
    let mut tx = state.db.begin().await?;
    let enc: Option<Vec<u8>> = sqlx::query_scalar(
        "select totp_secret_enc from users where id = $1 and totp_enabled_at is null for update",
    )
    .bind(pending.user_id)
    .fetch_optional(&mut *tx)
    .await?
    .flatten();
    let enc = enc.ok_or_else(|| {
        AppError::conflict(
            "enrolment_missing",
            "Start the setup again to get a new QR code.",
        )
    })?;
    let secret = decrypt(&state.config.data_key, &enc)?;
    let code = body.code.unwrap_or_default();
    let Some(step) = totp::verify(&secret, &code, Utc::now().timestamp() as u64, None)? else {
        return Err(AppError::field(
            "code",
            "That code is not valid. Make sure the time on your phone is correct and try again.",
        ));
    };
    sqlx::query("update users set totp_enabled_at = now(), totp_last_step = $2, last_login_at = now() where id = $1")
        .bind(pending.user_id)
        .bind(step)
        .execute(&mut *tx)
        .await?;
    let codes = store_new_recovery_codes(&state, &mut tx, pending.user_id).await?;
    revoke_session(&mut *tx, pending.session_id, "rotated").await?;
    let (_, csrf, cookie) = create_session(
        &state,
        &mut *tx,
        pending.user_id,
        Stage::Full,
        &pending.meta,
        true,
    )
    .await?;
    let actor = Actor {
        user_id: Some(pending.user_id),
        label: pending.email.clone(),
        ip: pending.meta.ip,
        request_id: pending.meta.request_id.clone(),
    };
    audit::record(
        &mut *tx,
        &actor,
        "auth.2fa_enrolled",
        "user",
        pending.user_id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    tx.commit().await?;
    Ok((
        AppendHeaders([(header::SET_COOKIE, cookie)]),
        Json(json!({ "data": { "stage": "done", "csrf_token": csrf, "recovery_codes": codes } })),
    )
        .into_response())
}

async fn store_new_recovery_codes(
    state: &AppState,
    tx: &mut sqlx::PgConnection,
    user_id: Uuid,
) -> AppResult<Vec<String>> {
    sqlx::query("delete from recovery_codes where user_id = $1")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    let codes = totp::new_recovery_codes();
    for code in &codes {
        sqlx::query("insert into recovery_codes (user_id, code_hash) values ($1, $2)")
            .bind(user_id)
            .bind(totp::recovery_code_hash(&state.config.token_key, code))
            .execute(&mut *tx)
            .await?;
    }
    Ok(codes)
}

async fn regenerate_recovery_codes(
    State(state): State<AppState>,
    user: CurrentUser,
) -> AppResult<Json<Value>> {
    user.require_recent_auth()?;
    let mut tx = state.db.begin().await?;
    let codes = store_new_recovery_codes(&state, &mut tx, user.id).await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "auth.recovery_codes_regenerated",
        "user",
        user.id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "data": { "recovery_codes": codes } })))
}

async fn logout(State(state): State<AppState>, user: CurrentUser) -> AppResult<Response> {
    revoke_session(&state.db, user.session_id, "logout").await?;
    audit::record_best_effort(
        &state.db,
        &user.actor(),
        "auth.logout",
        "user",
        user.id,
        Outcome::Success,
        json!({}),
    )
    .await;
    Ok((
        AppendHeaders([(header::SET_COOKIE, clear_session_cookie(&state))]),
        StatusCode::NO_CONTENT,
    )
        .into_response())
}

async fn me(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    let branches: Vec<(Uuid, String, String)> =
        sqlx::query_as("select id, code, name from branches where id = any($1) order by name")
            .bind(&user.branch_ids)
            .fetch_all(&state.db)
            .await?;
    let mut permissions: Vec<&String> = user.permissions.iter().collect();
    permissions.sort();
    Ok(Json(json!({ "data": {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "roles": user.roles,
        "permissions": permissions,
        "branches": branches.into_iter().map(|(id, code, name)| json!({ "id": id, "code": code, "name": name })).collect::<Vec<_>>(),
        "csrf_token": user.csrf_token,
        "session": {
            "id": user.session_id,
            "expires_at": user.session_expires_at,
            "idle_timeout_seconds": super::IDLE_TIMEOUT.num_seconds(),
            "recently_authenticated": user.require_recent_auth().is_ok(),
        },
    }})))
}

async fn keepalive(user: CurrentUser) -> Json<Value> {
    // The extractor already refreshed last_seen_at.
    Json(json!({ "data": { "expires_at": user.session_expires_at } }))
}

#[derive(Deserialize)]
struct ReauthBody {
    password: String,
    code: String,
}

async fn reauth(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(body): Json<ReauthBody>,
) -> AppResult<Json<Value>> {
    let mut tx = state.db.begin().await?;
    let row = sqlx::query(
        "select password_hash, totp_secret_enc, totp_last_step from users where id = $1 for update",
    )
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;
    let hash: String = row
        .get::<Option<String>, _>("password_hash")
        .unwrap_or_default();
    let pw = body.password.clone();
    let pw_ok = tokio::task::spawn_blocking(move || password::verify_password(&pw, &hash))
        .await
        .unwrap_or(false);
    let secret = decrypt(
        &state.config.data_key,
        &row.get::<Option<Vec<u8>>, _>("totp_secret_enc")
            .unwrap_or_default(),
    );
    let step = match (pw_ok, secret) {
        (true, Ok(secret)) => totp::verify(
            &secret,
            &body.code,
            Utc::now().timestamp() as u64,
            row.get("totp_last_step"),
        )?,
        _ => None,
    };
    let Some(step) = step else {
        tx.rollback().await?;
        audit::record_best_effort(
            &state.db,
            &user.actor(),
            "auth.reauth_failed",
            "user",
            user.id,
            Outcome::Failure,
            json!({}),
        )
        .await;
        return Err(AppError::field("code", "Password or code is not correct."));
    };
    sqlx::query("update users set totp_last_step = $2 where id = $1")
        .bind(user.id)
        .bind(step)
        .execute(&mut *tx)
        .await?;
    sqlx::query("update sessions set reauth_at = now() where id = $1")
        .bind(user.session_id)
        .execute(&mut *tx)
        .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "auth.reauth",
        "user",
        user.id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "data": { "recently_authenticated": true } })))
}

async fn sessions(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    let rows = sqlx::query(
        "select id, created_at, last_seen_at, expires_at, host(ip) as ip, user_agent from sessions
         where user_id = $1 and revoked_at is null and stage = 'full' and expires_at > now() order by last_seen_at desc",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    let list: Vec<Value> = rows
        .iter()
        .map(|r| {
            let id: Uuid = r.get("id");
            json!({
                "id": id,
                "current": id == user.session_id,
                "created_at": r.get::<chrono::DateTime<Utc>, _>("created_at"),
                "last_seen_at": r.get::<chrono::DateTime<Utc>, _>("last_seen_at"),
                "expires_at": r.get::<chrono::DateTime<Utc>, _>("expires_at"),
                "ip": r.get::<Option<String>, _>("ip"),
                "device": describe_agent(r.get::<Option<String>, _>("user_agent").as_deref()),
            })
        })
        .collect();
    Ok(Json(json!({ "data": list })))
}

/// Approximate device description; the raw user agent is not shown.
fn describe_agent(ua: Option<&str>) -> String {
    let ua = ua.unwrap_or("");
    let browser = ["Edg/", "Chrome/", "Firefox/", "Safari/"]
        .iter()
        .find(|b| ua.contains(*b))
        .map(|b| match *b {
            "Edg/" => "Edge",
            "Chrome/" => "Chrome",
            "Firefox/" => "Firefox",
            _ => "Safari",
        })
        .unwrap_or("Browser");
    let os = if ua.contains("Android") {
        "Android"
    } else if ua.contains("iPhone") || ua.contains("iPad") {
        "iOS"
    } else if ua.contains("Windows") {
        "Windows"
    } else if ua.contains("Mac OS") {
        "macOS"
    } else if ua.contains("Linux") {
        "Linux"
    } else {
        "Unknown device"
    };
    format!("{browser} on {os}")
}

async fn revoke_one(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let n = sqlx::query("update sessions set revoked_at = now(), revoked_reason = 'revoked_by_user' where id = $1 and user_id = $2 and revoked_at is null")
        .bind(id)
        .bind(user.id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::not_found());
    }
    audit::record(
        &state.db,
        &user.actor(),
        "auth.session_revoked",
        "session",
        id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn revoke_others(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    let n = revoke_all_sessions(
        &state.db,
        user.id,
        Some(user.session_id),
        "signed_out_everywhere",
    )
    .await?;
    audit::record(
        &state.db,
        &user.actor(),
        "auth.sessions_revoked",
        "user",
        user.id,
        Outcome::Success,
        json!({ "count": n }),
    )
    .await?;
    Ok(Json(json!({ "data": { "revoked": n } })))
}

#[derive(Deserialize)]
struct ChangePasswordBody {
    current_password: String,
    new_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(body): Json<ChangePasswordBody>,
) -> AppResult<Json<Value>> {
    if let Some(problem) = password::policy_problem(&body.new_password, &user.email) {
        return Err(AppError::field("new_password", problem));
    }
    let hash: Option<String> = sqlx::query_scalar("select password_hash from users where id = $1")
        .bind(user.id)
        .fetch_one(&state.db)
        .await?;
    let current = body.current_password.clone();
    let ok = tokio::task::spawn_blocking(move || {
        hash.is_some_and(|h| password::verify_password(&current, &h))
    })
    .await
    .unwrap_or(false);
    if !ok {
        return Err(AppError::field(
            "current_password",
            "Your current password is not correct.",
        ));
    }
    let new_password = body.new_password.clone();
    let new_hash = tokio::task::spawn_blocking(move || password::hash_password(&new_password))
        .await
        .map_err(AppError::internal)??;
    let mut tx = state.db.begin().await?;
    sqlx::query("update users set password_hash = $2, password_changed_at = now(), updated_at = now() where id = $1")
        .bind(user.id)
        .bind(new_hash)
        .execute(&mut *tx)
        .await?;
    let n =
        revoke_all_sessions(&mut *tx, user.id, Some(user.session_id), "password_changed").await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "auth.password_changed",
        "user",
        user.id,
        Outcome::Success,
        json!({ "other_sessions_revoked": n }),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "data": { "other_sessions_revoked": n } })))
}

#[derive(Deserialize)]
struct ForgotBody {
    email: String,
}

/// Always answers the same way, so it cannot be used to find out which emails have accounts.
async fn forgot_password(
    State(state): State<AppState>,
    meta: ClientMeta,
    Json(body): Json<ForgotBody>,
) -> AppResult<(StatusCode, Json<Value>)> {
    let email = body.email.trim().to_lowercase();
    if !state
        .public_limiter
        .allow("forgot", meta.ip, 5, std::time::Duration::from_secs(3600))
    {
        return Err(AppError::too_many(
            "Too many requests. Please try again later.",
        ));
    }
    let user: Option<(Uuid, String)> =
        sqlx::query_as("select id, name from users where email = $1 and status = 'active'")
            .bind(&email)
            .fetch_optional(&state.db)
            .await?;
    if let Some((user_id, name)) = user {
        let token = random_token(32);
        let mut tx = state.db.begin().await?;
        sqlx::query("update auth_tokens set revoked_at = now() where user_id = $1 and kind = 'password_reset' and used_at is null and revoked_at is null")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("insert into auth_tokens (kind, token_hash, user_id, expires_at) values ('password_reset', $1, $2, now() + interval '30 minutes')")
            .bind(hash_token(&state.config.token_key, &token))
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        let link = state
            .config
            .admin_link(&format!("/reset-password#token={token}"));
        jobs::enqueue_email(
            &mut tx,
            &OutgoingEmail {
                to: vec![email.clone()],
                subject: "Reset your Lokmangal admin password".into(),
                text: format!(
                    "Hello {name},\n\nUse this link within 30 minutes to choose a new password:\n{link}\n\nIf you did not ask for this, you can ignore this email — your password has not changed.\n"
                ),
            },
        )
        .await?;
        audit::record(
            &mut *tx,
            &Actor::anonymous(&meta),
            "auth.password_reset_requested",
            "user",
            user_id,
            Outcome::Success,
            json!({}),
        )
        .await?;
        tx.commit().await?;
    }
    Ok((
        StatusCode::ACCEPTED,
        Json(
            json!({ "data": { "message": "If that address belongs to an active account, we have sent a reset link." } }),
        ),
    ))
}

#[derive(Deserialize)]
struct ResetBody {
    token: String,
    password: String,
}

async fn consume_token(
    tx: &mut sqlx::PgConnection,
    state: &AppState,
    kind: &str,
    token: &str,
) -> AppResult<(Uuid, String)> {
    let row: Option<(Uuid, Uuid, String)> = sqlx::query_as(
        "select t.id, u.id, u.email from auth_tokens t join users u on u.id = t.user_id
         where t.token_hash = $1 and t.kind = $2 and t.used_at is null and t.revoked_at is null and t.expires_at > now()
         for update of t",
    )
    .bind(hash_token(&state.config.token_key, token))
    .bind(kind)
    .fetch_optional(&mut *tx)
    .await?;
    let (token_id, user_id, email) = row.ok_or_else(|| {
        AppError::unprocessable(
            "invalid_link",
            "This link has expired or was already used. Ask for a new one.",
        )
    })?;
    sqlx::query("update auth_tokens set used_at = now() where id = $1")
        .bind(token_id)
        .execute(&mut *tx)
        .await?;
    Ok((user_id, email))
}

async fn reset_password(
    State(state): State<AppState>,
    meta: ClientMeta,
    Json(body): Json<ResetBody>,
) -> AppResult<Json<Value>> {
    let mut tx = state.db.begin().await?;
    let (user_id, email) = consume_token(&mut tx, &state, "password_reset", &body.token).await?;
    if let Some(problem) = password::policy_problem(&body.password, &email) {
        return Err(AppError::field("password", problem));
    }
    let pw = body.password.clone();
    let hash = tokio::task::spawn_blocking(move || password::hash_password(&pw))
        .await
        .map_err(AppError::internal)??;
    sqlx::query("update users set password_hash = $2, password_changed_at = now(), updated_at = now() where id = $1 and status = 'active'")
        .bind(user_id)
        .bind(hash)
        .execute(&mut *tx)
        .await?;
    let n = revoke_all_sessions(&mut *tx, user_id, None, "password_reset").await?;
    audit::record(
        &mut *tx,
        &Actor {
            user_id: Some(user_id),
            label: email,
            ip: meta.ip,
            request_id: meta.request_id.clone(),
        },
        "auth.password_reset",
        "user",
        user_id,
        Outcome::Success,
        json!({ "sessions_revoked": n }),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({ "data": { "message": "Your password has been changed. Please sign in." } }),
    ))
}

#[derive(Deserialize)]
struct AcceptBody {
    token: String,
    password: String,
}

/// An invited user sets a password, then continues straight to 2FA enrolment.
async fn accept_invitation(
    State(state): State<AppState>,
    meta: ClientMeta,
    Json(body): Json<AcceptBody>,
) -> AppResult<Response> {
    let mut tx = state.db.begin().await?;
    let (user_id, email) = consume_token(&mut tx, &state, "invitation", &body.token).await?;
    if let Some(problem) = password::policy_problem(&body.password, &email) {
        return Err(AppError::field("password", problem));
    }
    let pw = body.password.clone();
    let hash = tokio::task::spawn_blocking(move || password::hash_password(&pw))
        .await
        .map_err(AppError::internal)??;
    let n = sqlx::query("update users set password_hash = $2, password_changed_at = now(), status = 'active', updated_at = now() where id = $1 and status = 'invited'")
        .bind(user_id)
        .bind(hash)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::unprocessable(
            "invalid_link",
            "This invitation is no longer valid.",
        ));
    }
    let (_, csrf, cookie) =
        create_session(&state, &mut *tx, user_id, Stage::Enroll, &meta, false).await?;
    audit::record(
        &mut *tx,
        &Actor {
            user_id: Some(user_id),
            label: email,
            ip: meta.ip,
            request_id: meta.request_id.clone(),
        },
        "auth.invitation_accepted",
        "user",
        user_id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    tx.commit().await?;
    Ok((
        AppendHeaders([(header::SET_COOKIE, cookie)]),
        Json(json!({ "data": { "stage": "enroll", "csrf_token": csrf } })),
    )
        .into_response())
}

/// Used by the users module: makes a fresh single-use invitation link (48 hours).
pub async fn issue_invitation(
    state: &AppState,
    tx: &mut sqlx::PgConnection,
    user_id: Uuid,
    created_by: Option<Uuid>,
) -> AppResult<String> {
    sqlx::query("update auth_tokens set revoked_at = now() where user_id = $1 and kind = 'invitation' and used_at is null and revoked_at is null")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    let token = random_token(32);
    sqlx::query("insert into auth_tokens (kind, token_hash, user_id, expires_at, created_by) values ('invitation', $1, $2, $3, $4)")
        .bind(hash_token(&state.config.token_key, &token))
        .bind(user_id)
        .bind(Utc::now() + Duration::hours(48))
        .bind(created_by)
        .execute(&mut *tx)
        .await?;
    Ok(state
        .config
        .admin_link(&format!("/accept-invitation#token={token}")))
}
