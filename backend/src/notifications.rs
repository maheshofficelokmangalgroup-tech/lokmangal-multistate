//! In-app notifications: approval requests, follow-ups, failed releases and rate-expiry warnings.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{PgConnection, Row};
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    jobs::Job,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notifications", get(list))
        .route("/notifications/read-all", post(read_all))
        .route("/notifications/{id}/read", post(read_one))
}

async fn list(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    let rows = sqlx::query("select id, kind, title, body, link, read_at, created_at from notifications where user_id = $1 order by read_at is not null, created_at desc limit 50")
        .bind(user.id)
        .fetch_all(&state.db)
        .await?;
    let unread: i64 = sqlx::query_scalar(
        "select count(*) from notifications where user_id = $1 and read_at is null",
    )
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({
        "data": rows.iter().map(|r| json!({
            "id": r.get::<Uuid, _>("id"), "kind": r.get::<String, _>("kind"), "title": r.get::<String, _>("title"),
            "body": r.get::<String, _>("body"), "link": r.get::<Option<String>, _>("link"),
            "read": r.get::<Option<DateTime<Utc>>, _>("read_at").is_some(), "created_at": r.get::<DateTime<Utc>, _>("created_at"),
        })).collect::<Vec<_>>(),
        "meta": { "unread": unread },
    })))
}

async fn read_one(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let n = sqlx::query("update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        Err(AppError::not_found())
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

async fn read_all(State(state): State<AppState>, user: CurrentUser) -> AppResult<StatusCode> {
    sqlx::query("update notifications set read_at = now() where user_id = $1 and read_at is null")
        .bind(user.id)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Notifies every active user holding `permission`, optionally excluding one person.
pub async fn to_permission(
    conn: &mut PgConnection,
    permission: &str,
    kind: &str,
    title: &str,
    body: &str,
    link: Option<&str>,
    exclude: Option<Uuid>,
) -> sqlx::Result<()> {
    sqlx::query(
        "insert into notifications (user_id, kind, title, body, link)
         select distinct u.id, $2, $3, $4, $5 from users u
         join user_roles ur on ur.user_id = u.id join role_permissions rp on rp.role_id = ur.role_id
         where rp.permission = $1 and u.status = 'active' and ($6::uuid is null or u.id <> $6)",
    )
    .bind(permission)
    .bind(kind)
    .bind(title)
    .bind(body)
    .bind(link)
    .bind(exclude)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn to_user(
    conn: &mut PgConnection,
    user_id: Uuid,
    kind: &str,
    title: &str,
    link: Option<&str>,
) -> sqlx::Result<()> {
    sqlx::query("insert into notifications (user_id, kind, title, link) values ($1, $2, $3, $4)")
        .bind(user_id)
        .bind(kind)
        .bind(title)
        .bind(link)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Called when a job exhausts its retries.
pub async fn job_failed(state: &AppState, job: &Job, error: &str) {
    let result = async {
        let mut conn = state.db.acquire().await?;
        let (permission, title) = match job.kind.as_str() {
            "start_build" | "activate_release" | "prepare_rate_release" => {
                ("site.publish", "A website release failed")
            }
            "send_email" | "notify_enquiry" | "notify_application" => {
                ("system.health", "Notification emails are failing")
            }
            _ => ("system.health", "A background job failed"),
        };
        to_permission(
            &mut conn,
            permission,
            "job_failed",
            title,
            &error.chars().take(300).collect::<String>(),
            Some("/publish"),
            None,
        )
        .await
    }
    .await;
    if let Err(e) = result {
        tracing::error!(error = %e, "could not create failure notification");
    }
}

/// Daily: follow-ups due today, and rate-set expiry warnings at 30, 7 and 0 days.
pub async fn daily(state: &AppState) -> anyhow::Result<()> {
    let mut conn = state.db.acquire().await?;
    sqlx::query(
        "insert into notifications (user_id, kind, title, link)
         select e.assignee_id, 'follow_up_due', 'Follow-up due today: ' || e.reference, '/leads/' || e.id
         from enquiries e where e.assignee_id is not null and e.status in ('new','contacted','in_progress')
           and (e.follow_up_at at time zone 'Asia/Kolkata')::date <= (now() at time zone 'Asia/Kolkata')::date",
    )
    .execute(&mut *conn)
    .await?;
    let days_left: Option<i32> = sqlx::query_scalar(
        "select (rs.valid_until - (now() at time zone 'Asia/Kolkata')::date)
         from releases r join rate_sets rs on rs.id = r.rate_set_id where r.kind = 'live' and r.status = 'live'",
    )
    .fetch_optional(&mut *conn)
    .await?;
    let replacement: bool = sqlx::query_scalar(
        "select exists(select 1 from rate_sets where status = 'approved' and valid_from > (now() at time zone 'Asia/Kolkata')::date)",
    )
    .fetch_one(&mut *conn)
    .await?;
    if let Some(d) = days_left.filter(|d| [30, 7, 1, 0].contains(d) || *d < 0) {
        if !replacement {
            let title = if d <= 0 {
                "Published interest rates have expired".to_owned()
            } else {
                format!("Published interest rates expire in {d} days")
            };
            for p in ["rates.edit", "financial.approve"] {
                to_permission(
                    &mut conn,
                    p,
                    "rate_expiry",
                    &title,
                    "Prepare and approve the next rate set.",
                    Some("/products/rates"),
                    None,
                )
                .await?;
            }
        }
    }
    Ok(())
}
