//! Lokmangal Multistate backend: admin API, public form intake, job worker and release controller.

// AppError carries field messages and context by value; boxing it everywhere would only add noise.
#![allow(clippy::result_large_err)]

pub mod activation;
pub mod app;
pub mod approvals;
pub mod audit;
pub mod auth;
pub mod careers;
pub mod config;
pub mod content;
pub mod devsite;
pub mod diff;
pub mod enquiries;
pub mod error;
pub mod exports;
pub mod forms;
pub mod importer;
pub mod jobs;
pub mod live;
pub mod mail;
pub mod media;
pub mod notifications;
pub mod overview;
pub mod preview;
pub mod privacy;
pub mod rates;
pub mod releases;
pub mod security;
pub mod settings;
pub mod state;
pub mod text;
pub mod users;

use std::time::Duration;

use sqlx::postgres::{PgConnectOptions, PgPoolOptions};

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

pub async fn connect(config: &config::Config) -> anyhow::Result<sqlx::PgPool> {
    let mut options: PgConnectOptions = config.database_url.parse()?;
    // Testing aid for single-session databases (e.g. PGlite), where every client shares one backend:
    // no statement cache, one connection, and statements left by earlier clients are cleared.
    let single_session = std::env::var("DATABASE_STATEMENT_CACHE").is_ok_and(|v| v == "0");
    if single_session {
        options = options.statement_cache_capacity(0);
    }
    let max = std::env::var("DATABASE_MAX_CONNECTIONS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(20);
    Ok(PgPoolOptions::new()
        .max_connections(max)
        .acquire_timeout(Duration::from_secs(10))
        .after_connect(move |conn, _| {
            Box::pin(async move {
                if single_session {
                    sqlx::Executor::execute(&mut *conn, "DEALLOCATE ALL").await?;
                }
                Ok(())
            })
        })
        .connect_with(options)
        .await?)
}

pub fn init_tracing(json: bool) {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,sqlx=warn,tower_http=info".into());
    let builder = tracing_subscriber::fmt().with_env_filter(filter);
    if json {
        builder.json().with_current_span(false).init();
    } else {
        builder.init();
    }
}
