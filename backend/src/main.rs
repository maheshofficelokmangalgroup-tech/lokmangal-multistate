//! lokmangal-server: the API (main + internal listeners), the job worker and, in development, the
//! local site and preview servers. `lokmangal-server worker` runs only the worker; `api` only the API.

use std::net::SocketAddr;

use lokmangal::{
    MIGRATOR, app, config::Config, connect, devsite, init_tracing, jobs, mail::Mailer, releases,
    state::AppState,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    let config = Config::from_env()?;
    init_tracing(config.is_production());
    let mode = std::env::args().nth(1).unwrap_or_else(|| "all".into());
    if !matches!(mode.as_str(), "all" | "api" | "worker") {
        anyhow::bail!("usage: lokmangal-server [all|api|worker] (got {mode:?})");
    }

    let db = connect(&config).await?;
    if mode != "worker"
        && std::env::var("RUN_MIGRATIONS")
            .map(|v| v != "false")
            .unwrap_or(true)
    {
        MIGRATOR.run(&db).await?;
        tracing::info!("database migrations are up to date");
    }
    let mailer = Mailer::from_config(&config)?;
    let state = AppState::new(db, config.clone(), mailer);
    for dir in [
        &config.releases_root,
        &config.previews_root,
        &config.media_root,
        &config.private_root,
    ] {
        tokio::fs::create_dir_all(dir).await?;
    }
    if let Err(e) = releases::reconcile(&state).await {
        tracing::warn!(error = %e, "release reconciliation skipped");
    }

    let run_api = mode == "all" || mode == "api";
    let run_worker = (mode == "all" && config.run_worker) || mode == "worker";
    if run_worker {
        tokio::spawn(jobs::run_worker(state.clone()));
    }
    if !run_api {
        tokio::signal::ctrl_c().await?;
        return Ok(());
    }

    let preview_bind = std::env::var("DEV_PREVIEW_BIND")
        .ok()
        .filter(|_| !config.is_production())
        .and_then(|v| v.parse().ok());
    devsite::serve(state.clone(), config.dev_site_bind, preview_bind).await?;

    let internal = tokio::net::TcpListener::bind(config.internal_bind).await?;
    let internal_app = app::internal_app(state.clone());
    tracing::info!(addr = %config.internal_bind, "internal API listening");
    tokio::spawn(async move { axum::serve(internal, internal_app).await });

    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    tracing::info!(addr = %config.bind, env = ?config.env, "API listening");
    axum::serve(
        listener,
        app::main_app(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}
