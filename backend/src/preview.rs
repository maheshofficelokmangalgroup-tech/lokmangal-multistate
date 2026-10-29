//! Private previews. The admin panel asks for a short-lived, single-use grant for one preview release;
//! the preview host exchanges it for a host-only cookie scoped to that release, and every preview request
//! is checked (Caddy forward_auth → /api/preview/check), which answers with the release id to serve.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
};
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    audit::{self, Outcome},
    auth::{CurrentUser, read_cookie},
    error::{AppError, AppResult},
    security::{hash_token, random_token},
    state::AppState,
};

pub fn admin_router() -> Router<AppState> {
    Router::new().route("/previews/{id}/access", post(grant))
}

/// Served on the preview host only.
pub fn preview_host_router() -> Router<AppState> {
    Router::new()
        .route("/api/preview/exchange", get(exchange))
        .route("/api/preview/check", get(check))
}

async fn grant(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    user.require("site.preview")?;
    let status: String =
        sqlx::query_scalar("select status from releases where id = $1 and kind = 'preview'")
            .bind(id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(AppError::not_found)?;
    if status != "ready" {
        return Err(AppError::conflict(
            "not_ready",
            "This preview is still being built.",
        ));
    }
    let token = random_token(32);
    sqlx::query("insert into preview_grants (release_id, user_id, token_hash, expires_at) values ($1, $2, $3, now() + interval '2 minutes')")
        .bind(id)
        .bind(user.id)
        .bind(hash_token(&state.config.token_key, &token))
        .execute(&state.db)
        .await?;
    audit::record(
        &state.db,
        &user.actor(),
        "preview.access_granted",
        "release",
        id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    let base = state.config.preview_url.as_str().trim_end_matches('/');
    Ok(Json(
        json!({ "data": { "url": format!("{base}/api/preview/exchange?grant={token}"), "expires_in_seconds": 120 } }),
    ))
}

#[derive(Deserialize)]
struct ExchangeQuery {
    grant: String,
}

fn no_store(mut res: Response) -> Response {
    let h = res.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    h.insert(
        "X-Robots-Tag",
        HeaderValue::from_static("noindex, nofollow"),
    );
    res
}

fn expired_page() -> Response {
    no_store(
        (
            StatusCode::UNAUTHORIZED,
            Html("<!doctype html><meta charset=utf-8><title>Preview expired</title><body style=\"font:16px system-ui;margin:3rem\"><h1>This preview link has expired</h1><p>Open the preview again from the admin panel (Publish center).</p>"),
        )
            .into_response(),
    )
}

/// Single-use: the grant leaves the URL immediately via a redirect.
async fn exchange(
    State(state): State<AppState>,
    Query(q): Query<ExchangeQuery>,
) -> AppResult<Response> {
    let mut tx = state.db.begin().await?;
    let row: Option<(Uuid, Uuid, Uuid)> = sqlx::query_as(
        "update preview_grants set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning id, release_id, user_id",
    )
    .bind(hash_token(&state.config.token_key, &q.grant))
    .fetch_optional(&mut *tx)
    .await?;
    let Some((_, release, user)) = row else {
        return Ok(expired_page());
    };
    let token = random_token(32);
    sqlx::query("insert into preview_sessions (release_id, user_id, token_hash, expires_at) values ($1, $2, $3, $4)")
        .bind(release)
        .bind(user)
        .bind(hash_token(&state.config.token_key, &token))
        .bind(Utc::now() + Duration::minutes(30))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let secure = if state.config.preview_url.scheme() == "https" {
        "; Secure"
    } else {
        ""
    };
    let cookie = format!(
        "{}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800{secure}",
        state.config.preview_cookie_name()
    );
    let mut res = (StatusCode::SEE_OTHER, [(header::LOCATION, "/")]).into_response();
    res.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(AppError::internal)?,
    );
    Ok(no_store(res))
}

/// The preview release id for this browser, or None.
pub async fn preview_release_for(state: &AppState, headers: &HeaderMap) -> AppResult<Option<Uuid>> {
    let Some(token) = read_cookie(headers, state.config.preview_cookie_name()) else {
        return Ok(None);
    };
    Ok(sqlx::query_scalar(
        "select s.release_id from preview_sessions s join users u on u.id = s.user_id join releases r on r.id = s.release_id
         where s.token_hash = $1 and s.expires_at > now() and u.status = 'active' and r.kind = 'preview' and r.status = 'ready'",
    )
    .bind(hash_token(&state.config.token_key, token))
    .fetch_optional(&state.db)
    .await?)
}

async fn check(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    match preview_release_for(&state, &headers).await? {
        Some(id) => {
            let mut res = StatusCode::OK.into_response();
            res.headers_mut().insert(
                "X-Preview-Release",
                HeaderValue::from_str(&id.to_string()).map_err(AppError::internal)?,
            );
            Ok(no_store(res))
        }
        None => Ok(expired_page()),
    }
}
