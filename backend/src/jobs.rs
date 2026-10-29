//! Durable PostgreSQL job queue (also the notification outbox). Jobs are claimed with
//! `FOR UPDATE SKIP LOCKED` under a lease, retried with backoff, and parked as "failed" when exhausted.
//! Handlers must be idempotent: a crash after the side effect but before completion runs them again.

use std::{sync::Arc, time::Duration};

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{FromRow, PgConnection};
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::{
    careers, enquiries, error::AppResult, mail::OutgoingEmail, notifications, privacy, releases,
    state::AppState,
};

pub async fn enqueue(
    conn: &mut PgConnection,
    kind: &str,
    payload: Value,
    run_at: Option<DateTime<Utc>>,
    dedupe_key: Option<&str>,
) -> AppResult<Uuid> {
    let id: Option<Uuid> = sqlx::query_scalar(
        "insert into jobs (kind, payload, run_at, dedupe_key) values ($1, $2, coalesce($3, now()), $4)
         on conflict (dedupe_key) do nothing returning id",
    )
    .bind(kind)
    .bind(payload)
    .bind(run_at)
    .bind(dedupe_key)
    .fetch_optional(&mut *conn)
    .await?;
    match id {
        Some(id) => Ok(id),
        None => Ok(
            sqlx::query_scalar("select id from jobs where dedupe_key = $1")
                .bind(dedupe_key)
                .fetch_one(&mut *conn)
                .await?,
        ),
    }
}

pub async fn enqueue_email(conn: &mut PgConnection, email: &OutgoingEmail) -> AppResult<Uuid> {
    enqueue(conn, "send_email", serde_json::to_value(email)?, None, None).await
}

#[derive(FromRow, Debug)]
pub struct Job {
    pub id: Uuid,
    pub kind: String,
    pub payload: Value,
    pub attempts: i32,
    pub max_attempts: i32,
}

const LEASE: &str = "10 minutes";

async fn claim(state: &AppState, worker: &str) -> sqlx::Result<Option<Job>> {
    sqlx::query_as(&format!(
        "update jobs set status = 'running', attempts = attempts + 1, locked_by = $1, locked_until = now() + interval '{LEASE}', updated_at = now()
         where id = (select id from jobs where status = 'queued' and run_at <= now() order by run_at for update skip locked limit 1)
         returning id, kind, payload, attempts, max_attempts"
    ))
    .bind(worker)
    .fetch_optional(&state.db)
    .await
}

/// Jobs whose worker died (lease expired) go back to the queue.
async fn recover_expired(state: &AppState) -> sqlx::Result<u64> {
    Ok(sqlx::query("update jobs set status = 'queued', locked_by = null, locked_until = null, updated_at = now() where status = 'running' and locked_until < now()")
        .execute(&state.db)
        .await?
        .rows_affected())
}

async fn finish(state: &AppState, job: &Job, result: anyhow::Result<()>) {
    let outcome = match result {
        Ok(()) => sqlx::query("update jobs set status = 'succeeded', locked_until = null, last_error = null, updated_at = now() where id = $1")
            .bind(job.id)
            .execute(&state.db)
            .await,
        Err(e) => {
            let error = format!("{e:#}");
            tracing::warn!(job = %job.id, kind = %job.kind, attempt = job.attempts, error = %error, "job failed");
            let exhausted = job.attempts >= job.max_attempts;
            // 30 s, 1 min, 2 min … capped at 1 hour.
            let backoff = (30i64 << (job.attempts.clamp(1, 8) - 1)).min(3600);
            let r = sqlx::query(
                "update jobs set status = case when $2 then 'failed' else 'queued' end, run_at = now() + make_interval(secs => $3),
                     locked_until = null, last_error = $4, updated_at = now() where id = $1",
            )
            .bind(job.id)
            .bind(exhausted)
            .bind(backoff as f64)
            .bind(error.chars().take(2000).collect::<String>())
            .execute(&state.db)
            .await;
            if exhausted {
                notifications::job_failed(state, job, &error).await;
            }
            r
        }
    };
    if let Err(e) = outcome {
        tracing::error!(job = %job.id, error = %e, "could not record job result");
    }
}

async fn dispatch(state: &AppState, job: &Job) -> anyhow::Result<()> {
    let id = |key: &str| -> anyhow::Result<Uuid> {
        job.payload
            .get(key)
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| anyhow::anyhow!("payload missing {key}"))
    };
    match job.kind.as_str() {
        "send_email" => {
            state
                .mailer
                .send(&serde_json::from_value(job.payload.clone())?)
                .await
        }
        "notify_enquiry" => enquiries::notify(state, id("enquiry_id")?).await,
        "notify_application" => careers::notify(state, id("application_id")?).await,
        "start_build" => releases::start_build(state, id("release_id")?).await,
        "activate_release" => {
            releases::activate_job(
                state,
                id("release_id")?,
                job.payload
                    .get("actor_id")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok()),
            )
            .await
        }
        "prepare_rate_release" => releases::prepare_rate_release(state, id("rate_set_id")?).await,
        "retention" => privacy::run_retention(state).await,
        "daily_digest" => notifications::daily(state).await,
        other => anyhow::bail!("unknown job kind {other}"),
    }
}

/// Runs the queue and the periodic scheduler until the process stops.
pub async fn run_worker(state: AppState) {
    let worker = format!("worker-{}", &Uuid::new_v4().to_string()[..8]);
    let permits = Arc::new(Semaphore::new(state.config.job_concurrency.max(1)));
    tracing::info!(%worker, concurrency = state.config.job_concurrency, "job worker started");
    let mut last_tick = std::time::Instant::now() - Duration::from_secs(60);
    loop {
        if last_tick.elapsed() >= Duration::from_secs(30) {
            last_tick = std::time::Instant::now();
            if let Err(e) = recover_expired(&state).await {
                tracing::error!(error = %e, "lease recovery failed");
            }
            if let Err(e) = periodic(&state).await {
                tracing::error!(error = ?e, "scheduler tick failed");
            }
        }
        let permit = permits.clone().acquire_owned().await.expect("semaphore");
        match claim(&state, &worker).await {
            Ok(Some(job)) => {
                let st = state.clone();
                tokio::spawn(async move {
                    let result = dispatch(&st, &job).await;
                    finish(&st, &job, result).await;
                    drop(permit);
                });
            }
            Ok(None) => {
                drop(permit);
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            Err(e) => {
                drop(permit);
                tracing::error!(error = %e, "could not claim jobs");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

/// Every 30 seconds: due scheduled releases and rate-expiry checks; daily jobs are de-duplicated by date.
async fn periodic(state: &AppState) -> AppResult<()> {
    releases::scheduler_tick(state).await?;
    let today = Utc::now()
        .with_timezone(&chrono_tz::Asia::Kolkata)
        .date_naive();
    let mut conn = state.db.acquire().await?;
    enqueue(
        &mut conn,
        "retention",
        json!({}),
        None,
        Some(&format!("retention:{today}")),
    )
    .await?;
    enqueue(
        &mut conn,
        "daily_digest",
        json!({}),
        None,
        Some(&format!("digest:{today}")),
    )
    .await?;
    Ok(())
}
