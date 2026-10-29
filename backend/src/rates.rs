//! Interest rate sets: numeric, versioned, validated for slab gaps and overlaps, and approved by an
//! independent checker before they can reach the public site.

use std::collections::{BTreeMap, BTreeSet};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgConnection, Row};
use uuid::Uuid;

use crate::{
    audit::{self, Outcome},
    auth::CurrentUser,
    content::tokens,
    error::{AppError, AppResult, FieldErrors},
    notifications,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/rate-sets", get(list).post(create))
        .route("/rate-sets/{id}", get(detail).patch(save))
        .route("/rate-sets/{id}/revise", post(revise))
        .route("/rate-sets/{id}/submit", post(submit))
}

#[derive(Serialize, Deserialize, FromRow, Clone, Debug, PartialEq)]
pub struct Entry {
    pub key: String,
    pub section: String,
    pub label: String,
    pub category: Option<String>,
    pub tenure_min_days: Option<i32>,
    pub tenure_max_days: Option<i32>,
    #[serde(with = "rust_decimal::serde::str")]
    pub value: Decimal,
    pub unit: String,
    pub sort_order: i32,
}

pub async fn entries(conn: &mut PgConnection, rate_set_id: Uuid) -> sqlx::Result<Vec<Entry>> {
    sqlx::query_as("select key, section, label, category, tenure_min_days, tenure_max_days, value, unit, sort_order from rate_entries where rate_set_id = $1 order by sort_order, key")
        .bind(rate_set_id)
        .fetch_all(&mut *conn)
        .await
}

/// Today in IST, the calendar the society's rate periods use.
pub fn today_ist() -> NaiveDate {
    Utc::now()
        .with_timezone(&chrono_tz::Asia::Kolkata)
        .date_naive()
}

/// The approved set whose [valid_from, valid_until) contains `date`.
pub async fn approved_for(conn: &mut PgConnection, date: NaiveDate) -> sqlx::Result<Option<Uuid>> {
    sqlx::query_scalar("select id from rate_sets where status = 'approved' and valid_from <= $1 and valid_until > $1").bind(date).fetch_optional(&mut *conn).await
}

/// Structural checks: units, ranges, unique keys and continuous, non-overlapping FD slabs per category.
pub fn validate_entries(entries: &[Entry]) -> FieldErrors {
    let mut e = FieldErrors::new();
    let key_re = regex::Regex::new(r"^[a-z0-9]+([.+_-][a-z0-9]+)*$").expect("regex");
    let mut keys = BTreeSet::new();
    for x in entries {
        if !key_re.is_match(&x.key) {
            e.add(
                format!("entries.{}", x.key),
                "Keys use lowercase letters, numbers, dots and dashes.",
            );
        }
        if !keys.insert(&x.key) {
            e.add(format!("entries.{}", x.key), "This key is used twice.");
        }
        if x.label.trim().is_empty() {
            e.add(format!("entries.{}", x.key), "Add a label.");
        }
        match x.unit.as_str() {
            "percent" if x.value < Decimal::ZERO || x.value >= Decimal::from(100) => e.add(
                format!("entries.{}", x.key),
                "Rates must be between 0 and 100%.",
            ),
            "percent" if x.value.scale() > 3 => e.add(
                format!("entries.{}", x.key),
                "Use at most three decimal places.",
            ),
            "months" if x.value.fract() != Decimal::ZERO || x.value <= Decimal::ZERO => e.add(
                format!("entries.{}", x.key),
                "Enter a whole number of months.",
            ),
            "percent" | "months" => {}
            _ => e.add(format!("entries.{}", x.key), "Unknown unit."),
        }
        if !["fd_slab", "deposit", "doubling", "loan"].contains(&x.section.as_str()) {
            e.add(format!("entries.{}", x.key), "Unknown section.");
        }
    }
    let mut by_category: BTreeMap<&str, Vec<&Entry>> = BTreeMap::new();
    for x in entries.iter().filter(|x| x.section == "fd_slab") {
        match (x.category.as_deref(), x.tenure_min_days) {
            (Some(c @ ("regular" | "special")), Some(_)) => {
                by_category.entry(c).or_default().push(x)
            }
            _ => e.add(
                format!("entries.{}", x.key),
                "FD slabs need a depositor category and a tenure.",
            ),
        }
    }
    let mut shapes = vec![];
    for (category, mut slabs) in by_category {
        slabs.sort_by_key(|s| s.tenure_min_days);
        for pair in slabs.windows(2) {
            let (a, b) = (pair[0], pair[1]);
            match a.tenure_max_days {
                None => e.add(
                    format!("entries.{}", a.key),
                    format!("Only the last {category} slab can be open-ended (“and above”)."),
                ),
                Some(max) if b.tenure_min_days.unwrap_or(0) <= max => e.add(
                    format!("entries.{}", b.key),
                    format!("Overlaps the previous {category} slab."),
                ),
                Some(max) if b.tenure_min_days.unwrap_or(0) > max + 1 => e.add(
                    format!("entries.{}", b.key),
                    format!("Leaves a gap after day {max} for {category} depositors."),
                ),
                _ => {}
            }
        }
        if slabs.last().is_some_and(|s| s.tenure_max_days.is_some()) {
            e.add(
                "entries",
                format!("The last {category} slab should be “and above”."),
            );
        }
        shapes.push(
            slabs
                .iter()
                .map(|s| (s.tenure_min_days, s.tenure_max_days))
                .collect::<Vec<_>>(),
        );
    }
    if shapes.len() == 2 && shapes[0] != shapes[1] {
        e.add(
            "entries",
            "Regular and special-category slabs must use the same tenure bands.",
        );
    }
    e
}

#[derive(FromRow)]
struct SetRow {
    id: Uuid,
    lineage_id: Uuid,
    revision: i32,
    label: String,
    valid_from: NaiveDate,
    valid_until: NaiveDate,
    status: String,
    source_document: Option<String>,
    change_reason: Option<String>,
    finance_policy: String,
    lock_version: i32,
    supersedes_id: Option<Uuid>,
    created_by: Option<Uuid>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    submitted_at: Option<DateTime<Utc>>,
}

const SET_COLUMNS: &str = "id, lineage_id, revision, label, valid_from, valid_until, status, source_document, change_reason, finance_policy, lock_version, supersedes_id, created_by, created_at, updated_at, submitted_at";

async fn load_set(conn: &mut PgConnection, id: Uuid, lock: bool) -> AppResult<SetRow> {
    sqlx::query_as::<_, SetRow>(&format!(
        "select {SET_COLUMNS} from rate_sets where id = $1{}",
        if lock { " for update" } else { "" }
    ))
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?
    .ok_or_else(AppError::not_found)
}

fn last_valid_day(d: NaiveDate) -> NaiveDate {
    d.pred_opt().unwrap_or(d)
}

async fn list(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    user.require_any(&["rates.edit", "financial.approve", "content.view"])?;
    let today = today_ist();
    let live: Option<Uuid> = sqlx::query_scalar(
        "select rate_set_id from releases where kind = 'live' and status = 'live'",
    )
    .fetch_optional(&state.db)
    .await?
    .flatten();
    let rows = sqlx::query(&format!(
        "select {}, (select count(*) from rate_entries e where e.rate_set_id = s.id) as entry_count, u.name as created_by_name
         from rate_sets s left join users u on u.id = s.created_by where s.status <> 'superseded' order by s.valid_from desc, s.revision desc"
    , SET_COLUMNS.split(", ").map(|c| format!("s.{c}")).collect::<Vec<_>>().join(", ")))
    .fetch_all(&state.db)
    .await?;
    let data: Vec<Value> = rows
        .iter()
        .map(|r| {
            let id: Uuid = r.get("id");
            let from: NaiveDate = r.get("valid_from");
            let until: NaiveDate = r.get("valid_until");
            let status: String = r.get("status");
            json!({
                "id": id, "label": r.get::<String, _>("label"), "revision": r.get::<i32, _>("revision"), "status": status,
                "valid_from": from, "valid_until": until, "last_valid_day": last_valid_day(until),
                "entries": r.get::<i64, _>("entry_count"), "created_by": r.get::<Option<String>, _>("created_by_name"),
                "updated_at": r.get::<DateTime<Utc>, _>("updated_at"),
                "current": status == "approved" && from <= today && until > today,
                "future": status == "approved" && from > today,
                "expired": until <= today,
                "live": live == Some(id),
            })
        })
        .collect();
    Ok(Json(
        json!({ "data": data, "meta": { "today": today, "can_edit": user.can("rates.edit") } }),
    ))
}

#[derive(Deserialize)]
struct CreateBody {
    from_id: Option<Uuid>,
    label: String,
    valid_from: NaiveDate,
    valid_until: NaiveDate,
    source_document: Option<String>,
    change_reason: Option<String>,
}

async fn create(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(b): Json<CreateBody>,
) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("rates.edit")?;
    if b.label.trim().is_empty() {
        return Err(AppError::field(
            "label",
            "Name the rate set, for example 2027–28.",
        ));
    }
    if b.valid_until <= b.valid_from {
        return Err(AppError::field(
            "valid_until",
            "The end date must be after the start date.",
        ));
    }
    let mut tx = state.db.begin().await?;
    let lineage = Uuid::new_v4();
    let id: Uuid = sqlx::query_scalar(
        "insert into rate_sets (lineage_id, label, valid_from, valid_until, source_document, change_reason, finance_policy, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $8) returning id",
    )
    .bind(lineage)
    .bind(b.label.trim())
    .bind(b.valid_from)
    .bind(b.valid_until)
    .bind(&b.source_document)
    .bind(&b.change_reason)
    .bind(crate::releases::FINANCE_POLICY)
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;
    if let Some(from) = b.from_id {
        let n = sqlx::query(
            "insert into rate_entries (rate_set_id, key, section, label, category, tenure_min_days, tenure_max_days, value, unit, sort_order)
             select $1, key, section, label, category, tenure_min_days, tenure_max_days, value, unit, sort_order from rate_entries where rate_set_id = $2",
        )
        .bind(id)
        .bind(from)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if n == 0 {
            return Err(AppError::field(
                "from_id",
                "The rate set to copy has no entries.",
            ));
        }
    }
    sqlx::query("insert into rate_set_contributors (rate_set_id, user_id) values ($1, $2)")
        .bind(id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "rates.created",
        "rate_set",
        id,
        Outcome::Success,
        json!({ "label": b.label, "copied_from": b.from_id }),
    )
    .await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "data": detail_json(&state, &user, id).await? })),
    ))
}

pub fn entry_diff(base: &[Entry], current: &[Entry]) -> Vec<Value> {
    let old: BTreeMap<&str, &Entry> = base.iter().map(|e| (e.key.as_str(), e)).collect();
    let new: BTreeMap<&str, &Entry> = current.iter().map(|e| (e.key.as_str(), e)).collect();
    let mut out = vec![];
    for (k, n) in &new {
        match old.get(k) {
            None => out.push(json!({ "key": k, "label": n.label, "kind": "added", "after": n.value.to_string() })),
            Some(o) if o.value != n.value || o.tenure_min_days != n.tenure_min_days || o.tenure_max_days != n.tenure_max_days => {
                out.push(json!({ "key": k, "label": n.label, "kind": "changed", "before": o.value.to_string(), "after": n.value.to_string() }))
            }
            _ => {}
        }
    }
    for (k, o) in &old {
        if !new.contains_key(k) {
            out.push(json!({ "key": k, "label": o.label, "kind": "removed", "before": o.value.to_string() }));
        }
    }
    out
}

/// The set to compare against: the one this revises, otherwise the currently active approved set.
pub async fn comparison_base(
    conn: &mut PgConnection,
    set_id: Uuid,
) -> AppResult<Option<(Uuid, String)>> {
    let row: (Option<Uuid>, String) =
        sqlx::query_as("select supersedes_id, status from rate_sets where id = $1")
            .bind(set_id)
            .fetch_one(&mut *conn)
            .await?;
    let base = match row.0 {
        Some(s) => Some(s),
        None => approved_for(conn, today_ist())
            .await?
            .filter(|b| *b != set_id),
    };
    Ok(match base {
        Some(b) => Some((
            b,
            sqlx::query_scalar("select label from rate_sets where id = $1")
                .bind(b)
                .fetch_one(&mut *conn)
                .await?,
        )),
        None => None,
    })
}

async fn detail_json(state: &AppState, user: &CurrentUser, id: Uuid) -> AppResult<Value> {
    let mut conn = state.db.acquire().await?;
    let s = load_set(&mut conn, id, false).await?;
    let current = entries(&mut conn, id).await?;
    let base = comparison_base(&mut conn, id).await?;
    let (base_entries, base_label) = match &base {
        Some((b, label)) => (entries(&mut conn, *b).await?, Some(label.clone())),
        None => (vec![], None),
    };
    let approval = sqlx::query(
        "select a.id, a.status, a.comment, a.decided_at, r.name as reviewer from approvals a left join users r on r.id = a.reviewer_id
         where a.subject_type = 'rate_set' and a.subject_id = $1 order by a.submitted_at desc limit 1",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;
    let contributors: Vec<String> = sqlx::query_scalar("select u.name from rate_set_contributors c join users u on u.id = c.user_id where c.rate_set_id = $1")
        .bind(id)
        .fetch_all(&mut *conn)
        .await?;
    let editable = s.status == "draft" || s.status == "changes_requested";
    let problems = validate_entries(&current);
    Ok(json!({
        "id": s.id, "lineage_id": s.lineage_id, "revision": s.revision, "label": s.label, "status": s.status,
        "valid_from": s.valid_from, "valid_until": s.valid_until, "last_valid_day": last_valid_day(s.valid_until),
        "source_document": s.source_document, "change_reason": s.change_reason, "finance_policy": s.finance_policy,
        "lock_version": s.lock_version, "supersedes_id": s.supersedes_id, "created_at": s.created_at, "updated_at": s.updated_at,
        "submitted_at": s.submitted_at, "contributors": contributors,
        "entries": current,
        "comparison": { "label": base_label, "changes": entry_diff(&base_entries, &current) },
        "validation": problems.0,
        "approval": approval.map(|a| json!({ "id": a.get::<Uuid, _>("id"), "status": a.get::<String, _>("status"), "comment": a.get::<Option<String>, _>("comment"), "decided_at": a.get::<Option<DateTime<Utc>>, _>("decided_at"), "reviewer": a.get::<Option<String>, _>("reviewer") })),
        "allowed": {
            "edit": editable && user.can("rates.edit"),
            "submit": editable && user.can("rates.edit"),
            "revise": !editable && s.status != "superseded" && user.can("rates.edit"),
        },
        "created_by_me": s.created_by == Some(user.id),
    }))
}

async fn detail(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    user.require_any(&["rates.edit", "financial.approve", "content.view"])?;
    Ok(Json(
        json!({ "data": detail_json(&state, &user, id).await? }),
    ))
}

#[derive(Deserialize)]
struct SaveBody {
    lock_version: i32,
    label: String,
    valid_from: NaiveDate,
    valid_until: NaiveDate,
    source_document: Option<String>,
    change_reason: Option<String>,
    entries: Vec<Entry>,
}

async fn save(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<SaveBody>,
) -> AppResult<Json<Value>> {
    user.require("rates.edit")?;
    let mut tx = state.db.begin().await?;
    let s = load_set(&mut tx, id, true).await?;
    if s.status != "draft" && s.status != "changes_requested" {
        return Err(AppError::conflict(
            "not_editable",
            "This rate set was submitted or approved. Create a new revision to change it.",
        ));
    }
    if s.lock_version != b.lock_version {
        return Err(AppError::conflict(
            "edit_conflict",
            "Someone else saved this rate set after you opened it. Reload to see their changes.",
        ));
    }
    if b.valid_until <= b.valid_from {
        return Err(AppError::field(
            "valid_until",
            "The end date must be after the start date.",
        ));
    }
    // Shape problems are saved as a draft and shown inline; they block submission, not saving.
    sqlx::query(
        "update rate_sets set label = $2, valid_from = $3, valid_until = $4, source_document = $5, change_reason = $6,
             status = 'draft', lock_version = lock_version + 1, updated_by = $7, updated_at = now() where id = $1",
    )
    .bind(id)
    .bind(b.label.trim())
    .bind(b.valid_from)
    .bind(b.valid_until)
    .bind(b.source_document.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(b.change_reason.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(user.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("delete from rate_entries where rate_set_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for (i, e) in b.entries.iter().enumerate() {
        sqlx::query(
            "insert into rate_entries (rate_set_id, key, section, label, category, tenure_min_days, tenure_max_days, value, unit, sort_order)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(id)
        .bind(e.key.trim())
        .bind(&e.section)
        .bind(e.label.trim())
        .bind(&e.category)
        .bind(e.tenure_min_days)
        .bind(e.tenure_max_days)
        .bind(e.value)
        .bind(&e.unit)
        .bind(i as i32)
        .execute(&mut *tx)
        .await
        .map_err(|err| match AppError::from(err) {
            x if x.code == "invalid_data" || x.code == "already_exists" => AppError::field(format!("entries.{}", e.key).as_str(), "This row is not valid (check the key, unit and tenure)."),
            x => x,
        })?;
    }
    sqlx::query("insert into rate_set_contributors (rate_set_id, user_id) values ($1, $2) on conflict do nothing").bind(id).bind(user.id).execute(&mut *tx).await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "rates.saved",
        "rate_set",
        id,
        Outcome::Success,
        json!({ "entries": b.entries.len() }),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({ "data": detail_json(&state, &user, id).await? }),
    ))
}

/// Starts a new draft revision of a submitted or approved set; the original stays untouched.
async fn revise(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("rates.edit")?;
    let mut tx = state.db.begin().await?;
    let s = load_set(&mut tx, id, true).await?;
    if s.status == "draft" || s.status == "changes_requested" || s.status == "superseded" {
        return Err(AppError::conflict(
            "not_revisable",
            "Edit the existing draft instead.",
        ));
    }
    let open: Option<Uuid> = sqlx::query_scalar("select id from rate_sets where lineage_id = $1 and status in ('draft','changes_requested','in_review') and id <> $2")
        .bind(s.lineage_id)
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    if let Some(other) = open {
        return Err(AppError::conflict(
            "draft_exists",
            "A newer revision of this rate set is already in progress.",
        )
        .with_extra(json!({ "id": other })));
    }
    let next: i32 =
        sqlx::query_scalar("select max(revision) + 1 from rate_sets where lineage_id = $1")
            .bind(s.lineage_id)
            .fetch_one(&mut *tx)
            .await?;
    let new_id: Uuid = sqlx::query_scalar(
        "insert into rate_sets (lineage_id, revision, label, valid_from, valid_until, source_document, change_reason, finance_policy, supersedes_id, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, null, $7, $8, $9, $9) returning id",
    )
    .bind(s.lineage_id)
    .bind(next)
    .bind(&s.label)
    .bind(s.valid_from)
    .bind(s.valid_until)
    .bind(&s.source_document)
    .bind(crate::releases::FINANCE_POLICY)
    .bind(id)
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "insert into rate_entries (rate_set_id, key, section, label, category, tenure_min_days, tenure_max_days, value, unit, sort_order)
         select $1, key, section, label, category, tenure_min_days, tenure_max_days, value, unit, sort_order from rate_entries where rate_set_id = $2",
    )
    .bind(new_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if s.status == "in_review" {
        sqlx::query("update approvals set status = 'withdrawn' where subject_type = 'rate_set' and subject_id = $1 and status = 'pending'").bind(id).execute(&mut *tx).await?;
        sqlx::query("update rate_sets set status = 'superseded' where id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("insert into rate_set_contributors (rate_set_id, user_id) values ($1, $2)")
        .bind(new_id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "rates.revised",
        "rate_set",
        new_id,
        Outcome::Success,
        json!({ "from": id, "revision": next }),
    )
    .await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "data": detail_json(&state, &user, new_id).await? })),
    ))
}

/// Keys used by approved or released product content: a rate set must provide all of them.
pub async fn keys_used_by_products(conn: &mut PgConnection) -> AppResult<BTreeSet<String>> {
    let docs: Vec<Value> = sqlx::query_scalar(
        "select r.data from content_items i
         join content_revisions r on r.id in (i.live_revision_id, i.draft_revision_id)
         where i.collection in ('deposit_scheme', 'loan', 'deposit_page', 'loan_page') and i.archived_at is null
           and r.status in ('approved', 'released', 'in_review')",
    )
    .fetch_all(&mut *conn)
    .await?;
    let mut keys = BTreeSet::new();
    for d in &docs {
        keys.extend(tokens::scan(d).rate_keys);
        for k in ["rateKey"] {
            if let Some(s) = d.get(k).and_then(Value::as_str) {
                keys.insert(s.to_owned());
            }
        }
        if let Some(s) = d.pointer("/calc/rateKey").and_then(Value::as_str) {
            keys.insert(s.to_owned());
        }
    }
    Ok(keys)
}

#[derive(Deserialize)]
struct SubmitBody {
    note: Option<String>,
}

async fn submit(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<SubmitBody>,
) -> AppResult<Json<Value>> {
    user.require("rates.edit")?;
    let mut tx = state.db.begin().await?;
    let s = load_set(&mut tx, id, true).await?;
    if s.status != "draft" && s.status != "changes_requested" {
        return Err(AppError::conflict(
            "not_a_draft",
            "Only drafts can be submitted for approval.",
        ));
    }
    let current = entries(&mut tx, id).await?;
    let mut problems = validate_entries(&current);
    if current.is_empty() {
        problems.add("entries", "Add the rates before submitting.");
    }
    if s.source_document
        .as_deref()
        .is_none_or(|d| d.trim().is_empty())
    {
        problems.add("source_document", "Name the approved source document (for example “Board resolution 12/2027, scheme leaflet 2027–28”).");
    }
    if s.change_reason
        .as_deref()
        .is_none_or(|d| d.trim().is_empty())
    {
        problems.add("change_reason", "Explain why the rates are changing.");
    }
    let have: BTreeSet<&str> = current.iter().map(|e| e.key.as_str()).collect();
    let missing: Vec<String> = keys_used_by_products(&mut tx)
        .await?
        .into_iter()
        .filter(|k| !have.contains(k.as_str()))
        .collect();
    if !missing.is_empty() {
        problems.add(
            "entries",
            format!(
                "Published products use these keys, which this set does not include: {}",
                missing.join(", ")
            ),
        );
    }
    problems.into_result()?;
    sqlx::query("update rate_sets set status = 'in_review', submitted_by = $2, submitted_at = now() where id = $1").bind(id).bind(user.id).execute(&mut *tx).await?;
    let approval_id: Uuid = sqlx::query_scalar("insert into approvals (subject_type, subject_id, submitted_by, submit_note) values ('rate_set', $1, $2, $3) returning id")
        .bind(id)
        .bind(user.id)
        .bind(b.note.as_deref().map(str::trim).filter(|n| !n.is_empty()))
        .fetch_one(&mut *tx)
        .await?;
    notifications::to_permission(
        &mut tx,
        "financial.approve",
        "approval_requested",
        &format!("Rate set “{}” needs review", s.label),
        &format!("Submitted by {}", user.name),
        Some(&format!("/approvals/{approval_id}")),
        Some(user.id),
    )
    .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "rates.submitted",
        "rate_set",
        id,
        Outcome::Success,
        json!({ "approval_id": approval_id }),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({ "data": detail_json(&state, &user, id).await? }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slab(key: &str, cat: &str, min: i32, max: Option<i32>, v: &str) -> Entry {
        Entry {
            key: key.into(),
            section: "fd_slab".into(),
            label: key.into(),
            category: Some(cat.into()),
            tenure_min_days: Some(min),
            tenure_max_days: max,
            value: v.parse().unwrap(),
            unit: "percent".into(),
            sort_order: 0,
        }
    }

    #[test]
    fn continuous_slabs_pass() {
        let e = vec![
            slab("a.r", "regular", 7, Some(30), "3.5"),
            slab("b.r", "regular", 31, None, "5"),
            slab("a.s", "special", 7, Some(30), "4"),
            slab("b.s", "special", 31, None, "5.5"),
        ];
        assert!(validate_entries(&e).is_empty());
    }

    #[test]
    fn gaps_overlaps_and_bad_values_fail() {
        let gap = vec![
            slab("a", "regular", 7, Some(30), "3.5"),
            slab("b", "regular", 40, None, "5"),
        ];
        assert!(!validate_entries(&gap).is_empty());
        let overlap = vec![
            slab("a", "regular", 7, Some(30), "3.5"),
            slab("b", "regular", 20, None, "5"),
        ];
        assert!(!validate_entries(&overlap).is_empty());
        let big = vec![slab("a", "regular", 7, None, "120")];
        assert!(!validate_entries(&big).is_empty());
        let mismatch = vec![
            slab("a.r", "regular", 7, None, "3"),
            slab("a.s", "special", 1, None, "3"),
        ];
        assert!(!validate_entries(&mismatch).is_empty());
    }

    #[test]
    fn diff_lists_changes() {
        let a = vec![slab("x", "regular", 7, None, "3.50")];
        let b = vec![
            slab("x", "regular", 7, None, "3.75"),
            slab("y", "special", 7, None, "4"),
        ];
        let d = entry_diff(&a, &b);
        assert_eq!(d.len(), 2);
        assert_eq!(d[0]["kind"], "changed");
    }
}
