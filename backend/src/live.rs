//! Reads choices from the release that is currently live, so public forms only accept products,
//! branches and jobs that visitors can actually see.

use serde_json::Value;
use sqlx::PgPool;

use crate::error::AppResult;

#[derive(Debug, Clone, Default)]
pub struct FormOptions {
    pub deposit_types: Vec<String>,
    pub loan_types: Vec<String>,
    pub branch_codes: Vec<String>,
    pub jobs: Vec<String>,
}

/// None when nothing has been published through the admin system yet (validation then falls back to
/// basic checks only).
pub async fn form_options(db: &PgPool) -> AppResult<Option<FormOptions>> {
    let row: Option<(Value, Value, Value, Value, Value)> = sqlx::query_as(
        "select
            coalesce((select jsonb_agg(i->'data'->'name') from jsonb_array_elements(snapshot->'collections'->'deposit_scheme') i), '[]'),
            coalesce((select jsonb_agg(i->'data'->'name') from jsonb_array_elements(snapshot->'collections'->'loan') i
                      where coalesce((i->'data'->>'showInForm')::boolean, true)), '[]'),
            coalesce(snapshot->'singletons'->'loan_page'->'extraFormTypes', '[]'),
            coalesce((select jsonb_agg(upper(i->'data'->>'code')) from jsonb_array_elements(snapshot->'collections'->'branch') i
                      where coalesce((i->'data'->>'active')::boolean, true)), '[]'),
            coalesce((select jsonb_agg(i->'data'->'title') from jsonb_array_elements(snapshot->'collections'->'job_opening') i
                      where coalesce((i->'data'->>'open')::boolean, false)), '[]')
         from releases where kind = 'live' and status = 'live'",
    )
    .fetch_optional(db)
    .await?;
    let strings = |v: Value| -> Vec<String> { serde_json::from_value(v).unwrap_or_default() };
    Ok(row.map(|(deposits, loans, extra, branches, jobs)| {
        let mut loan_types = strings(loans);
        loan_types.extend(strings(extra));
        FormOptions {
            deposit_types: strings(deposits),
            loan_types,
            branch_codes: strings(branches),
            jobs: strings(jobs),
        }
    }))
}
