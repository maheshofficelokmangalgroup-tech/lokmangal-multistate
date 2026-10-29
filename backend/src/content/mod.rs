//! Content engine: items with immutable submitted revisions, editable drafts with optimistic locking,
//! contributor tracking, approvals for financial content, restore and archive.
//!
//! Saving never changes the public site — only an activated release does (see releases.rs).

pub mod collections;
pub mod tokens;

use std::{collections::BTreeSet, sync::LazyLock};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use regex::Regex;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{PgConnection, Postgres, QueryBuilder, Row};
use uuid::Uuid;

use self::collections::CollectionDef;
use crate::{
    audit::{self, Outcome},
    auth::CurrentUser,
    error::{AppError, AppResult, FieldErrors},
    notifications,
    state::{AppState, PageQuery},
    text::{is_slug, slugify},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/content", get(index))
        .route("/content/{collection}", get(list).post(create))
        .route("/content/{collection}/{id}", get(detail).patch(save))
        .route("/content/{collection}/{id}/submit", post(submit))
        .route("/content/{collection}/{id}/revisions", get(revisions))
        .route("/content/{collection}/{id}/revisions/{rev}", get(revision))
        .route("/content/{collection}/{id}/restore", post(restore))
        .route("/content/{collection}/{id}/archive", post(archive))
        .route("/content/{collection}/{id}/unarchive", post(unarchive))
}

fn collection(name: &str) -> AppResult<&'static CollectionDef> {
    collections::get(name).ok_or_else(AppError::not_found)
}

fn can_view(user: &CurrentUser, def: &CollectionDef) -> AppResult<()> {
    user.require_any(&["content.view", def.edit_permission])
}

fn title_of(data: &Value, slug: &str) -> String {
    ["title", "name", "label", "from"]
        .iter()
        .find_map(|k| data.get(*k).and_then(Value::as_str))
        .map(str::to_owned)
        .unwrap_or_else(|| slug.to_owned())
}

async fn index(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    user.require_any(&[
        "content.view",
        "content.edit",
        "products.edit",
        "careers.edit",
        "branches.edit",
        "settings.manage",
    ])?;
    let counts: Vec<(String, i64, i64)> = sqlx::query_as(
        "select i.collection, count(*) filter (where i.archived_at is null),
                count(*) filter (where i.archived_at is null and i.draft_revision_id is distinct from i.live_revision_id)
         from content_items i group by i.collection",
    )
    .fetch_all(&state.db)
    .await?;
    let data: Vec<Value> = collections::COLLECTIONS
        .iter()
        .map(|c| {
            let (_, total, pending) = counts.iter().find(|(n, _, _)| n == c.name).cloned().unwrap_or_default();
            json!({ "name": c.name, "label": c.label, "singleton": c.singleton, "requires_approval": c.requires_approval,
                    "financial": c.financial, "can_edit": user.can(c.edit_permission), "items": total, "unreleased": pending })
        })
        .collect();
    Ok(Json(json!({ "data": data })))
}

#[derive(Deserialize)]
struct ListQuery {
    q: Option<String>,
    status: Option<String>,
    archived: Option<bool>,
}

async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(name): Path<String>,
    Query(page): Query<PageQuery>,
    Query(f): Query<ListQuery>,
) -> AppResult<Json<Value>> {
    let def = collection(&name)?;
    can_view(&user, def)?;
    let push_filters = |qb: &mut QueryBuilder<'_, Postgres>| {
        qb.push(" where i.collection = ").push_bind(name.clone());
        if f.archived == Some(true) {
            qb.push(" and i.archived_at is not null");
        } else {
            qb.push(" and i.archived_at is null");
        }
        if let Some(q) = f.q.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
            qb.push(" and (i.slug ilike ")
                .push_bind(format!("%{q}%"))
                .push(" or d.data::text ilike ")
                .push_bind(format!("%{q}%"))
                .push(")");
        }
        match f.status.as_deref() {
            Some("unreleased") => {
                qb.push(" and i.draft_revision_id is distinct from i.live_revision_id");
            }
            Some(s @ ("draft" | "in_review" | "changes_requested" | "approved" | "released")) => {
                qb.push(" and d.status = ").push_bind(s.to_owned());
            }
            _ => {}
        }
    };
    let mut qb = QueryBuilder::new(
        "select i.id, i.slug, i.archived_at, i.live_revision_id, d.id as draft_id, d.revision, d.status, d.data, d.updated_at, u.name as updated_by,
                l.revision as live_revision, coalesce((d.data->>'order')::int, 0) as sort_order
         from content_items i join content_revisions d on d.id = i.draft_revision_id
         left join content_revisions l on l.id = i.live_revision_id left join users u on u.id = d.updated_by",
    );
    push_filters(&mut qb);
    qb.push(" order by sort_order, i.slug limit ")
        .push_bind(page.limit())
        .push(" offset ")
        .push_bind(page.offset());
    let rows = qb.build().fetch_all(&state.db).await?;
    let mut count = QueryBuilder::new(
        "select count(*) from content_items i join content_revisions d on d.id = i.draft_revision_id",
    );
    push_filters(&mut count);
    let total: i64 = count.build_query_scalar().fetch_one(&state.db).await?;
    let data: Vec<Value> = rows
        .iter()
        .map(|r| {
            let slug: String = r.get("slug");
            let draft_id: Uuid = r.get("draft_id");
            let data: Value = r.get("data");
            json!({
                "id": r.get::<Uuid, _>("id"),
                "slug": slug,
                "title": title_of(&data, &slug),
                "summary": summary_of(&name, &data),
                "draft": { "id": draft_id, "revision": r.get::<i32, _>("revision"), "status": r.get::<String, _>("status"),
                           "updated_at": r.get::<DateTime<Utc>, _>("updated_at"), "updated_by": r.get::<Option<String>, _>("updated_by") },
                "live_revision": r.get::<Option<i32>, _>("live_revision"),
                "unreleased": r.get::<Option<Uuid>, _>("live_revision_id") != Some(draft_id),
                "archived": r.get::<Option<DateTime<Utc>>, _>("archived_at").is_some(),
            })
        })
        .collect();
    Ok(Json(
        json!({ "data": data, "meta": { "total": total, "page": page.page(), "per_page": page.limit(),
        "collection": { "name": def.name, "label": def.label, "singleton": def.singleton, "requires_approval": def.requires_approval, "can_edit": user.can(def.edit_permission) } } }),
    ))
}

/// A few useful columns per collection for list views.
fn summary_of(collection: &str, d: &Value) -> Value {
    let s = |k: &str| d.get(k).cloned().unwrap_or(Value::Null);
    match collection {
        "deposit_scheme" => {
            json!({ "kind": s("kind"), "rateKey": s("rateKey"), "featured": s("featured") })
        }
        "loan" => json!({ "rate": s("rate"), "showInForm": s("showInForm") }),
        "branch" => json!({ "code": s("code"), "region": s("region"), "active": s("active") }),
        "post" => json!({ "date": s("date"), "language": s("language") }),
        "notice" => json!({ "date": s("date"), "pinned": s("pinned"), "category": s("category") }),
        "document" => json!({ "category": s("category"), "year": s("year") }),
        "job_opening" => json!({ "open": s("open"), "location": s("location") }),
        "redirect" => json!({ "to": s("to"), "status": s("status") }),
        "gallery_album" => {
            json!({ "images": d.get("images").and_then(Value::as_array).map(|a| a.len()) })
        }
        _ => Value::Null,
    }
}

#[derive(Deserialize)]
struct CreateBody {
    slug: Option<String>,
    data: Value,
    note: Option<String>,
}

async fn create(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(name): Path<String>,
    Json(b): Json<CreateBody>,
) -> AppResult<(StatusCode, Json<Value>)> {
    let def = collection(&name)?;
    user.require(def.edit_permission)?;
    if def.singleton {
        return Err(AppError::conflict(
            "singleton",
            "This content already exists; edit it instead.",
        ));
    }
    let data = collections::validate(&name, b.data).map_err(AppError::validation)?;
    let slug = collections::natural_slug(&name, &data)
        .or(b.slug.filter(|s| !s.is_empty()))
        .unwrap_or_else(|| slugify(&title_of(&data, "")));
    if !is_slug(&slug) {
        return Err(AppError::field(
            "slug",
            "Use lowercase letters, numbers and dashes.",
        ));
    }
    let mut tx = state.db.begin().await?;
    let item_id: Uuid = sqlx::query_scalar(
        "insert into content_items (collection, slug, created_by) values ($1, $2, $3) returning id",
    )
    .bind(&name)
    .bind(&slug)
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| match AppError::from(e) {
        err if err.code == "already_exists" => {
            AppError::field("slug", "Another item already uses this web address.")
        }
        err => err,
    })?;
    let rev_id: Uuid = sqlx::query_scalar(
        "insert into content_revisions (item_id, revision, data, created_by, updated_by, note) values ($1, 1, $2, $3, $3, $4) returning id",
    )
    .bind(item_id)
    .bind(&data)
    .bind(user.id)
    .bind(&b.note)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("update content_items set draft_revision_id = $2 where id = $1")
        .bind(item_id)
        .bind(rev_id)
        .execute(&mut *tx)
        .await?;
    add_contributor(&mut tx, rev_id, user.id).await?;
    refresh_media_usage(&mut tx, rev_id, &data).await?;
    after_branch_change(&mut tx, &name, &data).await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "content.created",
        &name,
        item_id,
        Outcome::Success,
        json!({ "slug": slug, "revision": 1 }),
    )
    .await?;
    tx.commit().await?;
    let detail = load_detail(&state, &user, def, item_id).await?;
    Ok((StatusCode::CREATED, Json(json!({ "data": detail }))))
}

pub async fn add_contributor(
    conn: &mut PgConnection,
    revision_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<()> {
    sqlx::query("insert into revision_contributors (revision_id, user_id) values ($1, $2) on conflict do nothing")
        .bind(revision_id)
        .bind(user_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

static MEDIA_REF: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"/media/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/").unwrap()
});

pub fn media_version_refs(data: &Value) -> BTreeSet<Uuid> {
    let text = data.to_string();
    MEDIA_REF
        .captures_iter(&text)
        .filter_map(|c| c[1].parse().ok())
        .collect()
}

async fn refresh_media_usage(
    conn: &mut PgConnection,
    revision_id: Uuid,
    data: &Value,
) -> AppResult<()> {
    let refs: Vec<Uuid> = media_version_refs(data).into_iter().collect();
    sqlx::query("delete from media_usage where revision_id = $1")
        .bind(revision_id)
        .execute(&mut *conn)
        .await?;
    if !refs.is_empty() {
        let known: i64 = sqlx::query_scalar(
            "select count(*) from media_versions where id = any($1) and status = 'ready'",
        )
        .bind(&refs)
        .fetch_one(&mut *conn)
        .await?;
        if known != refs.len() as i64 {
            return Err(AppError::field(
                "data",
                "Some files are missing from the media library or are still being processed.",
            ));
        }
        sqlx::query("insert into media_usage (media_id, revision_id) select distinct media_id, $1 from media_versions where id = any($2) on conflict do nothing")
            .bind(revision_id)
            .bind(&refs)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

/// Public branch content and the operational branch identity (used to route leads) share the code.
async fn after_branch_change(
    conn: &mut PgConnection,
    collection: &str,
    data: &Value,
) -> AppResult<()> {
    if collection != "branch" {
        return Ok(());
    }
    let s = |k: &str| {
        data.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned()
    };
    sqlx::query(
        "insert into branches (code, name, region, is_head_office, active, notification_email) values ($1, $2, $3, $4, $5, $6)
         on conflict (code) do update set name = excluded.name, region = excluded.region, is_head_office = excluded.is_head_office,
             active = excluded.active, notification_email = excluded.notification_email, updated_at = now()",
    )
    .bind(s("code"))
    .bind(s("name"))
    .bind(s("region"))
    .bind(data.get("headOffice").and_then(Value::as_bool).unwrap_or(false))
    .bind(data.get("active").and_then(Value::as_bool).unwrap_or(true))
    .bind(data.get("email").and_then(Value::as_str))
    .execute(&mut *conn)
    .await?;
    Ok(())
}

async fn load_detail(
    state: &AppState,
    user: &CurrentUser,
    def: &CollectionDef,
    id: Uuid,
) -> AppResult<Value> {
    let item = sqlx::query(
        "select i.id, i.slug, i.archived_at, i.draft_revision_id, i.live_revision_id,
                d.revision, d.status, d.data, d.lock_version, d.updated_at, d.submitted_at, d.note, u.name as updated_by,
                l.revision as live_revision, l.data as live_data
         from content_items i join content_revisions d on d.id = i.draft_revision_id
         left join content_revisions l on l.id = i.live_revision_id left join users u on u.id = d.updated_by
         where i.id = $1 and i.collection = $2",
    )
    .bind(id)
    .bind(def.name)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(AppError::not_found)?;
    let draft_id: Uuid = item.get("draft_revision_id");
    let approval = sqlx::query(
        "select a.id, a.status, a.comment, a.decided_at, s.name as submitted_by, r.name as reviewer from approvals a
         join users s on s.id = a.submitted_by left join users r on r.id = a.reviewer_id
         where a.subject_type = 'content_revision' and a.subject_id = $1 order by a.submitted_at desc limit 1",
    )
    .bind(draft_id)
    .fetch_optional(&state.db)
    .await?;
    let contributors: Vec<String> = sqlx::query_scalar("select u.name from revision_contributors c join users u on u.id = c.user_id where c.revision_id = $1 order by c.first_at")
        .bind(draft_id)
        .fetch_all(&state.db)
        .await?;
    let status: String = item.get("status");
    let can_edit = user.can(def.edit_permission);
    let slug: String = item.get("slug");
    let data: Value = item.get("data");
    Ok(json!({
        "id": id,
        "collection": def.name,
        "slug": slug,
        "title": title_of(&data, &slug),
        "archived": item.get::<Option<DateTime<Utc>>, _>("archived_at").is_some(),
        "draft": {
            "id": draft_id,
            "revision": item.get::<i32, _>("revision"),
            "status": status,
            "data": data,
            "lock_version": item.get::<i32, _>("lock_version"),
            "updated_at": item.get::<DateTime<Utc>, _>("updated_at"),
            "updated_by": item.get::<Option<String>, _>("updated_by"),
            "submitted_at": item.get::<Option<DateTime<Utc>>, _>("submitted_at"),
            "note": item.get::<Option<String>, _>("note"),
            "contributors": contributors,
        },
        "live": item.get::<Option<i32>, _>("live_revision").map(|rev| json!({ "revision": rev, "data": item.get::<Option<Value>, _>("live_data") })),
        "unreleased": item.get::<Option<Uuid>, _>("live_revision_id") != Some(draft_id),
        "approval": approval.map(|a| json!({
            "id": a.get::<Uuid, _>("id"), "status": a.get::<String, _>("status"), "comment": a.get::<Option<String>, _>("comment"),
            "decided_at": a.get::<Option<DateTime<Utc>>, _>("decided_at"), "submitted_by": a.get::<String, _>("submitted_by"),
            "reviewer": a.get::<Option<String>, _>("reviewer"),
        })),
        "collection_info": { "label": def.label, "singleton": def.singleton, "requires_approval": def.requires_approval, "financial": def.financial },
        "allowed": {
            "edit": can_edit,
            "submit": can_edit && def.requires_approval && (status == "draft" || status == "changes_requested"),
            "archive": can_edit && !def.singleton,
        },
    }))
}

async fn detail(
    State(state): State<AppState>,
    user: CurrentUser,
    Path((name, id)): Path<(String, Uuid)>,
) -> AppResult<Json<Value>> {
    let def = collection(&name)?;
    can_view(&user, def)?;
    Ok(Json(
        json!({ "data": load_detail(&state, &user, def, id).await? }),
    ))
}

#[derive(Deserialize)]
struct SaveBody {
    data: Value,
    revision_id: Uuid,
    lock_version: i32,
    note: Option<String>,
}

/// Saves a draft. Editable drafts are updated in place (optimistic locking); a submitted, approved or
/// released revision is never changed — a new draft revision is created instead.
async fn save_draft(
    state: &AppState,
    user: &CurrentUser,
    def: &CollectionDef,
    id: Uuid,
    b: SaveBody,
    action: &str,
) -> AppResult<Value> {
    let data = collections::validate(def.name, b.data).map_err(AppError::validation)?;
    let mut tx = state.db.begin().await?;
    let item = sqlx::query("select slug, draft_revision_id from content_items where id = $1 and collection = $2 for update")
        .bind(id)
        .bind(def.name)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(AppError::not_found)?;
    let slug: String = item.get("slug");
    if let Some(natural) = collections::natural_slug(def.name, &data) {
        if natural != slug {
            return Err(AppError::field(
                "slug",
                "The web address cannot be changed after creation. Create a new item and a redirect instead.",
            ));
        }
    }
    let draft_id: Uuid = item.get("draft_revision_id");
    let (status, lock, revision): (String, i32, i32) = sqlx::query_as(
        "select status, lock_version, revision from content_revisions where id = $1 for update",
    )
    .bind(draft_id)
    .fetch_one(&mut *tx)
    .await?;
    let conflict = || {
        AppError::conflict("edit_conflict", "Someone else saved this item after you opened it. Review their version before saving again.")
            .with_extra(json!({ "current_revision_id": draft_id, "current_lock_version": lock }))
    };
    if b.revision_id != draft_id {
        return Err(conflict());
    }
    let (rev_id, rev_no) = if status == "draft" || status == "changes_requested" {
        if b.lock_version != lock {
            return Err(conflict());
        }
        sqlx::query("update content_revisions set data = $2, lock_version = lock_version + 1, status = 'draft', updated_by = $3, updated_at = now(), note = coalesce($4, note) where id = $1")
            .bind(draft_id)
            .bind(&data)
            .bind(user.id)
            .bind(&b.note)
            .execute(&mut *tx)
            .await?;
        (draft_id, revision)
    } else {
        let next: i32 = sqlx::query_scalar(
            "select max(revision) + 1 from content_revisions where item_id = $1",
        )
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
        let new_id: Uuid = sqlx::query_scalar(
            "insert into content_revisions (item_id, revision, data, created_by, updated_by, note, source_revision_id) values ($1, $2, $3, $4, $4, $5, $6) returning id",
        )
        .bind(id)
        .bind(next)
        .bind(&data)
        .bind(user.id)
        .bind(&b.note)
        .bind(draft_id)
        .fetch_one(&mut *tx)
        .await?;
        if status == "in_review" {
            // The pending review was for the old revision; it no longer reflects what would be published.
            sqlx::query("update approvals set status = 'withdrawn' where subject_type = 'content_revision' and subject_id = $1 and status = 'pending'")
                .bind(draft_id)
                .execute(&mut *tx)
                .await?;
            sqlx::query("update content_revisions set status = 'superseded' where id = $1")
                .bind(draft_id)
                .execute(&mut *tx)
                .await?;
        }
        sqlx::query(
            "update content_items set draft_revision_id = $2, updated_at = now() where id = $1",
        )
        .bind(id)
        .bind(new_id)
        .execute(&mut *tx)
        .await?;
        (new_id, next)
    };
    add_contributor(&mut tx, rev_id, user.id).await?;
    refresh_media_usage(&mut tx, rev_id, &data).await?;
    after_branch_change(&mut tx, def.name, &data).await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        action,
        def.name,
        id,
        Outcome::Success,
        json!({ "slug": slug, "revision": rev_no }),
    )
    .await?;
    tx.commit().await?;
    load_detail(state, user, def, id).await
}

async fn save(
    State(state): State<AppState>,
    user: CurrentUser,
    Path((name, id)): Path<(String, Uuid)>,
    Json(b): Json<SaveBody>,
) -> AppResult<Json<Value>> {
    let def = collection(&name)?;
    user.require(def.edit_permission)?;
    Ok(Json(
        json!({ "data": save_draft(&state, &user, def, id, b, "content.saved").await? }),
    ))
}

/// Rate keys referenced by content must exist in an approved or pending rate set.
pub async fn unknown_rate_keys(
    conn: &mut PgConnection,
    keys: &BTreeSet<String>,
) -> AppResult<Vec<String>> {
    if keys.is_empty() {
        return Ok(vec![]);
    }
    let known: Vec<String> = sqlx::query_scalar(
        "select distinct e.key from rate_entries e join rate_sets s on s.id = e.rate_set_id
         where s.status in ('approved', 'in_review') and e.key = any($1)",
    )
    .bind(keys.iter().cloned().collect::<Vec<_>>())
    .fetch_all(&mut *conn)
    .await?;
    Ok(keys
        .iter()
        .filter(|k| !known.contains(k))
        .cloned()
        .collect())
}

#[derive(Deserialize)]
struct SubmitBody {
    note: Option<String>,
}

async fn submit(
    State(state): State<AppState>,
    user: CurrentUser,
    Path((name, id)): Path<(String, Uuid)>,
    Json(b): Json<SubmitBody>,
) -> AppResult<Json<Value>> {
    let def = collection(&name)?;
    user.require(def.edit_permission)?;
    if !def.requires_approval {
        return Err(AppError::conflict(
            "no_review",
            "This content does not need approval; publish it from the Publish center.",
        ));
    }
    let mut tx = state.db.begin().await?;
    let (draft_id, slug): (Uuid, String) = sqlx::query_as("select draft_revision_id, slug from content_items where id = $1 and collection = $2 for update")
        .bind(id)
        .bind(def.name)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(AppError::not_found)?;
    let (status, data): (String, Value) =
        sqlx::query_as("select status, data from content_revisions where id = $1 for update")
            .bind(draft_id)
            .fetch_one(&mut *tx)
            .await?;
    if status != "draft" && status != "changes_requested" {
        return Err(AppError::conflict(
            "not_a_draft",
            "Only drafts can be submitted for approval.",
        ));
    }
    let data = collections::validate(def.name, data).map_err(AppError::validation)?;
    let unknown = unknown_rate_keys(&mut tx, &tokens::scan(&data).rate_keys).await?;
    if !unknown.is_empty() {
        let mut f = FieldErrors::new();
        f.add(
            "data",
            format!(
                "These rate keys are not in any approved or pending rate set: {}",
                unknown.join(", ")
            ),
        );
        return Err(AppError::validation(f));
    }
    let note = b
        .note
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(str::to_owned);
    if def.financial && note.is_none() {
        return Err(AppError::field(
            "note",
            "Explain the change and name the source document (for example the approved leaflet).",
        ));
    }
    sqlx::query("update content_revisions set status = 'in_review', submitted_by = $2, submitted_at = now(), note = coalesce($3, note) where id = $1")
        .bind(draft_id)
        .bind(user.id)
        .bind(&note)
        .execute(&mut *tx)
        .await?;
    let approval_id: Uuid = sqlx::query_scalar("insert into approvals (subject_type, subject_id, submitted_by, submit_note) values ('content_revision', $1, $2, $3) returning id")
        .bind(draft_id)
        .bind(user.id)
        .bind(&note)
        .fetch_one(&mut *tx)
        .await?;
    let permission = if def.financial {
        "financial.approve"
    } else {
        "content.approve"
    };
    notifications::to_permission(
        &mut tx,
        permission,
        "approval_requested",
        &format!("Review requested: {} “{}”", def.label, slug),
        &format!("Submitted by {}", user.name),
        Some(&format!("/approvals/{approval_id}")),
        Some(user.id),
    )
    .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "content.submitted",
        def.name,
        id,
        Outcome::Success,
        json!({ "revision_id": draft_id, "approval_id": approval_id }),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({ "data": load_detail(&state, &user, def, id).await? }),
    ))
}

async fn revisions(
    State(state): State<AppState>,
    user: CurrentUser,
    Path((name, id)): Path<(String, Uuid)>,
) -> AppResult<Json<Value>> {
    let def = collection(&name)?;
    can_view(&user, def)?;
    let rows = sqlx::query(
        "select r.id, r.revision, r.status, r.created_at, r.updated_at, r.submitted_at, r.note, c.name as created_by,
                (i.live_revision_id = r.id) as is_live, (i.draft_revision_id = r.id) as is_draft
         from content_revisions r join content_items i on i.id = r.item_id left join users c on c.id = r.created_by
         where r.item_id = $1 and i.collection = $2 order by r.revision desc",
    )
    .bind(id)
    .bind(def.name)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(json!({ "data": rows.iter().map(|r| json!({
        "id": r.get::<Uuid, _>("id"), "revision": r.get::<i32, _>("revision"), "status": r.get::<String, _>("status"),
        "created_at": r.get::<DateTime<Utc>, _>("created_at"), "updated_at": r.get::<DateTime<Utc>, _>("updated_at"),
        "submitted_at": r.get::<Option<DateTime<Utc>>, _>("submitted_at"), "note": r.get::<Option<String>, _>("note"),
        "created_by": r.get::<Option<String>, _>("created_by"), "is_live": r.get::<Option<bool>, _>("is_live").unwrap_or(false),
        "is_draft": r.get::<Option<bool>, _>("is_draft").unwrap_or(false),
    })).collect::<Vec<_>>() })))
}

async fn revision(
    State(state): State<AppState>,
    user: CurrentUser,
    Path((name, id, rev)): Path<(String, Uuid, i32)>,
) -> AppResult<Json<Value>> {
    let def = collection(&name)?;
    can_view(&user, def)?;
    let (rev_id, status, data): (Uuid, String, Value) = sqlx::query_as(
        "select r.id, r.status, r.data from content_revisions r join content_items i on i.id = r.item_id where r.item_id = $1 and i.collection = $2 and r.revision = $3",
    )
    .bind(id)
    .bind(def.name)
    .bind(rev)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(AppError::not_found)?;
    Ok(Json(
        json!({ "data": { "id": rev_id, "revision": rev, "status": status, "data": data } }),
    ))
}

#[derive(Deserialize)]
struct RestoreBody {
    revision: i32,
    revision_id: Uuid,
    lock_version: i32,
}

/// Restoring copies an old revision into the current draft (a new revision); history is never rewritten.
async fn restore(
    State(state): State<AppState>,
    user: CurrentUser,
    Path((name, id)): Path<(String, Uuid)>,
    Json(b): Json<RestoreBody>,
) -> AppResult<Json<Value>> {
    let def = collection(&name)?;
    user.require(def.edit_permission)?;
    let data: Value = sqlx::query_scalar(
        "select data from content_revisions where item_id = $1 and revision = $2",
    )
    .bind(id)
    .bind(b.revision)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(AppError::not_found)?;
    let body = SaveBody {
        data,
        revision_id: b.revision_id,
        lock_version: b.lock_version,
        note: Some(format!("Restored from revision {}", b.revision)),
    };
    Ok(Json(
        json!({ "data": save_draft(&state, &user, def, id, body, "content.restored").await? }),
    ))
}

async fn set_archived(
    state: &AppState,
    user: &CurrentUser,
    name: &str,
    id: Uuid,
    archived: bool,
) -> AppResult<Value> {
    let def = collection(name)?;
    user.require(def.edit_permission)?;
    if def.singleton {
        return Err(AppError::conflict(
            "singleton",
            "This content cannot be archived.",
        ));
    }
    let n = sqlx::query("update content_items set archived_at = case when $3 then now() else null end, updated_at = now() where id = $1 and collection = $2")
        .bind(id)
        .bind(name)
        .bind(archived)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::not_found());
    }
    audit::record(
        &state.db,
        &user.actor(),
        if archived {
            "content.archived"
        } else {
            "content.unarchived"
        },
        name,
        id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    load_detail(state, user, def, id).await
}

async fn archive(
    State(state): State<AppState>,
    user: CurrentUser,
    Path((name, id)): Path<(String, Uuid)>,
) -> AppResult<Json<Value>> {
    Ok(Json(
        json!({ "data": set_archived(&state, &user, &name, id, true).await? }),
    ))
}

async fn unarchive(
    State(state): State<AppState>,
    user: CurrentUser,
    Path((name, id)): Path<(String, Uuid)>,
) -> AppResult<Json<Value>> {
    Ok(Json(
        json!({ "data": set_archived(&state, &user, &name, id, false).await? }),
    ))
}
