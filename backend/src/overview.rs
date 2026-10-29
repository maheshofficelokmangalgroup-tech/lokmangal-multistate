//! Read models for the admin shell: dashboard, audit log, directory lists and command search.
//! Every count and result respects the caller's permissions and branch scope.

use axum::{
    Json, Router,
    body::Body,
    extract::{Query, State},
    http::header,
    response::Response,
    routing::get,
};
use chrono::{DateTime, Duration, Utc};
use chrono_tz::Asia::Kolkata;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{Postgres, QueryBuilder, Row};
use uuid::Uuid;

use crate::{
    audit::{self, Outcome},
    auth::CurrentUser,
    error::{AppError, AppResult},
    rates,
    state::{AppState, PageQuery},
    text::spreadsheet_safe,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/dashboard", get(dashboard))
        .route("/audit", get(audit_list))
        .route("/audit/export", get(audit_export))
        .route("/directory/branches", get(branches))
        .route("/directory/assignees", get(assignees))
        .route("/search", get(search))
}

#[derive(Deserialize)]
struct RangeQuery {
    range: Option<String>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
}

fn lead_scope_sql(user: &CurrentUser, qb: &mut QueryBuilder<'_, Postgres>) -> bool {
    if user.can("leads.view.all") {
        true
    } else if user.can("leads.view.own_branch") {
        qb.push(" and e.branch_id = any(")
            .push_bind(user.branch_ids.clone())
            .push(")");
        true
    } else {
        false
    }
}

async fn dashboard(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(q): Query<RangeQuery>,
) -> AppResult<Json<Value>> {
    user.require("dashboard.view")?;
    let now = Utc::now();
    let start_of_today = now
        .with_timezone(&Kolkata)
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("midnight")
        .and_local_timezone(Kolkata)
        .single()
        .expect("IST")
        .with_timezone(&Utc);
    let (from, to) = match q.range.as_deref() {
        Some("today") => (start_of_today, now),
        Some("30d") => (start_of_today - Duration::days(29), now),
        Some("custom") => (
            q.from.unwrap_or(start_of_today - Duration::days(6)),
            q.to.unwrap_or(now),
        ),
        _ => (start_of_today - Duration::days(6), now),
    };
    let mut out = json!({ "range": { "from": from, "to": to } });

    let mut leads_scope = QueryBuilder::new("");
    let can_leads = lead_scope_sql(&user, &mut leads_scope);
    if can_leads {
        let mut qb = QueryBuilder::new("select count(*) filter (where e.created_at >= ");
        qb.push_bind(from).push(" and e.created_at < ").push_bind(to).push(" and e.status <> 'spam'), count(*) filter (where e.follow_up_at <= now() + interval '1 day' and e.status in ('new','contacted','in_progress')), count(*) filter (where e.status = 'new') from enquiries e where e.anonymized_at is null");
        lead_scope_sql(&user, &mut qb);
        let (new_leads, follow_ups, unhandled): (i64, i64, i64) =
            qb.build_query_as().fetch_one(&state.db).await?;

        let mut series = QueryBuilder::new(
            "select to_char((e.created_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day, e.kind, count(*) from enquiries e where e.status <> 'spam' and e.created_at >= ",
        );
        series
            .push_bind(from)
            .push(" and e.created_at < ")
            .push_bind(to);
        lead_scope_sql(&user, &mut series);
        series.push(" group by 1, 2 order by 1");
        let series: Vec<(String, String, i64)> =
            series.build_query_as().fetch_all(&state.db).await?;

        let mut by_branch = QueryBuilder::new(
            "select coalesce(b.name, 'Not assigned'), count(*) from enquiries e left join branches b on b.id = e.branch_id where e.status <> 'spam' and e.created_at >= ",
        );
        by_branch
            .push_bind(from)
            .push(" and e.created_at < ")
            .push_bind(to);
        lead_scope_sql(&user, &mut by_branch);
        by_branch.push(" group by 1 order by 2 desc limit 10");
        let by_branch: Vec<(String, i64)> = by_branch.build_query_as().fetch_all(&state.db).await?;

        let mut due = QueryBuilder::new(
            "select e.id, e.reference, e.name, e.kind, e.follow_up_at from enquiries e where e.status in ('new','contacted','in_progress') and e.follow_up_at <= now() + interval '1 day'",
        );
        lead_scope_sql(&user, &mut due);
        due.push(" and (e.assignee_id = ")
            .push_bind(user.id)
            .push(" or e.assignee_id is null) order by e.follow_up_at limit 8");
        type Due = (Uuid, String, String, String, Option<DateTime<Utc>>);
        let due: Vec<Due> = due.build_query_as().fetch_all(&state.db).await?;

        out["leads"] = json!({
            "new": new_leads, "follow_ups_due": follow_ups, "unhandled": unhandled,
            "series": series.into_iter().map(|(d, k, n)| json!({ "day": d, "kind": k, "count": n })).collect::<Vec<_>>(),
            "by_branch": by_branch.into_iter().map(|(b, n)| json!({ "branch": b, "count": n })).collect::<Vec<_>>(),
            "due": due.into_iter().map(|(id, r, n, k, at)| json!({ "id": id, "reference": r, "name": n, "kind": k, "follow_up_at": at })).collect::<Vec<_>>(),
        });
    }

    if user.can("financial.approve") || user.can("content.approve") {
        let pending: i64 = sqlx::query_scalar(
            "select count(*) from approvals a where a.status = 'pending' and a.submitted_by <> $1",
        )
        .bind(user.id)
        .fetch_one(&state.db)
        .await?;
        out["approvals_pending"] = json!(pending);
    }
    if user.can("site.publish") || user.can("content.edit") || user.can("products.edit") {
        let unreleased: i64 = sqlx::query_scalar("select count(*) from content_items where archived_at is null and draft_revision_id is distinct from live_revision_id").fetch_one(&state.db).await?;
        out["unreleased_changes"] = json!(unreleased);
    }
    let live = sqlx::query("select r.number, r.activated_at, r.status, s.label, s.valid_until from releases r left join rate_sets s on s.id = r.rate_set_id where r.kind = 'live' and r.status = 'live'")
        .fetch_optional(&state.db)
        .await?;
    let last_build = sqlx::query("select number, status, requested_at, error from releases where kind = 'live' order by number desc limit 1").fetch_optional(&state.db).await?;
    let today = rates::today_ist();
    out["publishing"] = json!({
        "live": live.as_ref().map(|l| json!({ "number": l.get::<i64, _>("number"), "activated_at": l.get::<Option<DateTime<Utc>>, _>("activated_at"), "rate_set": l.get::<Option<String>, _>("label") })),
        "rates_valid_until": live.as_ref().and_then(|l| l.get::<Option<chrono::NaiveDate>, _>("valid_until")),
        "rates_days_left": live.as_ref().and_then(|l| l.get::<Option<chrono::NaiveDate>, _>("valid_until")).map(|d| (d - today).num_days()),
        "last_build": last_build.map(|b| json!({ "number": b.get::<i64, _>("number"), "status": b.get::<String, _>("status"), "at": b.get::<DateTime<Utc>, _>("requested_at"), "error": b.get::<Option<String>, _>("error") })),
        "scheduled": sqlx::query_scalar::<_, i64>("select count(*) from releases where status = 'scheduled'").fetch_one(&state.db).await?,
    });
    if user.can("applications.view") {
        let new_apps: i64 = sqlx::query_scalar(
            "select count(*) from job_applications where status = 'new' and anonymized_at is null",
        )
        .fetch_one(&state.db)
        .await?;
        out["applications_new"] = json!(new_apps);
    }
    // Recent activity: everyone sees their own actions; auditors and admins see all non-sensitive events.
    let all = user.can("audit.view");
    let activity = sqlx::query(
        "select a.at, a.action, a.entity_type, a.entity_id, coalesce(u.name, a.actor_label) as actor from audit_events a left join users u on u.id = a.actor_id
         where ($1 or a.actor_id = $2) and a.action not like 'auth.%' and a.action not like '%viewed%' and a.outcome = 'success'
         order by a.at desc limit 12",
    )
    .bind(all)
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    out["activity"] = json!(activity.iter().map(|a| json!({ "at": a.get::<DateTime<Utc>, _>("at"), "action": a.get::<String, _>("action"), "entity_type": a.get::<Option<String>, _>("entity_type"), "entity_id": a.get::<Option<String>, _>("entity_id"), "actor": a.get::<Option<String>, _>("actor") })).collect::<Vec<_>>());
    out["scope"] = json!(if user.can("leads.view.all") {
        "all"
    } else if user.can("leads.view.own_branch") {
        "own_branches"
    } else {
        "none"
    });
    Ok(Json(json!({ "data": out })))
}

#[derive(Deserialize, Clone)]
struct AuditQuery {
    actor: Option<Uuid>,
    action: Option<String>,
    entity_type: Option<String>,
    entity_id: Option<String>,
    outcome: Option<String>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
}

fn audit_filters(qb: &mut QueryBuilder<'_, Postgres>, f: &AuditQuery) {
    if let Some(a) = f.actor {
        qb.push(" and a.actor_id = ").push_bind(a);
    }
    if let Some(a) = f.action.as_deref().filter(|s| !s.is_empty()) {
        qb.push(" and a.action like ")
            .push_bind(format!("{}%", a.replace(['%', '_'], "")));
    }
    if let Some(e) = f.entity_type.as_deref().filter(|s| !s.is_empty()) {
        qb.push(" and a.entity_type = ").push_bind(e.to_owned());
    }
    if let Some(e) = f.entity_id.as_deref().filter(|s| !s.is_empty()) {
        qb.push(" and a.entity_id = ").push_bind(e.to_owned());
    }
    if let Some(o) = f
        .outcome
        .as_deref()
        .filter(|s| ["success", "denied", "failure"].contains(s))
    {
        qb.push(" and a.outcome = ").push_bind(o.to_owned());
    }
    if let Some(from) = f.from {
        qb.push(" and a.at >= ").push_bind(from);
    }
    if let Some(to) = f.to {
        qb.push(" and a.at < ").push_bind(to);
    }
}

const AUDIT_SELECT: &str = "select a.id, a.at, a.action, a.entity_type, a.entity_id, a.outcome, a.request_id, host(a.ip) as ip, a.details,
        coalesce(u.name, a.actor_label) as actor from audit_events a left join users u on u.id = a.actor_id where true";

async fn audit_list(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(page): Query<PageQuery>,
    Query(f): Query<AuditQuery>,
) -> AppResult<Json<Value>> {
    user.require("audit.view")?;
    let mut qb = QueryBuilder::new(AUDIT_SELECT);
    audit_filters(&mut qb, &f);
    qb.push(" order by a.id desc limit ")
        .push_bind(page.limit())
        .push(" offset ")
        .push_bind(page.offset());
    let rows = qb.build().fetch_all(&state.db).await?;
    let mut count = QueryBuilder::new("select count(*) from audit_events a where true");
    audit_filters(&mut count, &f);
    let total: i64 = count.build_query_scalar().fetch_one(&state.db).await?;
    Ok(Json(json!({
        "data": rows.iter().map(|r| json!({
            "id": r.get::<i64, _>("id"), "at": r.get::<DateTime<Utc>, _>("at"), "action": r.get::<String, _>("action"),
            "entity_type": r.get::<Option<String>, _>("entity_type"), "entity_id": r.get::<Option<String>, _>("entity_id"),
            "outcome": r.get::<String, _>("outcome"), "request_id": r.get::<Option<String>, _>("request_id"), "ip": r.get::<Option<String>, _>("ip"),
            "details": r.get::<Value, _>("details"), "actor": r.get::<Option<String>, _>("actor"),
        })).collect::<Vec<_>>(),
        "meta": { "total": total, "page": page.page(), "per_page": page.limit() },
    })))
}

async fn audit_export(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(f): Query<AuditQuery>,
) -> AppResult<Response> {
    user.require("audit.export")?;
    let mut qb = QueryBuilder::new(AUDIT_SELECT);
    audit_filters(&mut qb, &f);
    qb.push(" order by a.id desc limit 50001");
    let rows = qb.build().fetch_all(&state.db).await?;
    if rows.len() > 50_000 {
        return Err(AppError::unprocessable(
            "too_many_rows",
            "More than 50,000 events match. Narrow the date range.",
        ));
    }
    let records: Vec<Vec<String>> = rows
        .iter()
        .map(|r| {
            [
                r.get::<DateTime<Utc>, _>("at")
                    .with_timezone(&Kolkata)
                    .format("%d-%m-%Y %H:%M:%S")
                    .to_string(),
                r.get::<Option<String>, _>("actor").unwrap_or_default(),
                r.get::<String, _>("action"),
                r.get::<Option<String>, _>("entity_type")
                    .unwrap_or_default(),
                r.get::<Option<String>, _>("entity_id").unwrap_or_default(),
                r.get::<String, _>("outcome"),
                r.get::<Option<String>, _>("ip").unwrap_or_default(),
                r.get::<Option<String>, _>("request_id").unwrap_or_default(),
                r.get::<Value, _>("details").to_string(),
            ]
            .iter()
            .map(|c| spreadsheet_safe(c))
            .collect()
        })
        .collect();
    let bytes = crate::exports::csv(
        &[
            "Time (IST)",
            "Actor",
            "Action",
            "Entity",
            "Entity id",
            "Outcome",
            "IP",
            "Request",
            "Details",
        ],
        &records,
    )?;
    audit::record(
        &state.db,
        &user.actor(),
        "audit.exported",
        "audit",
        "*",
        Outcome::Success,
        json!({ "rows": records.len() }),
    )
    .await?;
    Response::builder()
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"audit-log.csv\"",
        )
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(bytes))
        .map_err(AppError::internal)
}

async fn branches(State(state): State<AppState>, _user: CurrentUser) -> AppResult<Json<Value>> {
    let rows: Vec<(Uuid, String, String, String, bool, bool)> = sqlx::query_as(
        "select id, code, name, region, is_head_office, active from branches order by region, name",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "data": rows.into_iter().map(|(id, code, name, region, ho, active)| json!({ "id": id, "code": code, "name": name, "region": region, "head_office": ho, "active": active })).collect::<Vec<_>>() }),
    ))
}

#[derive(Deserialize)]
struct AssigneeQuery {
    branch_id: Option<Uuid>,
}

async fn assignees(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(q): Query<AssigneeQuery>,
) -> AppResult<Json<Value>> {
    user.require("leads.assign")?;
    let rows: Vec<(Uuid, String)> = sqlx::query_as(
        "select distinct u.id, u.name from users u join user_roles ur on ur.user_id = u.id join role_permissions rp on rp.role_id = ur.role_id
         where u.status = 'active' and (rp.permission = 'leads.view.all'
            or (rp.permission = 'leads.view.own_branch' and exists(select 1 from user_branch_scopes s where s.user_id = u.id and s.branch_id = $1)))
         order by u.name",
    )
    .bind(q.branch_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        json!({ "data": rows.into_iter().map(|(id, name)| json!({ "id": id, "name": name })).collect::<Vec<_>>() }),
    ))
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
}

/// Command palette search across records the user may open.
async fn search(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(s): Query<SearchQuery>,
) -> AppResult<Json<Value>> {
    let q = s.q.trim();
    if q.chars().count() < 2 {
        return Ok(Json(json!({ "data": [] })));
    }
    let like = format!("%{q}%");
    let mut results = vec![];
    let mut qb = QueryBuilder::new(
        "select e.id, e.reference, e.name from enquiries e where e.anonymized_at is null and (e.reference ilike ",
    );
    qb.push_bind(like.clone())
        .push(" or e.name ilike ")
        .push_bind(like.clone())
        .push(")");
    if lead_scope_sql(&user, &mut qb) {
        qb.push(" order by e.created_at desc limit 5");
        let rows: Vec<(Uuid, String, String)> = qb.build_query_as().fetch_all(&state.db).await?;
        results.extend(rows.into_iter().map(|(id, r, n)| json!({ "type": "lead", "title": format!("{r} — {n}"), "link": format!("/leads/{id}") })));
    }
    if user.can("content.view") || user.can("content.edit") || user.can("products.edit") {
        let rows: Vec<(Uuid, String, String, Option<String>)> = sqlx::query_as(
            "select i.id, i.collection, i.slug, coalesce(d.data->>'name', d.data->>'title') from content_items i join content_revisions d on d.id = i.draft_revision_id
             where i.archived_at is null and (i.slug ilike $1 or d.data->>'name' ilike $1 or d.data->>'title' ilike $1) limit 8",
        )
        .bind(&like)
        .fetch_all(&state.db)
        .await?;
        results.extend(rows.into_iter().map(|(id, c, slug, t)| json!({ "type": c, "title": t.unwrap_or(slug), "link": format!("/content/{c}/{id}") })));
    }
    if user.can("users.manage") {
        let rows: Vec<(Uuid, String, String)> = sqlx::query_as(
            "select id, name, email from users where name ilike $1 or email ilike $1 limit 5",
        )
        .bind(&like)
        .fetch_all(&state.db)
        .await?;
        results.extend(rows.into_iter().map(|(id, n, e)| json!({ "type": "user", "title": format!("{n} ({e})"), "link": format!("/admin/users/{id}") })));
    }
    Ok(Json(json!({ "data": results })))
}
