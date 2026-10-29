//! Operational settings (app_settings) and the system status screen. Organisation details shown on
//! the website are content (collection "settings") and go through the normal publishing workflow.
//! Secrets (SMTP password, keys) live only in the deployment environment and are never returned.

use std::collections::BTreeMap;

use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{get, post, put},
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use sqlx::PgConnection;

use crate::{
    audit::{self, Outcome},
    auth::CurrentUser,
    error::{AppError, AppResult, FieldErrors},
    jobs,
    mail::OutgoingEmail,
    state::AppState,
    text::valid_email,
};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Notifications {
    pub default_recipients: Vec<String>,
    pub by_kind: BTreeMap<String, Vec<String>>,
    pub application_recipients: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Privacy {
    pub lead_retention_months: u16,
    pub application_retention_months: u16,
    pub export_expiry_hours: u16,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Publishing {
    pub timezone: String,
    pub rate_expiry_warning_days: u16,
    pub release_retention: u16,
    pub batch_seconds: u16,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Access {
    pub idle_timeout_minutes: u16,
    pub absolute_timeout_hours: u16,
    pub office_networks: Vec<String>,
}

async fn get_setting<T: DeserializeOwned>(conn: &mut PgConnection, key: &str) -> AppResult<T> {
    let v: Value = sqlx::query_scalar("select value from app_settings where key = $1")
        .bind(key)
        .fetch_one(&mut *conn)
        .await?;
    serde_json::from_value(v)
        .map_err(|e| AppError::internal(anyhow::anyhow!("setting {key} is malformed: {e}")))
}

pub async fn notifications(conn: &mut PgConnection) -> AppResult<Notifications> {
    get_setting(conn, "notifications").await
}
pub async fn privacy(conn: &mut PgConnection) -> AppResult<Privacy> {
    get_setting(conn, "privacy").await
}
pub async fn publishing(conn: &mut PgConnection) -> AppResult<Publishing> {
    get_setting(conn, "publishing").await
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/settings", get(all))
        .route("/settings/{key}", put(update))
        .route("/settings/test-email", post(test_email))
        .route("/system/status", get(status))
}

async fn all(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    user.require("settings.manage")?;
    let rows: Vec<(String, Value)> = sqlx::query_as("select key, value from app_settings where key in ('notifications','privacy','publishing','access') order by key")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(json!({ "data": {
        "values": rows.into_iter().collect::<BTreeMap<_, _>>(),
        "smtp_configured": state.mailer.is_configured(),
        "activation_driver": match state.config.activation { crate::config::ActivationDriver::File => "file", crate::config::ActivationDriver::Caddy { .. } => "caddy" },
        "session": { "idle_timeout_minutes": crate::auth::IDLE_TIMEOUT.num_minutes(), "absolute_timeout_hours": crate::auth::ABSOLUTE_TIMEOUT.num_hours() },
    }})))
}

fn check_emails(list: &[String], field: &str, errors: &mut FieldErrors) {
    for e in list {
        if !valid_email(e) {
            errors.add(field, format!("{e} is not a valid email address."));
        }
    }
}

async fn update(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(key): Path<String>,
    Json(body): Json<Value>,
) -> AppResult<Json<Value>> {
    user.require("settings.manage")?;
    let mut errors = FieldErrors::new();
    let value = match key.as_str() {
        "notifications" => {
            let n: Notifications = serde_json::from_value(body)
                .map_err(|e| AppError::bad_request(format!("Invalid settings: {e}")))?;
            check_emails(&n.default_recipients, "defaultRecipients", &mut errors);
            check_emails(
                &n.application_recipients,
                "applicationRecipients",
                &mut errors,
            );
            for (kind, list) in &n.by_kind {
                if !crate::enquiries::KINDS.contains(&kind.as_str()) {
                    errors.add("byKind", format!("Unknown enquiry type {kind}."));
                }
                check_emails(list, "byKind", &mut errors);
            }
            serde_json::to_value(n)?
        }
        "privacy" => {
            let p: Privacy = serde_json::from_value(body)
                .map_err(|e| AppError::bad_request(format!("Invalid settings: {e}")))?;
            if !(1..=120).contains(&p.lead_retention_months) {
                errors.add("leadRetentionMonths", "Choose between 1 and 120 months.");
            }
            if !(1..=120).contains(&p.application_retention_months) {
                errors.add(
                    "applicationRetentionMonths",
                    "Choose between 1 and 120 months.",
                );
            }
            if !(1..=720).contains(&p.export_expiry_hours) {
                errors.add("exportExpiryHours", "Choose between 1 and 720 hours.");
            }
            serde_json::to_value(p)?
        }
        "publishing" => {
            let p: Publishing = serde_json::from_value(body)
                .map_err(|e| AppError::bad_request(format!("Invalid settings: {e}")))?;
            if p.timezone != "Asia/Kolkata" {
                errors.add("timezone", "Only Asia/Kolkata is supported.");
            }
            if !(1..=120).contains(&p.rate_expiry_warning_days) {
                errors.add("rateExpiryWarningDays", "Choose between 1 and 120 days.");
            }
            if !(3..=50).contains(&p.release_retention) {
                errors.add("releaseRetention", "Keep between 3 and 50 releases.");
            }
            if p.batch_seconds > 600 {
                errors.add("batchSeconds", "Use at most 600 seconds.");
            }
            serde_json::to_value(p)?
        }
        "access" => {
            user.require_recent_auth()?;
            let a: Access = serde_json::from_value(body)
                .map_err(|e| AppError::bad_request(format!("Invalid settings: {e}")))?;
            for net in &a.office_networks {
                if net.parse::<sqlx::types::ipnetwork::IpNetwork>().is_err() {
                    errors.add(
                        "officeNetworks",
                        format!("{net} is not a valid network (e.g. 203.0.113.0/24)."),
                    );
                }
            }
            serde_json::to_value(a)?
        }
        _ => return Err(AppError::not_found()),
    };
    errors.into_result()?;
    let before: Value = sqlx::query_scalar("select value from app_settings where key = $1")
        .bind(&key)
        .fetch_one(&state.db)
        .await?;
    sqlx::query(
        "update app_settings set value = $2, updated_by = $3, updated_at = now() where key = $1",
    )
    .bind(&key)
    .bind(&value)
    .bind(user.id)
    .execute(&state.db)
    .await?;
    audit::record(
        &state.db,
        &user.actor(),
        "settings.updated",
        "setting",
        &key,
        Outcome::Success,
        json!({ "before": before, "after": value }),
    )
    .await?;
    Ok(Json(json!({ "data": value })))
}

#[derive(Deserialize)]
struct TestEmail {
    to: String,
}

async fn test_email(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(b): Json<TestEmail>,
) -> AppResult<Json<Value>> {
    user.require("settings.manage")?;
    if !valid_email(&b.to) {
        return Err(AppError::field("to", "Enter a valid email address."));
    }
    let mut tx = state.db.begin().await?;
    let id = jobs::enqueue_email(
        &mut tx,
        &OutgoingEmail {
            to: vec![b.to.clone()],
            subject: "Lokmangal admin: test email".into(),
            text: format!(
                "This is a test message sent by {} from the admin panel settings.",
                user.name
            ),
        },
    )
    .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "settings.test_email",
        "job",
        id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "data": { "job_id": id } })))
}

async fn status(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    user.require("system.health")?;
    let jobs: Vec<(String, i64)> = sqlx::query_as("select status, count(*) from jobs where updated_at > now() - interval '7 days' group by status")
        .fetch_all(&state.db)
        .await?;
    let failures = sqlx::query_as::<_, (String, Option<String>, chrono::DateTime<chrono::Utc>)>(
        "select kind, last_error, updated_at from jobs where status = 'failed' order by updated_at desc limit 10",
    )
    .fetch_all(&state.db)
    .await?;
    let oldest_due: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "select min(run_at) from jobs where status = 'queued' and run_at <= now()",
    )
    .fetch_one(&state.db)
    .await?;
    let backup: Option<Value> =
        sqlx::query_scalar("select value from app_settings where key = 'backup_status'")
            .fetch_optional(&state.db)
            .await?;
    Ok(Json(json!({ "data": {
        "jobs": jobs.into_iter().collect::<BTreeMap<_, _>>(),
        "oldest_due_job": oldest_due,
        "recent_failures": failures.into_iter().map(|(k, e, at)| json!({ "kind": k, "error": e, "at": at })).collect::<Vec<_>>(),
        "smtp_configured": state.mailer.is_configured(),
        "backup": backup,
        "version": { "commit": state.config.source_commit, "builder_image": state.config.builder_image },
    }})))
}
