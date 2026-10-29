//! Audit trail. Records who did what to which record — never passwords, tokens, TOTP seeds,
//! résumé contents or full personal data (pass references and field names instead).

use std::net::IpAddr;

use serde_json::Value;
use sqlx::PgExecutor;
use uuid::Uuid;

use crate::state::{ClientMeta, ip_network};

#[derive(Clone, Debug)]
pub struct Actor {
    pub user_id: Option<Uuid>,
    pub label: String,
    pub ip: Option<IpAddr>,
    pub request_id: Option<String>,
}

impl Actor {
    pub fn system(label: &str) -> Self {
        Self {
            user_id: None,
            label: label.to_owned(),
            ip: None,
            request_id: None,
        }
    }
    pub fn anonymous(meta: &ClientMeta) -> Self {
        Self {
            user_id: None,
            label: "public".into(),
            ip: meta.ip,
            request_id: meta.request_id.clone(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Outcome {
    Success,
    Denied,
    Failure,
}

impl Outcome {
    fn as_str(self) -> &'static str {
        match self {
            Outcome::Success => "success",
            Outcome::Denied => "denied",
            Outcome::Failure => "failure",
        }
    }
}

pub async fn record<'e>(
    db: impl PgExecutor<'e>,
    actor: &Actor,
    action: &str,
    entity_type: &str,
    entity_id: impl ToString,
    outcome: Outcome,
    details: Value,
) -> sqlx::Result<()> {
    sqlx::query(
        "insert into audit_events (actor_id, actor_label, action, entity_type, entity_id, outcome, request_id, ip, details)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(actor.user_id)
    .bind(&actor.label)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id.to_string())
    .bind(outcome.as_str())
    .bind(&actor.request_id)
    .bind(ip_network(actor.ip))
    .bind(details)
    .execute(db)
    .await?;
    Ok(())
}

/// Logs to the audit table, but never lets an audit write failure hide the original outcome:
/// failures are reported loudly in the service log (monitored, see docs/runbook.md).
pub async fn record_best_effort<'e>(
    db: impl PgExecutor<'e>,
    actor: &Actor,
    action: &str,
    entity_type: &str,
    entity_id: impl ToString,
    outcome: Outcome,
    details: Value,
) {
    if let Err(e) = record(db, actor, action, entity_type, entity_id, outcome, details).await {
        tracing::error!(error = %e, action, "AUDIT WRITE FAILED");
    }
}
