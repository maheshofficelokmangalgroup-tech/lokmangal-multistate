//! Retention and data-subject requests. Personal data is anonymised when its retention period ends,
//! including notes and résumé files; aggregate counts (status, type, dates) are kept.

use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{PgConnection, Row};
use uuid::Uuid;

use crate::{
    audit::{self, Actor, Outcome},
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
    text::{clean_multiline, normalize_phone, valid_email},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/data-requests", get(list).post(create))
        .route("/data-requests/{id}/complete", post(complete))
}

async fn anonymize_enquiries(
    conn: &mut PgConnection,
    filter_sql: &str,
    bind: Option<String>,
) -> sqlx::Result<u64> {
    let sql = format!(
        "with target as (select id from enquiries where anonymized_at is null and {filter_sql}),
              notes as (delete from enquiry_notes where enquiry_id in (select id from target))
         update enquiries set name = 'Removed', phone = '', phone_normalized = '', email = null, city = null, message = null,
                details = '{{}}'::jsonb, source_page = null, idempotency_key = null, request_hash = null, anonymized_at = now()
         where id in (select id from target)"
    );
    let mut q = sqlx::query(&sql);
    if let Some(b) = bind {
        q = q.bind(b);
    }
    Ok(q.execute(&mut *conn).await?.rows_affected())
}

async fn anonymize_applications(
    state: &AppState,
    conn: &mut PgConnection,
    filter_sql: &str,
    bind: Option<String>,
) -> anyhow::Result<u64> {
    let sql = format!(
        "select id, resume_file_id from job_applications where anonymized_at is null and {filter_sql} for update"
    );
    let mut q = sqlx::query(&sql);
    if let Some(b) = bind.clone() {
        q = q.bind(b);
    }
    let rows = q.fetch_all(&mut *conn).await?;
    for r in &rows {
        let id: Uuid = r.get("id");
        if let Some(file) = r.get::<Option<Uuid>, _>("resume_file_id") {
            let _ =
                tokio::fs::remove_file(state.config.private_root.join(format!("{file}.pdf"))).await;
            sqlx::query("update private_files set deleted_at = now() where id = $1")
                .bind(file)
                .execute(&mut *conn)
                .await?;
        }
        sqlx::query(
            "update job_applications set name = 'Removed', phone = '', phone_normalized = '', email = null, city = null, message = null,
                 resume_file_id = null, idempotency_key = null, request_hash = null, anonymized_at = now() where id = $1",
        )
        .bind(id)
        .execute(&mut *conn)
        .await?;
        sqlx::query(
            "update application_events set note = null where application_id = $1 and kind = 'note'",
        )
        .bind(id)
        .execute(&mut *conn)
        .await?;
    }
    Ok(rows.len() as u64)
}

/// Daily job: anonymise records whose retention date has passed.
pub async fn run_retention(state: &AppState) -> anyhow::Result<()> {
    let mut tx = state.db.begin().await?;
    let today = "retention_until < (now() at time zone 'Asia/Kolkata')::date";
    let leads = anonymize_enquiries(&mut tx, today, None).await?;
    let apps = anonymize_applications(state, &mut tx, today, None).await?;
    sqlx::query("delete from login_attempts where at < now() - interval '90 days'")
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "delete from sessions where coalesce(revoked_at, expires_at) < now() - interval '90 days'",
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query("delete from auth_tokens where expires_at < now() - interval '30 days'")
        .execute(&mut *tx)
        .await?;
    sqlx::query("delete from preview_grants where expires_at < now() - interval '1 day'")
        .execute(&mut *tx)
        .await?;
    sqlx::query("delete from preview_sessions where expires_at < now() - interval '1 day'")
        .execute(&mut *tx)
        .await?;
    if leads + apps > 0 {
        audit::record(
            &mut *tx,
            &Actor::system("retention"),
            "privacy.retention_run",
            "system",
            "retention",
            Outcome::Success,
            json!({ "enquiries": leads, "applications": apps }),
        )
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

async fn list(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    user.require("settings.manage")?;
    let rows = sqlx::query("select d.id, d.kind, d.status, d.notes, d.created_at, d.completed_at, u.name from data_requests d left join users u on u.id = d.created_by order by d.created_at desc limit 200")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(json!({ "data": rows.iter().map(|r| json!({
        "id": r.get::<Uuid, _>("id"), "kind": r.get::<String, _>("kind"), "status": r.get::<String, _>("status"),
        "notes": r.get::<Option<String>, _>("notes"), "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
        "completed_at": r.get::<Option<chrono::DateTime<chrono::Utc>>, _>("completed_at"), "created_by": r.get::<Option<String>, _>("name"),
    })).collect::<Vec<_>>() })))
}

#[derive(Deserialize)]
struct NewRequest {
    kind: String,
    phone: Option<String>,
    email: Option<String>,
    notes: Option<String>,
}

async fn create(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(b): Json<NewRequest>,
) -> AppResult<Json<Value>> {
    user.require("settings.manage")?;
    if !["access", "correction", "deletion"].contains(&b.kind.as_str()) {
        return Err(AppError::field(
            "kind",
            "Choose access, correction or deletion.",
        ));
    }
    let phone = b
        .phone
        .as_deref()
        .filter(|p| !p.trim().is_empty())
        .map(|p| {
            normalize_phone(p)
                .ok_or_else(|| AppError::field("phone", "Enter a valid phone number."))
        })
        .transpose()?;
    let email = b
        .email
        .as_deref()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty());
    if email.as_ref().is_some_and(|e| !valid_email(e)) {
        return Err(AppError::field("email", "Enter a valid email address."));
    }
    if phone.is_none() && email.is_none() {
        return Err(AppError::field(
            "phone",
            "Enter the person's phone number or email.",
        ));
    }
    let id: Uuid = sqlx::query_scalar("insert into data_requests (kind, subject_phone, subject_email, notes, created_by) values ($1, $2, $3, $4, $5) returning id")
        .bind(&b.kind)
        .bind(&phone)
        .bind(&email)
        .bind(b.notes.as_deref().map(clean_multiline))
        .bind(user.id)
        .fetch_one(&state.db)
        .await?;
    let matches: (i64, i64) = sqlx::query_as(
        "select (select count(*) from enquiries where anonymized_at is null and (phone_normalized = $1 or email = $2)),
                (select count(*) from job_applications where anonymized_at is null and (phone_normalized = $1 or email = $2))",
    )
    .bind(&phone)
    .bind(&email)
    .fetch_one(&state.db)
    .await?;
    audit::record(
        &state.db,
        &user.actor(),
        "privacy.request_created",
        "data_request",
        id,
        Outcome::Success,
        json!({ "kind": b.kind }),
    )
    .await?;
    Ok(Json(
        json!({ "data": { "id": id, "matching_enquiries": matches.0, "matching_applications": matches.1 } }),
    ))
}

#[derive(Deserialize)]
struct CompleteBody {
    anonymize: bool,
    notes: Option<String>,
}

async fn complete(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<CompleteBody>,
) -> AppResult<Json<Value>> {
    user.require("settings.manage")?;
    user.require_recent_auth()?;
    let mut tx = state.db.begin().await?;
    let (kind, phone, email): (String, Option<String>, Option<String>) =
        sqlx::query_as("select kind, subject_phone, subject_email from data_requests where id = $1 and status = 'open' for update")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(AppError::not_found)?;
    let mut counts = (0u64, 0u64);
    if b.anonymize {
        if kind != "deletion" {
            return Err(AppError::conflict(
                "wrong_kind",
                "Only deletion requests remove personal data.",
            ));
        }
        for (col, val) in [("phone_normalized", phone), ("email", email)] {
            if let Some(v) = val {
                let filter = format!("{col} = $1");
                counts.0 += anonymize_enquiries(&mut tx, &filter, Some(v.clone())).await?;
                counts.1 += anonymize_applications(&state, &mut tx, &filter, Some(v))
                    .await
                    .map_err(AppError::internal)?;
            }
        }
    }
    sqlx::query("update data_requests set status = 'completed', completed_at = now(), subject_phone = null, subject_email = null, notes = coalesce($2, notes) where id = $1")
        .bind(id)
        .bind(b.notes.as_deref().map(clean_multiline))
        .execute(&mut *tx)
        .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "privacy.request_completed",
        "data_request",
        id,
        Outcome::Success,
        json!({ "anonymized_enquiries": counts.0, "anonymized_applications": counts.1 }),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({ "data": { "anonymized_enquiries": counts.0, "anonymized_applications": counts.1 } }),
    ))
}
