//! Staff authentication: server-side sessions in PostgreSQL, mandatory TOTP, CSRF protection and
//! permission checks. Every protected handler takes a [`CurrentUser`], which only exists after both factors.

pub mod password;
pub mod routes;
pub mod totp;

use std::{collections::HashSet, net::IpAddr};

use axum::{
    extract::FromRequestParts,
    http::{HeaderMap, HeaderValue, Method, header, request::Parts},
};
use chrono::{DateTime, Duration, Utc};
use sqlx::{PgExecutor, Row};
use uuid::Uuid;

use crate::{
    audit::Actor,
    error::{AppError, AppResult},
    security::{constant_time_eq, hash_token, random_token},
    state::{AppState, ClientMeta, client_meta, ip_network},
};

pub const IDLE_TIMEOUT: Duration = Duration::minutes(30);
pub const ABSOLUTE_TIMEOUT: Duration = Duration::hours(12);
pub const PARTIAL_TIMEOUT: Duration = Duration::minutes(10);
pub const RECENT_AUTH: Duration = Duration::minutes(10);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stage {
    Password,
    Enroll,
    Full,
}

impl Stage {
    pub fn as_str(self) -> &'static str {
        match self {
            Stage::Password => "password",
            Stage::Enroll => "enroll",
            Stage::Full => "full",
        }
    }
    fn parse(s: &str) -> Option<Self> {
        match s {
            "password" => Some(Stage::Password),
            "enroll" => Some(Stage::Enroll),
            "full" => Some(Stage::Full),
            _ => None,
        }
    }
}

/// A signed-in staff member who completed both factors.
#[derive(Clone, Debug)]
pub struct CurrentUser {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub session_id: Uuid,
    pub csrf_token: String,
    pub session_expires_at: DateTime<Utc>,
    pub reauth_at: Option<DateTime<Utc>>,
    pub permissions: HashSet<String>,
    pub roles: Vec<String>,
    pub branch_ids: Vec<Uuid>,
    pub ip: Option<IpAddr>,
    pub request_id: Option<String>,
}

impl CurrentUser {
    pub fn can(&self, permission: &str) -> bool {
        self.permissions.contains(permission)
    }

    pub fn require(&self, permission: &str) -> AppResult<()> {
        if self.can(permission) {
            Ok(())
        } else {
            Err(AppError::missing_permission(permission))
        }
    }

    pub fn require_any(&self, permissions: &[&str]) -> AppResult<()> {
        if permissions.iter().any(|p| self.can(p)) {
            Ok(())
        } else {
            Err(AppError::missing_permission(permissions[0]))
        }
    }

    /// Security-sensitive actions need a password + code confirmation in the last 10 minutes.
    pub fn require_recent_auth(&self) -> AppResult<()> {
        match self.reauth_at {
            Some(t) if Utc::now() - t <= RECENT_AUTH => Ok(()),
            _ => Err(AppError::forbidden(
                "Please confirm your password and authenticator code to continue.",
            )
            .with_extra(serde_json::json!({ "reauth_required": true }))),
        }
    }

    pub fn actor(&self) -> Actor {
        Actor {
            user_id: Some(self.id),
            label: self.email.clone(),
            ip: self.ip,
            request_id: self.request_id.clone(),
        }
    }
}

/// A session that passed the password step but not yet 2FA (verification or first-time enrolment).
#[derive(Clone, Debug)]
pub struct PendingAuth {
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    pub name: String,
    pub stage: Stage,
    pub meta: ClientMeta,
}

struct SessionRow {
    id: Uuid,
    user_id: Uuid,
    stage: Stage,
    csrf_token: String,
    last_seen_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    reauth_at: Option<DateTime<Utc>>,
    email: String,
    name: String,
    user_status: String,
}

pub fn read_cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|kv| kv.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v)
}

async fn load_session(state: &AppState, parts: &Parts) -> AppResult<SessionRow> {
    let token = read_cookie(&parts.headers, state.config.session_cookie_name())
        .ok_or_else(AppError::unauthorized)?;
    let row = sqlx::query(
        "select s.id, s.user_id, s.stage, s.csrf_token, s.last_seen_at, s.expires_at, s.reauth_at,
                u.email, u.name, u.status
         from sessions s join users u on u.id = s.user_id
         where s.token_hash = $1 and s.revoked_at is null",
    )
    .bind(hash_token(&state.config.token_key, token))
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(AppError::unauthorized)?;
    let s = SessionRow {
        id: row.get("id"),
        user_id: row.get("user_id"),
        stage: Stage::parse(row.get::<&str, _>("stage")).ok_or_else(AppError::unauthorized)?,
        csrf_token: row.get("csrf_token"),
        last_seen_at: row.get("last_seen_at"),
        expires_at: row.get("expires_at"),
        reauth_at: row.get("reauth_at"),
        email: row.get("email"),
        name: row.get("name"),
        user_status: row.get("status"),
    };
    let now = Utc::now();
    let idle_expired = s.stage == Stage::Full && now - s.last_seen_at > IDLE_TIMEOUT;
    if s.expires_at <= now || idle_expired || s.user_status == "deactivated" {
        sqlx::query("update sessions set revoked_at = now(), revoked_reason = $2 where id = $1 and revoked_at is null")
            .bind(s.id)
            .bind(if idle_expired { "idle_timeout" } else { "expired" })
            .execute(&state.db)
            .await?;
        return Err(AppError::unauthorized());
    }
    Ok(s)
}

/// Unsafe methods need the session's CSRF token in `X-CSRF-Token` and, when sent, a matching Origin.
fn check_csrf(state: &AppState, parts: &Parts, expected: &str) -> AppResult<()> {
    if matches!(parts.method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return Ok(());
    }
    if let Some(origin) = parts
        .headers
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    {
        if origin != state.config.admin_origin() {
            return Err(AppError::forbidden(
                "This request did not come from the admin panel.",
            ));
        }
    }
    let sent = parts
        .headers
        .get("x-csrf-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !constant_time_eq(sent.as_bytes(), expected.as_bytes()) {
        return Err(AppError::new(
            axum::http::StatusCode::FORBIDDEN,
            "csrf_failed",
            "Your session security check failed. Reload the page and try again.",
        ));
    }
    Ok(())
}

pub async fn load_access(
    db: &mut sqlx::PgConnection,
    user_id: Uuid,
) -> AppResult<(HashSet<String>, Vec<String>, Vec<Uuid>)> {
    let permissions: Vec<String> = sqlx::query_scalar(
        "select distinct rp.permission from user_roles ur join role_permissions rp on rp.role_id = ur.role_id where ur.user_id = $1",
    )
    .bind(user_id)
    .fetch_all(&mut *db)
    .await?;
    let roles: Vec<String> =
        sqlx::query_scalar("select r.code from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1 order by r.code")
            .bind(user_id)
            .fetch_all(&mut *db)
            .await?;
    let branches: Vec<Uuid> =
        sqlx::query_scalar("select branch_id from user_branch_scopes where user_id = $1")
            .bind(user_id)
            .fetch_all(&mut *db)
            .await?;
    Ok((permissions.into_iter().collect(), roles, branches))
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        if let Some(user) = parts.extensions.get::<CurrentUser>() {
            return Ok(user.clone());
        }
        let s = load_session(state, parts).await?;
        if s.stage != Stage::Full {
            return Err(AppError::unauthorized()
                .with_extra(serde_json::json!({ "stage": s.stage.as_str() })));
        }
        check_csrf(state, parts, &s.csrf_token)?;
        if Utc::now() - s.last_seen_at > Duration::seconds(30) {
            sqlx::query("update sessions set last_seen_at = now() where id = $1")
                .bind(s.id)
                .execute(&state.db)
                .await?;
        }
        let mut conn = state.db.acquire().await?;
        let (permissions, roles, branch_ids) = load_access(&mut conn, s.user_id).await?;
        let meta = client_meta(parts, state.config.trust_proxy);
        let user = CurrentUser {
            id: s.user_id,
            email: s.email,
            name: s.name,
            session_id: s.id,
            csrf_token: s.csrf_token,
            session_expires_at: s.expires_at,
            reauth_at: s.reauth_at,
            permissions,
            roles,
            branch_ids,
            ip: meta.ip,
            request_id: meta.request_id,
        };
        parts.extensions.insert(user.clone());
        Ok(user)
    }
}

impl FromRequestParts<AppState> for PendingAuth {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let s = load_session(state, parts).await?;
        check_csrf(state, parts, &s.csrf_token)?;
        Ok(PendingAuth {
            session_id: s.id,
            user_id: s.user_id,
            email: s.email,
            name: s.name,
            stage: s.stage,
            meta: client_meta(parts, state.config.trust_proxy),
        })
    }
}

/// Creates a session and returns its cookie. Tokens are random 256-bit values stored only as keyed hashes.
pub async fn create_session(
    state: &AppState,
    db: impl PgExecutor<'_>,
    user_id: Uuid,
    stage: Stage,
    meta: &ClientMeta,
    reauthenticated: bool,
) -> AppResult<(Uuid, String, HeaderValue)> {
    let token = random_token(32);
    let csrf = random_token(24);
    let ttl = if stage == Stage::Full {
        ABSOLUTE_TIMEOUT
    } else {
        PARTIAL_TIMEOUT
    };
    let id: Uuid = sqlx::query_scalar(
        "insert into sessions (token_hash, user_id, stage, csrf_token, expires_at, reauth_at, ip, user_agent)
         values ($1, $2, $3, $4, now() + $5, case when $6 then now() end, $7, $8) returning id",
    )
    .bind(hash_token(&state.config.token_key, &token))
    .bind(user_id)
    .bind(stage.as_str())
    .bind(&csrf)
    .bind(ttl)
    .bind(reauthenticated)
    .bind(ip_network(meta.ip))
    .bind(&meta.user_agent)
    .fetch_one(db)
    .await?;
    Ok((id, csrf, session_cookie(state, &token, ttl.num_seconds())))
}

pub fn session_cookie(state: &AppState, token: &str, max_age: i64) -> HeaderValue {
    let secure = if state.config.cookie_secure() {
        "; Secure"
    } else {
        ""
    };
    HeaderValue::from_str(&format!(
        "{}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{secure}",
        state.config.session_cookie_name()
    ))
    .expect("cookie header")
}

pub fn clear_session_cookie(state: &AppState) -> HeaderValue {
    session_cookie(state, "", 0)
}

pub async fn revoke_session(
    db: impl PgExecutor<'_>,
    session_id: Uuid,
    reason: &str,
) -> AppResult<()> {
    sqlx::query("update sessions set revoked_at = now(), revoked_reason = $2 where id = $1 and revoked_at is null")
        .bind(session_id)
        .bind(reason)
        .execute(db)
        .await?;
    Ok(())
}

pub async fn revoke_all_sessions(
    db: impl PgExecutor<'_>,
    user_id: Uuid,
    except: Option<Uuid>,
    reason: &str,
) -> AppResult<u64> {
    let r = sqlx::query(
        "update sessions set revoked_at = now(), revoked_reason = $3
         where user_id = $1 and revoked_at is null and ($2::uuid is null or id <> $2)",
    )
    .bind(user_id)
    .bind(except)
    .bind(reason)
    .execute(db)
    .await?;
    Ok(r.rows_affected())
}
