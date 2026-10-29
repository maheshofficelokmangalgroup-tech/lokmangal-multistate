//! Development-only static servers (never started in production, where Caddy does this):
//! * DEV_SITE_BIND serves the active release, answers its redirects and proxies /api/v1 forms, so the
//!   whole publish → live → enquiry loop can be tried on one machine without Caddy.
//! * DEV_PREVIEW_BIND serves preview releases behind the same grant/cookie check as production.

use std::{net::SocketAddr, path::PathBuf};

use axum::{
    Router,
    extract::{Request, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use tower::ServiceExt;
use tower_http::{
    services::{ServeDir, ServeFile},
    set_status::SetStatus,
};
use uuid::Uuid;

use crate::{activation::RedirectRule, app, preview, state::AppState};

#[derive(Deserialize)]
struct Current {
    id: Uuid,
    #[serde(default)]
    redirects: Vec<RedirectRule>,
}

async fn serve_from(root: PathBuf, req: Request) -> Response {
    let not_found = SetStatus::new(ServeFile::new(root.join("404.html")), StatusCode::NOT_FOUND);
    match ServeDir::new(&root)
        .append_index_html_on_directories(true)
        .not_found_service(not_found)
        .oneshot(req)
        .await
    {
        Ok(res) => res.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn site(State(state): State<AppState>, req: Request) -> Response {
    let Ok(bytes) = tokio::fs::read(state.config.releases_root.join("current.json")).await else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "No release has been published yet. Publish one from the admin panel.",
        )
            .into_response();
    };
    let Ok(current) = serde_json::from_slice::<Current>(&bytes) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let path = req.uri().path().trim_end_matches('/').to_owned();
    if let Some(r) = current
        .redirects
        .iter()
        .find(|r| r.from.trim_end_matches('/') == path)
    {
        // Same status codes as production (Caddy answers with the configured 301/302).
        let status = StatusCode::from_u16(r.status).unwrap_or(StatusCode::MOVED_PERMANENTLY);
        return (status, [(header::LOCATION, r.to.clone())]).into_response();
    }
    let mut res = serve_from(state.config.releases_root.join(current.id.to_string()), req).await;
    res.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-cache"),
    );
    res
}

async fn preview_site(State(state): State<AppState>, req: Request) -> Response {
    match preview::preview_release_for(&state, req.headers()).await {
        Ok(Some(id)) => serve_from(state.config.previews_root.join(id.to_string()), req).await,
        _ => (
            StatusCode::UNAUTHORIZED,
            "Preview link expired. Open the preview again from the admin panel.",
        )
            .into_response(),
    }
}

pub async fn serve(
    state: AppState,
    site_bind: Option<SocketAddr>,
    preview_bind: Option<SocketAddr>,
) -> anyhow::Result<()> {
    if let Some(addr) = site_bind {
        let router = Router::new()
            .nest("/api/v1", app::public_api())
            .fallback(site)
            .with_state(state.clone());
        let listener = tokio::net::TcpListener::bind(addr).await?;
        tracing::info!(%addr, "dev site server (active release)");
        tokio::spawn(async move {
            axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
        });
    }
    if let Some(addr) = preview_bind {
        let router = preview::preview_host_router()
            .fallback(preview_site)
            .with_state(state.clone());
        let listener = tokio::net::TcpListener::bind(addr).await?;
        tracing::info!(%addr, "dev preview server");
        tokio::spawn(async move {
            axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
        });
    }
    Ok(())
}
