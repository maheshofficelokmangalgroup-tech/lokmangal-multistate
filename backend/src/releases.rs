//! Releases: a frozen, allow-listed snapshot of approved public content and one rate set, built by the
//! Astro builder into an immutable folder, validated, then activated by the release controller.
//! Saving or approving content never changes the live site; only a successful activation does.

use std::collections::{BTreeMap, BTreeSet};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use chrono_tz::Asia::Kolkata;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use sqlx::{PgConnection, Row};
use uuid::Uuid;

use crate::{
    activation,
    audit::{self, Actor, Outcome},
    auth::CurrentUser,
    content::{collections, media_version_refs, tokens},
    error::{AppError, AppResult},
    jobs, notifications, rates,
    security::{constant_time_eq, sha256_hex},
    settings,
    state::AppState,
};

/// Must equal FINANCE_POLICY_VERSION in packages/finance/src/index.ts (checked by a test).
pub const FINANCE_POLICY: &str = "lmcs-fin-2026.1";
pub const SCHEMA_VERSION: i32 = 1;

pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/publish/pending", get(pending))
        .route("/previews", post(create_preview))
        .route("/releases", get(list).post(create_live))
        .route("/releases/{id}", get(detail))
        .route("/releases/{id}/activate", post(activate_now))
        .route("/releases/{id}/schedule", post(schedule))
        .route("/releases/{id}/cancel", post(cancel))
        .route("/releases/{id}/rollback", post(rollback))
}

pub fn internal_router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/internal/releases/{id}/snapshot",
            get(internal_snapshot),
        )
        .route("/api/internal/builds/{id}/status", post(internal_status))
}

// ------------------------------------------------------------------------------------------------
// Snapshot assembly
// ------------------------------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Preview,
    Live,
}

impl Kind {
    fn as_str(self) -> &'static str {
        match self {
            Kind::Preview => "preview",
            Kind::Live => "live",
        }
    }
}

pub struct SnapshotPlan {
    pub snapshot: Value,
    pub content_hash: String,
    pub rate_set_id: Uuid,
    pub items: Vec<(Uuid, Uuid, bool)>,
    pub warnings: Vec<String>,
}

/// `selected`: revision ids chosen by the publisher. Preview with `all_drafts` uses every current draft.
pub async fn plan_snapshot(
    conn: &mut PgConnection,
    kind: Kind,
    selected: &BTreeSet<Uuid>,
    all_drafts: bool,
    rate_set: Option<Uuid>,
    effective_at: DateTime<Utc>,
) -> AppResult<SnapshotPlan> {
    let rows = sqlx::query(
        "select i.id, i.collection, i.slug, i.archived_at is not null as archived, i.draft_revision_id, i.live_revision_id,
                d.status as draft_status, d.data as draft_data, l.data as live_data
         from content_items i join content_revisions d on d.id = i.draft_revision_id left join content_revisions l on l.id = i.live_revision_id
         order by i.collection, i.slug",
    )
    .fetch_all(&mut *conn)
    .await?;
    // Selected revisions may be older than the draft (an approved revision while a newer draft is edited).
    let chosen: Vec<(Uuid, Uuid, String, Value)> = sqlx::query_as(
        "select id, item_id, status, data from content_revisions where id = any($1)",
    )
    .bind(selected.iter().copied().collect::<Vec<_>>())
    .fetch_all(&mut *conn)
    .await?;
    let chosen_by_item: BTreeMap<Uuid, (Uuid, String, Value)> = chosen
        .into_iter()
        .map(|(id, item, status, data)| (item, (id, status, data)))
        .collect();
    if chosen_by_item.len() != selected.len() {
        return Err(AppError::unprocessable(
            "unknown_revision",
            "Some selected changes no longer exist. Reload the Publish center.",
        ));
    }

    let mut errors = vec![];
    let mut warnings = vec![];
    let mut singletons = Map::new();
    let mut lists: BTreeMap<String, Vec<(i64, String, Value)>> = BTreeMap::new();
    let mut items = vec![];
    for r in &rows {
        let item_id: Uuid = r.get("id");
        let collection: String = r.get("collection");
        let slug: String = r.get("slug");
        let Some(def) = collections::get(&collection) else {
            continue;
        };
        if r.get::<bool, _>("archived") {
            if chosen_by_item.contains_key(&item_id) {
                errors.push(format!(
                    "{} “{slug}” is archived; unarchive it before publishing.",
                    def.label
                ));
            }
            continue;
        }
        let draft_id: Uuid = r.get("draft_revision_id");
        let pick: Option<(Uuid, Value, bool)> =
            if let Some((rev, status, data)) = chosen_by_item.get(&item_id) {
                if kind == Kind::Live
                    && def.requires_approval
                    && !matches!(status.as_str(), "approved" | "released")
                {
                    errors.push(format!(
                        "{} “{slug}” has not been approved by a checker.",
                        def.label
                    ));
                }
                if status == "superseded" {
                    errors.push(format!(
                        "{} “{slug}”: the selected revision was replaced by a newer one.",
                        def.label
                    ));
                }
                Some((*rev, data.clone(), true))
            } else if kind == Kind::Preview && all_drafts {
                Some((draft_id, r.get("draft_data"), true))
            } else {
                r.get::<Option<Uuid>, _>("live_revision_id").map(|l| {
                    (
                        l,
                        r.get::<Option<Value>, _>("live_data")
                            .unwrap_or(Value::Null),
                        false,
                    )
                })
            };
        let Some((rev_id, data, was_selected)) = pick else {
            continue;
        };
        if let Err(e) = collections::validate(&collection, data.clone()) {
            let msg = format!(
                "{} “{slug}” has invalid content: {}",
                def.label,
                e.0.values().cloned().collect::<Vec<_>>().join("; ")
            );
            if kind == Kind::Live {
                errors.push(msg)
            } else {
                warnings.push(msg)
            }
        }
        items.push((item_id, rev_id, was_selected));
        if def.singleton {
            singletons.insert(collection.clone(), data);
        } else {
            let order = data.get("order").and_then(Value::as_i64).unwrap_or(0);
            lists
                .entry(collection.clone())
                .or_default()
                .push((order, slug, data));
        }
    }
    for c in collections::COLLECTIONS.iter().filter(|c| c.singleton) {
        if !singletons.contains_key(c.name) {
            errors.push(format!("“{}” has never been published.", c.label));
        }
    }

    // Rate set: explicit (prepared future release or preview of a draft set) or the approved set in force.
    let date: NaiveDate = effective_at.with_timezone(&Kolkata).date_naive();
    let rate_set_id = match rate_set {
        Some(id) => id,
        None => match rates::approved_for(conn, date).await? {
            Some(id) => id,
            None => {
                return Err(AppError::unprocessable(
                    "no_rate_set",
                    format!(
                        "No approved interest rate set covers {}. Approve a rate set first.",
                        date.format("%d %B %Y")
                    ),
                ));
            }
        },
    };
    let rs =
        sqlx::query("select label, valid_from, valid_until, status from rate_sets where id = $1")
            .bind(rate_set_id)
            .fetch_one(&mut *conn)
            .await?;
    let rs_status: String = rs.get("status");
    if kind == Kind::Live && rs_status != "approved" {
        errors.push("The selected rate set is not approved.".into());
    }
    let valid_from: NaiveDate = rs.get("valid_from");
    let valid_until: NaiveDate = rs.get("valid_until");
    if kind == Kind::Live && !(valid_from <= date && date < valid_until) {
        errors.push(format!("The rate set is valid {valid_from} to {valid_until} (exclusive), which does not include {date}."));
    }
    let entries = rates::entries(conn, rate_set_id).await?;
    let keys: BTreeSet<&str> = entries.iter().map(|e| e.key.as_str()).collect();

    // Every placeholder and rate link in the release must resolve against this rate set.
    let mut used = BTreeSet::new();
    for v in singletons
        .values()
        .chain(lists.values().flatten().map(|(_, _, d)| d))
    {
        used.extend(tokens::scan(v).rate_keys);
        for p in ["/rateKey", "/calc/rateKey"] {
            if let Some(k) = v.pointer(p).and_then(Value::as_str) {
                used.insert(k.to_owned());
            }
        }
    }
    let missing: Vec<&String> = used.iter().filter(|k| !keys.contains(k.as_str())).collect();
    if !missing.is_empty() {
        let msg = format!(
            "These rates are used by content but missing from the rate set: {}",
            missing
                .iter()
                .map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        );
        if kind == Kind::Live {
            errors.push(msg)
        } else {
            warnings.push(msg)
        }
    }
    if let Some(branches) = lists.get("branch") {
        if !branches.iter().any(|(_, _, d)| {
            d.get("headOffice") == Some(&Value::Bool(true))
                && d.get("active") != Some(&Value::Bool(false))
        }) {
            errors.push("No active head office branch is published.".into());
        }
    }
    if !errors.is_empty() {
        return Err(AppError::unprocessable(
            "release_blocked",
            "This release cannot be built yet.",
        )
        .with_extra(json!({ "problems": errors })));
    }

    let mut collections_json = Map::new();
    let mut media = BTreeSet::new();
    for (name, mut list) in lists {
        list.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
        let arr: Vec<Value> = list
            .into_iter()
            .map(|(_, slug, data)| {
                media.extend(media_version_refs(&data));
                json!({ "slug": slug, "data": data })
            })
            .collect();
        collections_json.insert(name, Value::Array(arr));
    }
    for v in singletons.values() {
        media.extend(media_version_refs(v));
    }
    let rate_entries: Vec<Value> = entries
        .iter()
        .map(|e| {
            let mut o = json!({ "key": e.key, "section": e.section, "label": e.label, "value": e.value.normalize().to_string(), "unit": e.unit });
            if let Some(c) = &e.category {
                o["category"] = json!(c);
            }
            if let Some(m) = e.tenure_min_days {
                o["minDays"] = json!(m);
                o["maxDays"] = json!(e.tenure_max_days);
            }
            o
        })
        .collect();
    let content = json!({
        "rateSet": { "id": rate_set_id, "label": rs.get::<String, _>("label"), "validFrom": valid_from, "validUntil": valid_until,
                     "timezone": "Asia/Kolkata", "entries": rate_entries },
        "singletons": singletons,
        "collections": collections_json,
        "media": media,
    });
    let content_hash = sha256_hex(content.to_string().as_bytes());
    let mut snapshot = json!({ "schemaVersion": SCHEMA_VERSION, "release": { "kind": kind.as_str(), "financePolicy": FINANCE_POLICY, "contentHash": content_hash } });
    for (k, v) in content.as_object().expect("object") {
        snapshot[k] = v.clone();
    }
    Ok(SnapshotPlan {
        snapshot,
        content_hash,
        rate_set_id,
        items,
        warnings,
    })
}

#[allow(clippy::too_many_arguments)]
async fn insert_release(
    conn: &mut PgConnection,
    state: &AppState,
    kind: Kind,
    plan: &mut SnapshotPlan,
    requested_by: Option<Uuid>,
    note: Option<&str>,
    idempotency_key: Option<&str>,
    scheduled_for: Option<DateTime<Utc>>,
    activate_when_ready: bool,
    expiry_fallback: bool,
) -> AppResult<Uuid> {
    let id = Uuid::new_v4();
    plan.snapshot["release"]["id"] = json!(id);
    plan.snapshot["release"]["createdAt"] = json!(Utc::now());
    sqlx::query(
        "insert into releases (id, kind, snapshot, content_hash, schema_version, finance_policy, rate_set_id, source_commit, builder_image,
             idempotency_key, requested_by, note, scheduled_for, activate_when_ready, expiry_fallback)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
    )
    .bind(id)
    .bind(kind.as_str())
    .bind(&plan.snapshot)
    .bind(&plan.content_hash)
    .bind(SCHEMA_VERSION)
    .bind(FINANCE_POLICY)
    .bind(plan.rate_set_id)
    .bind(&state.config.source_commit)
    .bind(&state.config.builder_image)
    .bind(idempotency_key)
    .bind(requested_by)
    .bind(note)
    .bind(scheduled_for)
    .bind(activate_when_ready)
    .bind(expiry_fallback)
    .execute(&mut *conn)
    .await?;
    for (item, rev, selected) in &plan.items {
        sqlx::query("insert into release_items (release_id, item_id, revision_id, selected) values ($1, $2, $3, $4)")
            .bind(id)
            .bind(item)
            .bind(rev)
            .bind(selected)
            .execute(&mut *conn)
            .await?;
    }
    if kind == Kind::Live {
        // Selected revisions are frozen: later edits create new drafts and never alter this release.
        sqlx::query("update content_revisions set status = 'released' where id in (select revision_id from release_items where release_id = $1 and selected) and status in ('draft', 'changes_requested', 'approved')")
            .bind(id)
            .execute(&mut *conn)
            .await?;
    }
    jobs::enqueue(
        conn,
        "start_build",
        json!({ "release_id": id }),
        None,
        Some(&format!("build:{id}")),
    )
    .await?;
    Ok(id)
}

// ------------------------------------------------------------------------------------------------
// Admin endpoints
// ------------------------------------------------------------------------------------------------

async fn pending(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    user.require_any(&["site.publish", "site.preview"])?;
    let rows = sqlx::query(
        "select i.id, i.collection, i.slug, i.archived_at is not null as archived, i.live_revision_id,
                d.id as draft_id, d.revision as draft_revision, d.status as draft_status, d.data, d.updated_at, u.name as updated_by,
                l.revision as live_revision,
                (select r.id from content_revisions r where r.item_id = i.id and r.status in ('approved') and r.revision > coalesce(l.revision, 0)
                 order by r.revision desc limit 1) as approved_id,
                (select r.revision from content_revisions r where r.item_id = i.id and r.status in ('approved') and r.revision > coalesce(l.revision, 0)
                 order by r.revision desc limit 1) as approved_revision
         from content_items i join content_revisions d on d.id = i.draft_revision_id
         left join content_revisions l on l.id = i.live_revision_id left join users u on u.id = d.updated_by
         where (i.archived_at is null and i.draft_revision_id is distinct from i.live_revision_id)
            or (i.archived_at is not null and i.live_revision_id is not null)
         order by d.updated_at desc",
    )
    .fetch_all(&state.db)
    .await?;
    let mut data = vec![];
    for r in &rows {
        let collection: String = r.get("collection");
        let Some(def) = collections::get(&collection) else {
            continue;
        };
        let archived: bool = r.get("archived");
        let draft_status: String = r.get("draft_status");
        let approved_id: Option<Uuid> = r.get("approved_id");
        let (candidate, eligible, reason) = if archived {
            (None, true, Some("Will be removed from the website"))
        } else if def.requires_approval {
            match approved_id {
                Some(a) => (Some(a), true, None),
                None if draft_status == "in_review" => (None, false, Some("Waiting for approval")),
                None => (
                    None,
                    false,
                    Some("Needs approval before it can be published"),
                ),
            }
        } else {
            (Some(r.get::<Uuid, _>("draft_id")), true, None)
        };
        let validation = match (candidate, archived) {
            (Some(c), false) if Some(c) == Some(r.get::<Uuid, _>("draft_id")) => {
                collections::validate(&collection, r.get("data"))
                    .err()
                    .map(|e| e.0.into_values().collect::<Vec<_>>())
            }
            _ => None,
        };
        let d: Value = r.get("data");
        let slug: String = r.get("slug");
        data.push(json!({
            "item_id": r.get::<Uuid, _>("id"), "collection": collection, "collection_label": def.label, "slug": slug,
            "title": d.get("name").or_else(|| d.get("title")).and_then(Value::as_str).unwrap_or(&slug),
            "draft_revision": r.get::<i32, _>("draft_revision"), "draft_status": draft_status,
            "live_revision": r.get::<Option<i32>, _>("live_revision"), "approved_revision": r.get::<Option<i32>, _>("approved_revision"),
            "candidate_revision_id": candidate, "eligible": eligible && validation.is_none(), "reason": reason,
            "validation": validation, "archived": archived, "requires_approval": def.requires_approval,
            "updated_at": r.get::<DateTime<Utc>, _>("updated_at"), "updated_by": r.get::<Option<String>, _>("updated_by"),
        }));
    }
    let mut conn = state.db.acquire().await?;
    let live = sqlx::query("select r.id, r.number, r.activated_at, r.rate_set_id, r.content_hash, s.label, s.valid_until from releases r left join rate_sets s on s.id = r.rate_set_id where r.kind = 'live' and r.status = 'live'")
        .fetch_optional(&mut *conn)
        .await?;
    let today = rates::today_ist();
    let current_rates = rates::approved_for(&mut conn, today).await?;
    let current_label: Option<String> = match current_rates {
        Some(id) => {
            sqlx::query_scalar(
                "select label || ' (revision ' || revision || ')' from rate_sets where id = $1",
            )
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?
        }
        None => None,
    };
    let live_rate_set = live
        .as_ref()
        .and_then(|l| l.get::<Option<Uuid>, _>("rate_set_id"));
    Ok(Json(json!({ "data": {
        "items": data,
        "rates": {
            "approved_for_today": current_rates, "label": current_label,
            "live": live_rate_set,
            "changed": current_rates.is_some() && current_rates != live_rate_set,
            "missing": current_rates.is_none(),
        },
        "live": live.map(|l| json!({ "id": l.get::<Uuid, _>("id"), "number": l.get::<i64, _>("number"), "activated_at": l.get::<Option<DateTime<Utc>>, _>("activated_at"),
            "rate_set": l.get::<Option<String>, _>("label"), "rates_valid_until": l.get::<Option<NaiveDate>, _>("valid_until"), "content_hash": l.get::<String, _>("content_hash") })),
        "can_publish": user.can("site.publish"),
    }})))
}

#[derive(Deserialize)]
struct PreviewBody {
    #[serde(default)]
    revision_ids: Vec<Uuid>,
    #[serde(default)]
    all_drafts: bool,
    rate_set_id: Option<Uuid>,
}

async fn create_preview(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(b): Json<PreviewBody>,
) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("site.preview")?;
    let mut tx = state.db.begin().await?;
    let selected: BTreeSet<Uuid> = b.revision_ids.into_iter().collect();
    let mut plan = plan_snapshot(
        &mut tx,
        Kind::Preview,
        &selected,
        b.all_drafts || selected.is_empty(),
        b.rate_set_id,
        Utc::now(),
    )
    .await?;
    let id = insert_release(
        &mut tx,
        &state,
        Kind::Preview,
        &mut plan,
        Some(user.id),
        Some("Preview"),
        None,
        None,
        false,
        false,
    )
    .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "release.preview_requested",
        "release",
        id,
        Outcome::Success,
        json!({ "items": plan.items.iter().filter(|i| i.2).count() }),
    )
    .await?;
    tx.commit().await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "data": { "id": id, "status": "queued", "warnings": plan.warnings } })),
    ))
}

#[derive(Deserialize)]
struct LiveBody {
    revision_ids: Vec<Uuid>,
    note: Option<String>,
    schedule_at: Option<DateTime<Utc>>,
    idempotency_key: Option<String>,
}

async fn create_live(
    State(state): State<AppState>,
    user: CurrentUser,
    Json(b): Json<LiveBody>,
) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("site.publish")?;
    let mut tx = state.db.begin().await?;
    if let Some(key) = b.idempotency_key.as_deref() {
        if let Some((id, status)) = sqlx::query_as::<_, (Uuid, String)>(
            "select id, status from releases where idempotency_key = $1",
        )
        .bind(key)
        .fetch_optional(&mut *tx)
        .await?
        {
            return Ok((
                StatusCode::OK,
                Json(json!({ "data": { "id": id, "status": status } })),
            ));
        }
    }
    if let Some(at) = b.schedule_at {
        if at <= Utc::now() {
            return Err(AppError::field(
                "schedule_at",
                "Choose a time in the future.",
            ));
        }
    }
    let selected: BTreeSet<Uuid> = b.revision_ids.into_iter().collect();
    let mut plan = plan_snapshot(
        &mut tx,
        Kind::Live,
        &selected,
        false,
        None,
        b.schedule_at.unwrap_or_else(Utc::now),
    )
    .await?;
    let id = insert_release(
        &mut tx,
        &state,
        Kind::Live,
        &mut plan,
        Some(user.id),
        b.note.as_deref(),
        b.idempotency_key.as_deref(),
        b.schedule_at,
        b.schedule_at.is_none(),
        false,
    )
    .await?;
    audit::record(&mut *tx, &user.actor(), "release.created", "release", id, Outcome::Success, json!({
        "selected": plan.items.iter().filter(|i| i.2).count(), "scheduled_for": b.schedule_at, "content_hash": plan.content_hash,
    }))
    .await?;
    tx.commit().await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "data": { "id": id, "status": "queued" } })),
    ))
}

#[derive(Deserialize)]
struct ListQuery {
    kind: Option<String>,
}

async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Value>> {
    user.require_any(&["site.publish", "site.preview", "content.view"])?;
    let kind = if q.kind.as_deref() == Some("preview") {
        "preview"
    } else {
        "live"
    };
    let rows = sqlx::query(
        "select r.id, r.number, r.kind, r.status, r.requested_at, r.activated_at, r.scheduled_for, r.superseded_at, r.page_count, r.error, r.note,
                r.content_hash, r.expiry_fallback, u.name as requested_by, s.label as rate_set,
                (select count(*) from release_items i where i.release_id = r.id and i.selected) as selected_items
         from releases r left join users u on u.id = r.requested_by left join rate_sets s on s.id = r.rate_set_id
         where r.kind = $1 and ($1 = 'live' or r.requested_by = $2 or $3)
         order by r.number desc limit 50",
    )
    .bind(kind)
    .bind(user.id)
    .bind(user.can("site.publish"))
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "data": rows.iter().map(release_summary).collect::<Vec<_>>() }),
    ))
}

fn release_summary(r: &sqlx::postgres::PgRow) -> Value {
    json!({
        "id": r.get::<Uuid, _>("id"), "number": r.get::<i64, _>("number"), "kind": r.get::<String, _>("kind"), "status": r.get::<String, _>("status"),
        "requested_at": r.get::<DateTime<Utc>, _>("requested_at"), "requested_by": r.get::<Option<String>, _>("requested_by"),
        "activated_at": r.get::<Option<DateTime<Utc>>, _>("activated_at"), "scheduled_for": r.get::<Option<DateTime<Utc>>, _>("scheduled_for"),
        "superseded_at": r.get::<Option<DateTime<Utc>>, _>("superseded_at"), "page_count": r.get::<Option<i32>, _>("page_count"),
        "error": r.get::<Option<String>, _>("error"), "note": r.get::<Option<String>, _>("note"), "content_hash": r.get::<String, _>("content_hash"),
        "rate_set": r.get::<Option<String>, _>("rate_set"), "selected_items": r.get::<i64, _>("selected_items"),
        "expiry_fallback": r.get::<bool, _>("expiry_fallback"),
    })
}

async fn detail(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    user.require_any(&["site.publish", "site.preview", "content.view"])?;
    let r = sqlx::query(
        "select r.id, r.number, r.kind, r.status, r.requested_at, r.activated_at, r.scheduled_for, r.superseded_at, r.page_count, r.error, r.note,
                r.content_hash, r.expiry_fallback, r.build_log, r.finance_policy, r.source_commit, r.builder_image, r.rate_set_id,
                u.name as requested_by, s.label as rate_set,
                (select count(*) from release_items i where i.release_id = r.id and i.selected) as selected_items
         from releases r left join users u on u.id = r.requested_by left join rate_sets s on s.id = r.rate_set_id where r.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(AppError::not_found)?;
    let items = sqlx::query(
        "select i.collection, i.slug, c.revision, ri.selected from release_items ri join content_items i on i.id = ri.item_id
         join content_revisions c on c.id = ri.revision_id where ri.release_id = $1 and ri.selected order by i.collection, i.slug",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    let events = sqlx::query("select e.action, e.outcome, e.details, e.at, u.name from activation_events e left join users u on u.id = e.actor_id where e.release_id = $1 order by e.at")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    let mut data = release_summary(&r);
    data["build_log"] = json!(r.get::<Option<String>, _>("build_log"));
    data["finance_policy"] = json!(r.get::<String, _>("finance_policy"));
    data["source_commit"] = json!(r.get::<Option<String>, _>("source_commit"));
    data["builder_image"] = json!(r.get::<Option<String>, _>("builder_image"));
    data["items"] = json!(items.iter().map(|i| json!({ "collection": i.get::<String, _>("collection"), "slug": i.get::<String, _>("slug"), "revision": i.get::<i32, _>("revision") })).collect::<Vec<_>>());
    data["events"] = json!(events.iter().map(|e| json!({ "action": e.get::<String, _>("action"), "outcome": e.get::<String, _>("outcome"), "details": e.get::<Value, _>("details"), "at": e.get::<DateTime<Utc>, _>("at"), "actor": e.get::<Option<String>, _>("name") })).collect::<Vec<_>>());
    let status: String = r.get("status");
    data["allowed"] = json!({
        "activate": user.can("site.publish") && status == "ready" && r.get::<String, _>("kind") == "live",
        "schedule": user.can("site.publish") && status == "ready" && r.get::<String, _>("kind") == "live",
        "cancel": user.can("site.publish") && matches!(status.as_str(), "queued" | "ready" | "scheduled"),
        "rollback": user.can("site.rollback") && status == "superseded" && r.get::<String, _>("kind") == "live",
        "open_preview": user.can("site.preview") && status == "ready" && r.get::<String, _>("kind") == "preview",
    });
    Ok(Json(json!({ "data": data })))
}

async fn activate_now(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("site.publish")?;
    let mut tx = state.db.begin().await?;
    let status: String = sqlx::query_scalar(
        "select status from releases where id = $1 and kind = 'live' for update",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(AppError::not_found)?;
    if status != "ready" && status != "scheduled" {
        return Err(AppError::conflict(
            "not_ready",
            "Only a successfully built release can be published.",
        ));
    }
    jobs::enqueue(
        &mut tx,
        "activate_release",
        json!({ "release_id": id, "actor_id": user.id }),
        None,
        Some(&format!("activate:{id}:{}", Utc::now().timestamp())),
    )
    .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "release.activation_requested",
        "release",
        id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    tx.commit().await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "data": { "id": id, "status": "activating" } })),
    ))
}

#[derive(Deserialize)]
struct ScheduleBody {
    at: DateTime<Utc>,
}

async fn schedule(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<ScheduleBody>,
) -> AppResult<Json<Value>> {
    user.require("site.publish")?;
    if b.at <= Utc::now() {
        return Err(AppError::field("at", "Choose a time in the future."));
    }
    let n = sqlx::query("update releases set status = 'scheduled', scheduled_for = $2, updated_at = now() where id = $1 and kind = 'live' and status in ('ready', 'scheduled')")
        .bind(id)
        .bind(b.at)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::conflict(
            "not_ready",
            "Only a built release can be scheduled.",
        ));
    }
    audit::record(
        &state.db,
        &user.actor(),
        "release.scheduled",
        "release",
        id,
        Outcome::Success,
        json!({ "at": b.at }),
    )
    .await?;
    Ok(Json(
        json!({ "data": { "id": id, "status": "scheduled", "scheduled_for": b.at } }),
    ))
}

async fn cancel(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    user.require("site.publish")?;
    let n = sqlx::query("update releases set status = 'cancelled', updated_at = now() where id = $1 and status in ('queued', 'ready', 'scheduled')")
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::conflict(
            "not_cancellable",
            "This release can no longer be cancelled.",
        ));
    }
    audit::record(
        &state.db,
        &user.actor(),
        "release.cancelled",
        "release",
        id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "data": { "id": id, "status": "cancelled" } })))
}

#[derive(Deserialize)]
struct RollbackBody {
    reason: String,
}

/// Re-activates a retained earlier release. Refused when its rates are no longer the ones in force,
/// so a rollback can never quietly bring back expired or replaced rates.
async fn rollback(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<RollbackBody>,
) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("site.rollback")?;
    let reason = b.reason.trim();
    if reason.is_empty() {
        return Err(AppError::field(
            "reason",
            "Explain why the website is being rolled back.",
        ));
    }
    let mut tx = state.db.begin().await?;
    let (status, rate_set): (String, Option<Uuid>) = sqlx::query_as(
        "select status, rate_set_id from releases where id = $1 and kind = 'live' for update",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(AppError::not_found)?;
    if status != "superseded" {
        return Err(AppError::conflict(
            "not_rollbackable",
            "Only an earlier live release can be restored.",
        ));
    }
    let in_force = rates::approved_for(&mut tx, rates::today_ist()).await?;
    if rate_set.is_none() || rate_set != in_force {
        return Err(AppError::conflict(
            "rates_not_current",
            "That release shows interest rates that are no longer in force. Publish a corrective release with the current rates instead.",
        ));
    }
    if !activation::release_dir(&state, id).exists() {
        return Err(AppError::conflict(
            "files_missing",
            "The files of that release are no longer kept on the server.",
        ));
    }
    sqlx::query("update releases set status = 'ready', note = coalesce(note, '') || $2, updated_at = now() where id = $1")
        .bind(id)
        .bind(format!(" [rollback: {reason}]"))
        .execute(&mut *tx)
        .await?;
    jobs::enqueue(
        &mut tx,
        "activate_release",
        json!({ "release_id": id, "actor_id": user.id, "rollback": true }),
        None,
        Some(&format!("activate:{id}:{}", Utc::now().timestamp())),
    )
    .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "release.rollback_requested",
        "release",
        id,
        Outcome::Success,
        json!({ "reason": reason }),
    )
    .await?;
    tx.commit().await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "data": { "id": id, "status": "activating" } })),
    ))
}

// ------------------------------------------------------------------------------------------------
// Builder protocol (internal listener only)
// ------------------------------------------------------------------------------------------------

fn check_service_token(state: &AppState, headers: &HeaderMap) -> AppResult<()> {
    let sent = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    if constant_time_eq(sent.as_bytes(), state.config.build_service_token.as_bytes()) {
        Ok(())
    } else {
        Err(AppError::unauthorized())
    }
}

async fn internal_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    check_service_token(&state, &headers)?;
    let snapshot: Value = sqlx::query_scalar("select snapshot from releases where id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(AppError::not_found)?;
    Ok(Json(snapshot))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildStatus {
    status: String,
    log: Option<String>,
    page_count: Option<i32>,
    error: Option<String>,
}

async fn internal_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(b): Json<BuildStatus>,
) -> AppResult<StatusCode> {
    check_service_token(&state, &headers)?;
    let mut tx = state.db.begin().await?;
    type ReleaseState = (String, String, Option<DateTime<Utc>>, bool, Option<Uuid>);
    let row: Option<ReleaseState> =
        sqlx::query_as("select kind, status, scheduled_for, activate_when_ready, requested_by from releases where id = $1 for update").bind(id).fetch_optional(&mut *tx).await?;
    let (kind, status, scheduled_for, activate_when_ready, requested_by) =
        row.ok_or_else(AppError::not_found)?;
    if !matches!(status.as_str(), "queued" | "building" | "validating") {
        // Late or repeated callback (e.g. after cancellation): idempotently ignored.
        return Ok(StatusCode::NO_CONTENT);
    }
    let log = b.log.map(|l| {
        l.chars()
            .rev()
            .take(20_000)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<String>()
    });
    let next = match b.status.as_str() {
        "building" | "validating" => b.status.clone(),
        "ready" if kind == "live" && scheduled_for.is_some() => "scheduled".into(),
        "ready" => "ready".into(),
        "failed" => "failed".into(),
        _ => return Err(AppError::bad_request("Unknown build status.")),
    };
    sqlx::query("update releases set status = $2, build_log = coalesce($3, build_log), page_count = coalesce($4, page_count), error = $5, updated_at = now() where id = $1")
        .bind(id)
        .bind(&next)
        .bind(&log)
        .bind(b.page_count)
        .bind(&b.error)
        .execute(&mut *tx)
        .await?;
    if next == "ready" && kind == "live" && activate_when_ready {
        jobs::enqueue(
            &mut tx,
            "activate_release",
            json!({ "release_id": id, "actor_id": requested_by }),
            None,
            Some(&format!("activate:{id}:auto")),
        )
        .await?;
    }
    if next == "failed" {
        if let Some(u) = requested_by {
            notifications::to_user(
                &mut tx,
                u,
                "build_failed",
                &format!("The {kind} build failed"),
                Some(&format!("/publish/releases/{id}")),
            )
            .await?;
        }
        if kind == "live" {
            notifications::to_permission(
                &mut tx,
                "site.publish",
                "build_failed",
                "A website release failed to build",
                b.error.as_deref().unwrap_or(""),
                Some(&format!("/publish/releases/{id}")),
                requested_by,
            )
            .await?;
        }
    }
    if next == "ready" && kind == "preview" {
        if let Some(u) = requested_by {
            notifications::to_user(
                &mut tx,
                u,
                "preview_ready",
                "Your preview is ready",
                Some(&format!("/publish/releases/{id}")),
            )
            .await?;
        }
    }
    audit::record(
        &mut *tx,
        &Actor::system("builder"),
        &format!("release.build_{next}"),
        "release",
        id,
        Outcome::Success,
        json!({ "pages": b.page_count }),
    )
    .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Job: hands a queued release to the builder service.
pub async fn start_build(state: &AppState, id: Uuid) -> anyhow::Result<()> {
    let row: Option<(String, String)> =
        sqlx::query_as("select kind, status from releases where id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let Some((kind, status)) = row else {
        return Ok(());
    };
    if status != "queued" {
        return Ok(());
    }
    let internal = state.config.internal_url.as_str().trim_end_matches('/');
    let res = state
        .http
        .post(state.config.build_service_url.join("/build")?)
        .bearer_auth(&state.config.build_service_token)
        .json(&json!({
            "releaseId": id,
            "kind": kind,
            "snapshotUrl": format!("{internal}/api/internal/releases/{id}/snapshot"),
            "callbackUrl": format!("{internal}/api/internal/builds/{id}/status"),
        }))
        .send()
        .await?;
    if !res.status().is_success() {
        anyhow::bail!("builder refused the build: HTTP {}", res.status());
    }
    sqlx::query("update releases set status = 'building', updated_at = now() where id = $1 and status = 'queued'").bind(id).execute(&state.db).await?;
    Ok(())
}

// ------------------------------------------------------------------------------------------------
// Activation, scheduling and the rate-expiry watchdog
// ------------------------------------------------------------------------------------------------

/// Job: makes a ready (or due scheduled) release live, under a database-wide activation lock. All the
/// work runs on the connection that holds the lock.
pub async fn activate_job(state: &AppState, id: Uuid, actor: Option<Uuid>) -> anyhow::Result<()> {
    let mut conn = state.db.acquire().await?;
    sqlx::query("select pg_advisory_lock(hashtext('lokmangal.release_activation'))")
        .execute(&mut *conn)
        .await?;
    let result = activate_locked(state, &mut conn, id, actor).await;
    let _ = sqlx::query("select pg_advisory_unlock(hashtext('lokmangal.release_activation'))")
        .execute(&mut *conn)
        .await;
    drop(conn);
    if matches!(result, Ok(true)) {
        prune(state).await;
    }
    result.map(|_| ())
}

/// Returns true when the release went live.
async fn activate_locked(
    state: &AppState,
    conn: &mut PgConnection,
    id: Uuid,
    actor: Option<Uuid>,
) -> anyhow::Result<bool> {
    reconcile_on(state, conn).await?;
    let row: Option<(String, String, Option<Uuid>, bool)> = sqlx::query_as(
        "select kind, status, rate_set_id, expiry_fallback from releases where id = $1",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;
    let Some((kind, status, rate_set, expiry_fallback)) = row else {
        return Ok(false);
    };
    if kind != "live" || !matches!(status.as_str(), "ready" | "scheduled") {
        return Ok(false);
    }
    // Re-check at activation time: the rate set must still be the approved one in force.
    let in_force = rates::approved_for(conn, rates::today_ist()).await?;
    if !expiry_fallback && (rate_set.is_none() || rate_set != in_force) {
        fail_activation(conn, id, actor, "The release's interest rates are not the approved rates in force today. Build a new release.").await?;
        return Ok(false);
    }
    let previous: Option<Uuid> =
        sqlx::query_scalar("select id from releases where kind = 'live' and status = 'live'")
            .fetch_optional(&mut *conn)
            .await?;
    sqlx::query("update releases set status = 'activating', updated_at = now() where id = $1")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    event(
        conn,
        id,
        "activate",
        "started",
        actor,
        json!({ "previous": previous }),
    )
    .await?;

    let redirects = redirects_of(conn, id).await?;
    let outcome = async {
        activation::activate(state, id, &redirects).await?;
        activation::verify(state, id).await
    }
    .await;
    match outcome {
        Ok(()) => {
            let mut tx = sqlx::Acquire::begin(&mut *conn).await?;
            sqlx::query("update releases set status = 'superseded', superseded_at = now(), updated_at = now() where kind = 'live' and status = 'live'").execute(&mut *tx).await?;
            sqlx::query("update releases set status = 'live', activated_at = now(), activated_by = $2, error = null, updated_at = now() where id = $1")
                .bind(id)
                .bind(actor)
                .execute(&mut *tx)
                .await?;
            sqlx::query("update content_items set live_revision_id = null where live_revision_id is not null and id not in (select item_id from release_items where release_id = $1)")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            sqlx::query("update content_items i set live_revision_id = ri.revision_id from release_items ri where ri.release_id = $1 and ri.item_id = i.id")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            sqlx::query("insert into activation_events (release_id, action, outcome, actor_id) values ($1, 'activate', 'live', $2)")
                .bind(id)
                .bind(actor)
                .execute(&mut *tx)
                .await?;
            let a = actor
                .map(|u| Actor {
                    user_id: Some(u),
                    label: "publisher".into(),
                    ip: None,
                    request_id: None,
                })
                .unwrap_or_else(|| Actor::system("scheduler"));
            audit::record(
                &mut *tx,
                &a,
                "release.activated",
                "release",
                id,
                Outcome::Success,
                json!({ "previous": previous }),
            )
            .await?;
            if let Some(u) = actor {
                notifications::to_user(
                    &mut tx,
                    u,
                    "release_live",
                    "The website was updated",
                    Some(&format!("/publish/releases/{id}")),
                )
                .await?;
            }
            tx.commit().await?;
            Ok(true)
        }
        Err(e) => {
            // Put the previous release back in front of visitors if the new one was (partly) applied.
            if let Some(prev) = previous {
                if let Ok(redirects) = redirects_of(conn, prev).await {
                    if let Err(e2) = activation::activate(state, prev, &redirects).await {
                        tracing::error!(error = %e2, "could not restore the previous release");
                    }
                }
            }
            fail_activation(conn, id, actor, &format!("Activation failed: {e:#}")).await?;
            Ok(false)
        }
    }
}

async fn fail_activation(
    conn: &mut PgConnection,
    id: Uuid,
    actor: Option<Uuid>,
    message: &str,
) -> anyhow::Result<()> {
    let mut tx = sqlx::Acquire::begin(&mut *conn).await?;
    sqlx::query(
        "update releases set status = 'failed', error = $2, updated_at = now() where id = $1",
    )
    .bind(id)
    .bind(message)
    .execute(&mut *tx)
    .await?;
    sqlx::query("insert into activation_events (release_id, action, outcome, actor_id, details) values ($1, 'activate', 'failed', $2, $3)")
        .bind(id)
        .bind(actor)
        .bind(json!({ "error": message }))
        .execute(&mut *tx)
        .await?;
    notifications::to_permission(
        &mut tx,
        "site.publish",
        "release_failed",
        "A release could not be activated",
        message,
        Some(&format!("/publish/releases/{id}")),
        None,
    )
    .await?;
    audit::record(
        &mut *tx,
        &Actor::system("release-controller"),
        "release.activation_failed",
        "release",
        id,
        Outcome::Failure,
        json!({ "error": message }),
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

async fn event(
    conn: &mut PgConnection,
    id: Uuid,
    action: &str,
    outcome: &str,
    actor: Option<Uuid>,
    details: Value,
) -> sqlx::Result<()> {
    sqlx::query("insert into activation_events (release_id, action, outcome, actor_id, details) values ($1, $2, $3, $4, $5)")
        .bind(id)
        .bind(action)
        .bind(outcome)
        .bind(actor)
        .bind(details)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn redirects_of(
    conn: &mut PgConnection,
    id: Uuid,
) -> anyhow::Result<Vec<activation::RedirectRule>> {
    let v: Value = sqlx::query_scalar(
        "select snapshot->'collections'->'redirect' from releases where id = $1",
    )
    .bind(id)
    .fetch_one(&mut *conn)
    .await?;
    Ok(v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|r| {
                    let d = r.get("data")?;
                    Some(activation::RedirectRule {
                        from: d.get("from")?.as_str()?.to_owned(),
                        to: d.get("to")?.as_str()?.to_owned(),
                        status: d.get("status")?.as_u64()? as u16,
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}

/// After a crash: a release stuck in "activating" is completed if it is what visitors now see,
/// otherwise it is marked failed (the previous release is still being served).
pub async fn reconcile(state: &AppState) -> anyhow::Result<()> {
    let mut conn = state.db.acquire().await?;
    reconcile_on(state, &mut conn).await
}

async fn reconcile_on(state: &AppState, conn: &mut PgConnection) -> anyhow::Result<()> {
    let stuck: Option<Uuid> =
        sqlx::query_scalar("select id from releases where status = 'activating'")
            .fetch_optional(&mut *conn)
            .await?;
    let Some(id) = stuck else { return Ok(()) };
    let serving = activation::serving_release(state).await.ok().flatten();
    if serving == Some(id) {
        let mut tx = sqlx::Acquire::begin(&mut *conn).await?;
        sqlx::query("update releases set status = 'superseded', superseded_at = now() where kind = 'live' and status = 'live'").execute(&mut *tx).await?;
        sqlx::query("update releases set status = 'live', activated_at = coalesce(activated_at, now()) where id = $1").bind(id).execute(&mut *tx).await?;
        sqlx::query("update content_items set live_revision_id = null where live_revision_id is not null and id not in (select item_id from release_items where release_id = $1)").bind(id).execute(&mut *tx).await?;
        sqlx::query("update content_items i set live_revision_id = ri.revision_id from release_items ri where ri.release_id = $1 and ri.item_id = i.id").bind(id).execute(&mut *tx).await?;
        sqlx::query("insert into activation_events (release_id, action, outcome) values ($1, 'reconcile', 'live')").bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
    } else {
        sqlx::query("update releases set status = 'failed', error = 'Activation was interrupted; the previous release is still being served.' where id = $1")
            .bind(id)
            .execute(&mut *conn)
            .await?;
        event(
            conn,
            id,
            "reconcile",
            "failed",
            None,
            json!({ "serving": serving }),
        )
        .await?;
    }
    Ok(())
}

/// Keeps the newest N live releases' files (configurable) and recent previews.
async fn prune(state: &AppState) {
    let result = async {
        let mut conn = state.db.acquire().await?;
        let keep = settings::publishing(&mut conn).await?.release_retention as i64;
        let old: Vec<Uuid> = sqlx::query_scalar("select id from releases where kind = 'live' and status = 'superseded' order by number desc offset $1").bind(keep).fetch_all(&mut *conn).await?;
        for id in old {
            activation::remove_release_files(state, id).await;
        }
        let previews: Vec<Uuid> = sqlx::query_scalar("select id from releases where kind = 'preview' and requested_at < now() - interval '2 days'").fetch_all(&mut *conn).await?;
        for id in previews {
            activation::remove_preview_files(state, id).await;
        }
        Ok::<_, AppError>(())
    }
    .await;
    if let Err(e) = result {
        tracing::warn!(error = %e, "release pruning failed");
    }
}

/// Job: when a future rate set is approved, prepare (build and schedule) a release that switches the
/// rates on its first day at 00:00 IST, using the content that is live now.
pub async fn prepare_rate_release(state: &AppState, rate_set_id: Uuid) -> anyhow::Result<()> {
    let mut tx = state.db.begin().await?;
    let (from, status): (NaiveDate, String) =
        sqlx::query_as("select valid_from, status from rate_sets where id = $1")
            .bind(rate_set_id)
            .fetch_one(&mut *tx)
            .await?;
    if status != "approved" {
        return Ok(());
    }
    let at = Kolkata
        .from_local_datetime(&from.and_hms_opt(0, 0, 0).expect("midnight"))
        .single()
        .expect("IST has no DST")
        .with_timezone(&Utc);
    if at <= Utc::now() {
        return Ok(());
    }
    // Replace any earlier prepared release for the same date.
    sqlx::query("update releases set status = 'cancelled', updated_at = now() where kind = 'live' and status in ('queued','building','validating','ready','scheduled') and scheduled_for = $1")
        .bind(at)
        .execute(&mut *tx)
        .await?;
    let mut plan = match plan_snapshot(
        &mut tx,
        Kind::Live,
        &BTreeSet::new(),
        false,
        Some(rate_set_id),
        at,
    )
    .await
    {
        Ok(p) => p,
        Err(e) => {
            notifications::to_permission(
                &mut tx,
                "site.publish",
                "release_blocked",
                "The release for the new rates could not be prepared",
                &e.message,
                Some("/publish"),
                None,
            )
            .await?;
            tx.commit().await?;
            anyhow::bail!("could not prepare rate release: {}", e.message);
        }
    };
    let id = insert_release(
        &mut tx,
        state,
        Kind::Live,
        &mut plan,
        None,
        Some("Prepared automatically for the new interest rates"),
        None,
        Some(at),
        false,
        false,
    )
    .await?;
    audit::record(
        &mut *tx,
        &Actor::system("scheduler"),
        "release.prepared_for_rates",
        "release",
        id,
        Outcome::Success,
        json!({ "rate_set": rate_set_id, "at": at }),
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

/// Every 30 s: activate due scheduled releases, time out stuck builds, and guard against expired rates.
pub async fn scheduler_tick(state: &AppState) -> AppResult<()> {
    // Plain queries on the pool: no connection is held while another is requested below.
    let due: Vec<Uuid> = sqlx::query_scalar(
        "select id from releases where status = 'scheduled' and scheduled_for <= now()",
    )
    .fetch_all(&state.db)
    .await?;
    for id in due {
        let mut conn = state.db.acquire().await?;
        jobs::enqueue(
            &mut conn,
            "activate_release",
            json!({ "release_id": id }),
            None,
            Some(&format!("activate:{id}:scheduled")),
        )
        .await?;
    }
    let timeout = state.config.build_timeout_secs as f64;
    sqlx::query("update releases set status = 'failed', error = 'The build did not finish in time.', updated_at = now() where status in ('building','validating') and updated_at < now() - make_interval(secs => $1)")
        .bind(timeout)
        .execute(&state.db)
        .await?;

    // Expiry watchdog: the live release's rates have ended and no approved replacement is in force.
    let live: Option<(Uuid, Option<NaiveDate>, bool)> = sqlx::query_as(
        "select r.id, s.valid_until, r.expiry_fallback from releases r left join rate_sets s on s.id = r.rate_set_id where r.kind = 'live' and r.status = 'live'",
    )
    .fetch_optional(&state.db)
    .await?;
    if let Some((live_id, Some(until), false)) = live {
        let today = rates::today_ist();
        if until <= today {
            let replacement_due: bool = sqlx::query_scalar("select exists(select 1 from releases where kind = 'live' and status in ('scheduled','ready','activating') and expiry_fallback = false and scheduled_for <= now() + interval '5 minutes')")
                .fetch_one(&state.db)
                .await?;
            if !replacement_due {
                let mut tx = state.db.begin().await?;
                let snapshot: Value =
                    sqlx::query_scalar("select snapshot from releases where id = $1")
                        .bind(live_id)
                        .fetch_one(&mut *tx)
                        .await?;
                let already: bool = sqlx::query_scalar("select exists(select 1 from releases where expiry_fallback and requested_at > now() - interval '1 day' and status not in ('failed','cancelled'))").fetch_one(&mut *tx).await?;
                if !already {
                    let mut snap = snapshot.clone();
                    snap["rateSet"]["expired"] = Value::Bool(true);
                    let items: Vec<(Uuid, Uuid)> = sqlx::query_as(
                        "select item_id, revision_id from release_items where release_id = $1",
                    )
                    .bind(live_id)
                    .fetch_all(&mut *tx)
                    .await?;
                    let rate_set_id: Uuid =
                        sqlx::query_scalar("select rate_set_id from releases where id = $1")
                            .bind(live_id)
                            .fetch_one(&mut *tx)
                            .await?;
                    let mut plan = SnapshotPlan {
                        content_hash: sha256_hex(snap.to_string().as_bytes()),
                        snapshot: snap,
                        rate_set_id,
                        items: items.into_iter().map(|(i, r)| (i, r, false)).collect(),
                        warnings: vec![],
                    };
                    let id = insert_release(&mut tx, state, Kind::Live, &mut plan, None, Some("Interest rates expired: validity notice shown and calculators disabled"), None, None, true, true).await?;
                    notifications::to_permission(&mut tx, "financial.approve", "rate_expiry", "Published interest rates have expired", "The website now shows a validity notice. Approve and publish the new rate set.", Some("/products/rates"), None).await?;
                    audit::record(
                        &mut *tx,
                        &Actor::system("expiry-watchdog"),
                        "release.expiry_fallback",
                        "release",
                        id,
                        Outcome::Success,
                        json!({ "expired_on": until }),
                    )
                    .await?;
                }
                tx.commit().await?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn finance_policy_matches_shared_package() {
        let ts = include_str!("../../packages/finance/src/index.ts");
        assert!(ts.contains(&format!(
            "FINANCE_POLICY_VERSION = '{}'",
            super::FINANCE_POLICY
        )));
    }
}
