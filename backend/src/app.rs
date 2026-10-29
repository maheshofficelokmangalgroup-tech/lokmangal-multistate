//! HTTP routers and middleware.
//!
//! * Main listener (API_BIND), behind Caddy: `/api/v1/*` public, `/api/admin/*` staff, `/api/preview/*`
//!   preview host. Caddy exposes each prefix only on its own host; the admin router also refuses other
//!   hosts in production as a second line of defence.
//! * Internal listener (INTERNAL_BIND), never routed by Caddy: `/api/internal/*` for the builder.

use std::time::Duration;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Request, State},
    http::{HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::json;
use tower_http::{
    sensitive_headers::SetSensitiveRequestHeadersLayer,
    timeout::TimeoutLayer,
    trace::{DefaultMakeSpan, TraceLayer},
};
use uuid::Uuid;

use crate::{
    approvals, auth, careers, content, enquiries,
    error::{AppError, REQUEST_ID},
    media, notifications, overview, preview, privacy, rates, releases, settings,
    state::{AppState, client_meta},
    users,
};

/// Every request gets an id (reused from Caddy's X-Request-Id when well-formed), returned in the
/// response and included in error bodies and logs.
async fn request_id(req: Request, next: Next) -> Response {
    let id = req
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .filter(|v| {
            v.len() <= 64
                && v.chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        })
        .map(str::to_owned)
        .unwrap_or_else(|| format!("req_{}", Uuid::new_v4().simple()));
    let mut res = REQUEST_ID.scope(id.clone(), next.run(req)).await;
    if let Ok(v) = HeaderValue::from_str(&id) {
        res.headers_mut().insert("x-request-id", v);
    }
    res
}

async fn api_headers(req: Request, next: Next) -> Response {
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );
    h.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    h.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("same-origin"),
    );
    res
}

/// Production: admin API only on the admin host, and optionally only from office networks.
async fn admin_guard(State(state): State<AppState>, req: Request, next: Next) -> Response {
    if state.config.is_production() {
        let host = req
            .headers()
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if Some(host) != state.config.admin_url.host_str() {
            return AppError::not_found().into_response();
        }
    }
    let (parts, body) = req.into_parts();
    let meta = client_meta(&parts, state.config.trust_proxy);
    let networks: Option<serde_json::Value> =
        sqlx::query_scalar("select value->'officeNetworks' from app_settings where key = 'access'")
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
    if let (Some(list), Some(ip)) = (
        networks
            .as_ref()
            .and_then(|v| v.as_array())
            .filter(|a| !a.is_empty()),
        meta.ip,
    ) {
        let allowed = list
            .iter()
            .filter_map(|n| {
                n.as_str()?
                    .parse::<sqlx::types::ipnetwork::IpNetwork>()
                    .ok()
            })
            .any(|n| n.contains(ip));
        if !allowed {
            return AppError::forbidden(
                "The admin panel can only be used from the society's office network.",
            )
            .into_response();
        }
    }
    next.run(Request::from_parts(parts, body)).await
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

/// Readiness: the database answers. No internal details are exposed.
async fn ready(State(state): State<AppState>) -> impl IntoResponse {
    match sqlx::query_scalar::<_, i32>("select 1")
        .fetch_one(&state.db)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "ready" }))),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "status": "unavailable" })),
        ),
    }
}

pub fn public_api() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .merge(enquiries::public_router())
        .merge(careers::public_router())
}

pub fn admin_api(state: &AppState) -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::routes::router())
        .merge(enquiries::admin_router())
        .merge(careers::admin_router())
        .merge(content::router())
        .merge(rates::router())
        .merge(approvals::router())
        .merge(releases::admin_router())
        .merge(preview::admin_router())
        .merge(media::router())
        .merge(users::router())
        .merge(settings::router())
        .merge(notifications::router())
        .merge(privacy::router())
        .merge(overview::router())
        .layer(middleware::from_fn_with_state(state.clone(), admin_guard))
}

fn common(router: Router) -> Router {
    router
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(120),
        ))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().include_headers(false)),
        )
        .layer(SetSensitiveRequestHeadersLayer::new([
            header::COOKIE,
            header::AUTHORIZATION,
        ]))
        .layer(middleware::from_fn(request_id))
}

pub fn main_app(state: AppState) -> Router {
    let api = Router::new()
        .nest("/api/v1", public_api())
        .nest("/api/admin", admin_api(&state))
        .merge(preview::preview_host_router())
        .layer(middleware::from_fn(api_headers))
        .with_state(state);
    common(api)
}

pub fn internal_app(state: AppState) -> Router {
    common(
        releases::internal_router()
            .route("/healthz", get(health))
            .with_state(state),
    )
}
