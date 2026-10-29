//! Maker–checker review queue. An approval belongs to one immutable revision; the database refuses a
//! decision by anyone who created, edited or submitted it — Super Admin included.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{PgConnection, Row};
use uuid::Uuid;

use crate::{
    audit::{self, Outcome},
    auth::CurrentUser,
    content::collections,
    diff,
    error::{AppError, AppResult},
    jobs, notifications, rates,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/approvals", get(list))
        .route("/approvals/{id}", get(detail))
        .route("/approvals/{id}/approve", post(approve))
        .route("/approvals/{id}/reject", post(reject))
}

struct Subject {
    kind: String,
    id: Uuid,
    title: String,
    financial: bool,
    collection: Option<String>,
    item_id: Option<Uuid>,
}

async fn subject(conn: &mut PgConnection, kind: &str, id: Uuid) -> AppResult<Subject> {
    if kind == "rate_set" {
        let label: String = sqlx::query_scalar(
            "select label || ' (revision ' || revision || ')' from rate_sets where id = $1",
        )
        .bind(id)
        .fetch_one(&mut *conn)
        .await?;
        return Ok(Subject {
            kind: kind.into(),
            id,
            title: format!("Interest rates {label}"),
            financial: true,
            collection: Some("rate_set".into()),
            item_id: None,
        });
    }
    let row = sqlx::query("select i.id, i.collection, i.slug, r.revision, r.data from content_revisions r join content_items i on i.id = r.item_id where r.id = $1")
        .bind(id)
        .fetch_one(&mut *conn)
        .await?;
    let collection: String = row.get("collection");
    let def = collections::get(&collection);
    let data: Value = row.get("data");
    let name = data
        .get("name")
        .or_else(|| data.get("title"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| row.get("slug"));
    Ok(Subject {
        kind: kind.into(),
        id,
        title: format!(
            "{}: {} (revision {})",
            def.map(|d| d.label).unwrap_or("Content"),
            name,
            row.get::<i32, _>("revision")
        ),
        financial: def.is_some_and(|d| d.financial),
        collection: Some(collection),
        item_id: Some(row.get("id")),
    })
}

fn decide_permission(s: &Subject) -> &'static str {
    if s.financial {
        "financial.approve"
    } else {
        "content.approve"
    }
}

/// Whether `user` may decide: permission plus independence (also enforced by a database trigger).
async fn independence(conn: &mut PgConnection, s: &Subject, user: Uuid) -> AppResult<bool> {
    let contributed: bool = if s.kind == "rate_set" {
        sqlx::query_scalar("select exists(select 1 from rate_set_contributors where rate_set_id = $1 and user_id = $2) or exists(select 1 from rate_sets where id = $1 and (created_by = $2 or submitted_by = $2))")
    } else {
        sqlx::query_scalar("select exists(select 1 from revision_contributors where revision_id = $1 and user_id = $2) or exists(select 1 from content_revisions where id = $1 and (created_by = $2 or submitted_by = $2))")
    }
    .bind(s.id)
    .bind(user)
    .fetch_one(&mut *conn)
    .await?;
    Ok(!contributed)
}

#[derive(Deserialize)]
struct ListQuery {
    status: Option<String>,
}

async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Value>> {
    let reviewer = user.can("financial.approve") || user.can("content.approve");
    let pending = q.status.as_deref() != Some("decided");
    let rows = sqlx::query(
        "select a.id, a.subject_type, a.subject_id, a.status, a.submitted_at, a.submit_note, a.decided_at, a.comment,
                a.submitted_by, s.name as submitted_by_name, r.name as reviewer_name
         from approvals a join users s on s.id = a.submitted_by left join users r on r.id = a.reviewer_id
         where (case when $1 then a.status = 'pending' else a.status in ('approved', 'rejected') end)
           and ($2 or a.submitted_by = $3)
         order by coalesce(a.decided_at, a.submitted_at) desc limit 200",
    )
    .bind(pending)
    .bind(reviewer)
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    let mut conn = state.db.acquire().await?;
    let mut data = vec![];
    for r in &rows {
        let s = subject(
            &mut conn,
            r.get::<&str, _>("subject_type"),
            r.get("subject_id"),
        )
        .await?;
        let mine = r.get::<Uuid, _>("submitted_by") == user.id;
        let can_decide = pending
            && user.can(decide_permission(&s))
            && independence(&mut conn, &s, user.id).await?;
        data.push(json!({
            "id": r.get::<Uuid, _>("id"), "subject_type": s.kind, "subject_id": s.id, "title": s.title, "collection": s.collection,
            "financial": s.financial, "status": r.get::<String, _>("status"), "submitted_at": r.get::<DateTime<Utc>, _>("submitted_at"),
            "submitted_by": r.get::<String, _>("submitted_by_name"), "note": r.get::<Option<String>, _>("submit_note"),
            "decided_at": r.get::<Option<DateTime<Utc>>, _>("decided_at"), "reviewer": r.get::<Option<String>, _>("reviewer_name"),
            "comment": r.get::<Option<String>, _>("comment"), "mine": mine, "can_decide": can_decide,
        }));
    }
    Ok(Json(json!({ "data": data })))
}

async fn detail(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let mut conn = state.db.acquire().await?;
    let a = sqlx::query(
        "select a.*, s.name as submitted_by_name, r.name as reviewer_name from approvals a
         join users s on s.id = a.submitted_by left join users r on r.id = a.reviewer_id where a.id = $1",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?
    .ok_or_else(AppError::not_found)?;
    let s = subject(
        &mut conn,
        a.get::<&str, _>("subject_type"),
        a.get("subject_id"),
    )
    .await?;
    let is_reviewer = user.can(decide_permission(&s));
    if !is_reviewer && a.get::<Uuid, _>("submitted_by") != user.id {
        return Err(AppError::not_found());
    }
    let status: String = a.get("status");
    let independent = independence(&mut conn, &s, user.id).await?;
    let (changes, contributors, warnings) = if s.kind == "rate_set" {
        let current = rates::entries(&mut conn, s.id).await?;
        let base = rates::comparison_base(&mut conn, s.id).await?;
        let base_entries = match &base {
            Some((b, _)) => rates::entries(&mut conn, *b).await?,
            None => vec![],
        };
        let meta: (chrono::NaiveDate, chrono::NaiveDate, Option<String>, Option<String>) =
            sqlx::query_as("select valid_from, valid_until, source_document, change_reason from rate_sets where id = $1").bind(s.id).fetch_one(&mut *conn).await?;
        let contributors: Vec<String> = sqlx::query_scalar("select u.name from rate_set_contributors c join users u on u.id = c.user_id where c.rate_set_id = $1").bind(s.id).fetch_all(&mut *conn).await?;
        let problems = rates::validate_entries(&current);
        (
            json!({
                "kind": "rate_set",
                "compared_with": base.map(|b| b.1),
                "valid_from": meta.0, "valid_until": meta.1, "source_document": meta.2, "change_reason": meta.3,
                "entries": current,
                "changes": rates::entry_diff(&base_entries, &current),
            }),
            contributors,
            problems.0.into_values().collect::<Vec<_>>(),
        )
    } else {
        let (data, item_id): (Value, Uuid) =
            sqlx::query_as("select data, item_id from content_revisions where id = $1")
                .bind(s.id)
                .fetch_one(&mut *conn)
                .await?;
        let live: Option<Value> = sqlx::query_scalar("select r.data from content_items i join content_revisions r on r.id = i.live_revision_id where i.id = $1")
            .bind(item_id)
            .fetch_optional(&mut *conn)
            .await?;
        let contributors: Vec<String> = sqlx::query_scalar("select u.name from revision_contributors c join users u on u.id = c.user_id where c.revision_id = $1").bind(s.id).fetch_all(&mut *conn).await?;
        let mut warnings = vec![];
        let unknown = crate::content::unknown_rate_keys(
            &mut conn,
            &crate::content::tokens::scan(&data).rate_keys,
        )
        .await?;
        if !unknown.is_empty() {
            warnings.push(format!(
                "Rate keys not found in an approved or pending rate set: {}",
                unknown.join(", ")
            ));
        }
        (
            json!({ "kind": "content", "collection": s.collection, "item_id": s.item_id, "data": data, "live": live, "changes": diff::diff(live.as_ref(), &data) }),
            contributors,
            warnings,
        )
    };
    Ok(Json(json!({ "data": {
        "id": id, "status": status, "title": s.title, "financial": s.financial, "subject_type": s.kind, "subject_id": s.id,
        "submitted_by": a.get::<String, _>("submitted_by_name"), "submitted_at": a.get::<DateTime<Utc>, _>("submitted_at"),
        "note": a.get::<Option<String>, _>("submit_note"), "reviewer": a.get::<Option<String>, _>("reviewer_name"),
        "decided_at": a.get::<Option<DateTime<Utc>>, _>("decided_at"), "comment": a.get::<Option<String>, _>("comment"),
        "contributors": contributors, "warnings": warnings, "review": changes,
        "can_decide": status == "pending" && is_reviewer && independent,
        "blocked_reason": if status != "pending" { Some("This review is closed.") }
            else if !is_reviewer { Some("Your role cannot approve this type of change.") }
            else if !independent { Some("You worked on this change, so a different person must review it.") }
            else { None },
    }})))
}

#[derive(Deserialize)]
struct DecisionBody {
    comment: Option<String>,
}

async fn decide(
    state: &AppState,
    user: &CurrentUser,
    id: Uuid,
    approve: bool,
    comment: Option<String>,
) -> AppResult<Value> {
    let comment = comment
        .map(|c| c.trim().to_owned())
        .filter(|c| !c.is_empty());
    if !approve && comment.is_none() {
        return Err(AppError::field("comment", "Explain what needs to change."));
    }
    let mut tx = state.db.begin().await?;
    let row: (String, Uuid, String, Uuid) = sqlx::query_as("select subject_type, subject_id, status, submitted_by from approvals where id = $1 for update")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(AppError::not_found)?;
    let (kind, subject_id, status, submitted_by) = row;
    if status != "pending" {
        return Err(AppError::conflict(
            "stale_review",
            "This review was already decided or withdrawn because the change was edited. Reload to see the current version.",
        ));
    }
    let s = subject(&mut tx, &kind, subject_id).await?;
    user.require(decide_permission(&s))?;
    if !independence(&mut tx, &s, user.id).await? {
        audit::record_best_effort(
            &state.db,
            &user.actor(),
            "approval.self_review_blocked",
            &kind,
            subject_id,
            Outcome::Denied,
            json!({ "approval_id": id }),
        )
        .await;
        return Err(AppError::forbidden(
            "You worked on this change, so a different person must review it.",
        ));
    }
    sqlx::query("update approvals set status = $2, reviewer_id = $3, decided_at = now(), comment = $4 where id = $1")
        .bind(id)
        .bind(if approve { "approved" } else { "rejected" })
        .bind(user.id)
        .bind(&comment)
        .execute(&mut *tx)
        .await?;
    let new_status = if approve {
        "approved"
    } else {
        "changes_requested"
    };
    let mut future_rate_set = false;
    if kind == "rate_set" {
        if approve {
            // Replace the earlier approved revision of the same set (same lineage) before approving this one.
            let lineage: Uuid =
                sqlx::query_scalar("select lineage_id from rate_sets where id = $1")
                    .bind(subject_id)
                    .fetch_one(&mut *tx)
                    .await?;
            sqlx::query("update rate_sets set status = 'superseded' where lineage_id = $1 and status = 'approved' and id <> $2").bind(lineage).bind(subject_id).execute(&mut *tx).await?;
        }
        sqlx::query("update rate_sets set status = $2 where id = $1")
            .bind(subject_id)
            .bind(new_status)
            .execute(&mut *tx)
            .await?;
        if approve {
            let from: chrono::NaiveDate =
                sqlx::query_scalar("select valid_from from rate_sets where id = $1")
                    .bind(subject_id)
                    .fetch_one(&mut *tx)
                    .await?;
            future_rate_set = from > rates::today_ist();
        }
    } else {
        sqlx::query("update content_revisions set status = $2 where id = $1")
            .bind(subject_id)
            .bind(new_status)
            .execute(&mut *tx)
            .await?;
    }
    let link = match (&s.collection, s.item_id) {
        (Some(c), Some(item)) => format!("/content/{c}/{item}"),
        _ => format!("/products/rates/{subject_id}"),
    };
    let title = if approve {
        format!("Approved: {}", s.title)
    } else {
        format!("Changes requested: {}", s.title)
    };
    notifications::to_user(
        &mut tx,
        submitted_by,
        if approve {
            "approval_approved"
        } else {
            "approval_rejected"
        },
        &title,
        Some(&link),
    )
    .await?;
    if approve {
        notifications::to_permission(
            &mut tx,
            "site.publish",
            "ready_to_publish",
            &format!("Ready to publish: {}", s.title),
            "",
            Some("/publish"),
            None,
        )
        .await?;
    }
    if future_rate_set {
        jobs::enqueue(
            &mut tx,
            "prepare_rate_release",
            json!({ "rate_set_id": subject_id }),
            None,
            Some(&format!("prepare:{subject_id}")),
        )
        .await?;
    }
    audit::record(
        &mut *tx,
        &user.actor(),
        if approve {
            "approval.approved"
        } else {
            "approval.rejected"
        },
        &kind,
        subject_id,
        Outcome::Success,
        json!({ "approval_id": id, "comment": comment }),
    )
    .await?;
    tx.commit().await?;
    Ok(
        json!({ "id": id, "status": if approve { "approved" } else { "rejected" }, "prepared_future_release": future_rate_set }),
    )
}

async fn approve(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<DecisionBody>,
) -> AppResult<Json<Value>> {
    Ok(Json(
        json!({ "data": decide(&state, &user, id, true, b.comment).await? }),
    ))
}

async fn reject(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<DecisionBody>,
) -> AppResult<Json<Value>> {
    Ok(Json(
        json!({ "data": decide(&state, &user, id, false, b.comment).await? }),
    ))
}
