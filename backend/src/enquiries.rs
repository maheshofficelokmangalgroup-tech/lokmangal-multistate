//! Website enquiries ("leads"): public intake (POST /api/v1/enquiries) and the staff inbox
//! (/api/admin/leads). Branch managers only ever see their own branches' leads — in lists, counts,
//! search, details, exports and bulk changes alike.

use std::time::Duration as StdDuration;

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, Request, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Datelike, Utc};
use chrono_tz::Asia::Kolkata;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{FromRow, PgConnection, Postgres, QueryBuilder, Row};
use uuid::Uuid;

use crate::{
    audit::{self, Actor, Outcome},
    auth::CurrentUser,
    careers,
    error::{AppError, AppResult, FieldErrors},
    forms, jobs, live,
    mail::OutgoingEmail,
    security::sha256_hex,
    settings,
    state::{AppState, ClientMeta, PageQuery},
    text::{
        clean_line, clean_multiline, mask_email, mask_phone, normalize_phone, spreadsheet_safe,
        valid_email,
    },
};

pub const KINDS: [&str; 6] = [
    "account", "deposit", "loan", "contact", "callback", "service",
];
pub const STATUSES: [&str; 6] = [
    "new",
    "contacted",
    "in_progress",
    "converted",
    "not_interested",
    "spam",
];
const CLOSED: [&str; 3] = ["converted", "not_interested", "spam"];
pub const ACCOUNT_TYPES: [&str; 3] = ["Savings Account", "Current Account", "Recurring Deposit"];
pub const CONSENT_VERSION: &str = "2026-10-enquiry";

pub fn public_router() -> Router<AppState> {
    Router::new().route("/enquiries", post(submit))
}

pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/leads", get(list))
        .route("/leads/export", get(export))
        .route("/leads/{id}", get(detail).patch(update))
        .route("/leads/{id}/notes", post(add_note))
        .route("/leads/{id}/follow-ups", post(set_follow_up))
}

// ------------------------------------------------------------------------------------------------
// Public intake
// ------------------------------------------------------------------------------------------------

pub fn idempotency_key(headers: &HeaderMap, form: &forms::FormData) -> AppResult<Option<String>> {
    let key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
        .or_else(|| form.opt("idempotency_key").map(str::to_owned));
    match key {
        Some(k)
            if (8..=100).contains(&k.len())
                && k.chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') =>
        {
            Ok(Some(k))
        }
        Some(_) => Err(AppError::bad_request("Invalid Idempotency-Key.")),
        None => Ok(None),
    }
}

/// Hash of the meaningful fields, so a retry with the same key and the same content returns the original
/// reference, while a different payload under the same key is refused.
pub fn request_hash(form: &forms::FormData) -> String {
    let mut pairs: Vec<(&String, &String)> = form
        .fields
        .iter()
        .filter(|(k, _)| !matches!(k.as_str(), "ts" | "website" | "idempotency_key" | "page"))
        .collect();
    pairs.sort();
    sha256_hex(serde_json::to_string(&pairs).unwrap_or_default().as_bytes())
}

/// Spam signals are recorded, not treated as proof: the enquiry is stored as "spam" for staff review.
pub fn spam_signals(form: &forms::FormData) -> Vec<&'static str> {
    let mut signals = vec![];
    if !form.get("website").is_empty() {
        signals.push("honeypot");
    }
    if let Ok(ts) = form.get("ts").parse::<i64>() {
        let elapsed = Utc::now().timestamp_millis() - ts;
        if (0..3000).contains(&elapsed) {
            signals.push("submitted_too_fast");
        }
    }
    signals
}

pub fn reference(prefix: &str, n: i64) -> String {
    format!(
        "{prefix}-{}-{n:05}",
        Utc::now().with_timezone(&Kolkata).year()
    )
}

struct NewEnquiry {
    kind: &'static str,
    name: String,
    phone: String,
    phone_normalized: String,
    email: Option<String>,
    city: Option<String>,
    product: Option<String>,
    amount: Option<i64>,
    message: Option<String>,
    details: Value,
    branch_code: Option<String>,
}

fn validate(
    form: &forms::FormData,
    kind: &'static str,
    options: Option<&live::FormOptions>,
) -> AppResult<NewEnquiry> {
    let mut errors = FieldErrors::new();
    let name = if matches!(kind, "account" | "deposit") {
        let parts = [
            form.get("first_name"),
            form.get("middle_name"),
            form.get("last_name"),
        ];
        if parts[0].is_empty() {
            errors.add("first_name", "Enter your first name.");
        }
        if parts[2].is_empty() {
            errors.add("last_name", "Enter your last name.");
        }
        clean_line(
            &parts
                .iter()
                .filter(|p| !p.is_empty())
                .copied()
                .collect::<Vec<_>>()
                .join(" "),
        )
    } else {
        let n = clean_line(form.get("name"));
        if n.chars().count() < 2 {
            errors.add("name", "Enter your full name.");
        }
        n
    };
    if name.chars().count() > 120 {
        errors.add("name", "Name is too long.");
    }
    let phone = clean_line(form.get("phone"));
    let phone_normalized = normalize_phone(&phone);
    if phone_normalized.is_none() {
        errors.add("phone", "Enter a valid 10-digit mobile or phone number.");
    }
    let email = form.opt("email").map(|e| e.to_lowercase());
    match &email {
        Some(e) if !valid_email(e) => errors.add("email", "Enter a valid email address."),
        None if kind != "callback" => errors.add("email", "Enter your email address."),
        _ => {}
    }
    let city = form.opt("city").map(clean_line);
    if city.is_none() && kind != "contact" {
        errors.add("city", "Enter your city or location.");
    }
    if city.as_ref().is_some_and(|c| c.chars().count() > 80) {
        errors.add("city", "City is too long.");
    }
    let message = form.opt("message").map(clean_multiline);
    if kind == "contact" && message.is_none() {
        errors.add("message", "Tell us how we can help.");
    }
    if message.as_ref().is_some_and(|m| m.chars().count() > 2000) {
        errors.add("message", "Please keep your message under 2000 characters.");
    }
    if form.get("consent").is_empty() {
        errors.add(
            "consent",
            "Please agree to be contacted about your enquiry.",
        );
    }

    let retired = "This option is no longer available. Please choose again.";
    let (product, amount) = match kind {
        "account" => {
            let p = form.get("account_type");
            if !ACCOUNT_TYPES.contains(&p) {
                errors.add("account_type", "Choose an account type.");
            }
            (Some(p.to_owned()), None)
        }
        "deposit" => {
            let p = form.get("deposit_type");
            match options {
                Some(o) if !o.deposit_types.iter().any(|d| d == p) => {
                    errors.add("deposit_type", retired)
                }
                _ if p.is_empty() => errors.add("deposit_type", "Choose a deposit."),
                _ => {}
            }
            (Some(p.to_owned()), None)
        }
        "loan" => {
            let p = form.get("loan_type");
            match options {
                Some(o) if !o.loan_types.iter().any(|d| d == p) => errors.add("loan_type", retired),
                _ if p.is_empty() => errors.add("loan_type", "Choose a loan."),
                _ => {}
            }
            let amount = form
                .get("amount")
                .replace([',', ' '], "")
                .parse::<i64>()
                .ok();
            if !amount.is_some_and(|a| (1000..=10_000_000_000).contains(&a)) {
                errors.add(
                    "amount",
                    "Enter the loan amount in rupees (at least ₹1,000).",
                );
            }
            (Some(p.to_owned()), amount)
        }
        "callback" => (form.opt("interest").map(clean_line), None),
        _ => (None, None),
    };
    let branch_code = form.opt("branch").map(|b| b.to_uppercase());
    if let (Some(code), Some(o)) = (&branch_code, options)
        && !o.branch_codes.iter().any(|b| b == code)
    {
        errors.add("branch", retired);
    }
    errors.into_result()?;
    Ok(NewEnquiry {
        kind,
        name,
        phone,
        phone_normalized: phone_normalized.expect("validated"),
        email,
        city,
        product: product.filter(|p| !p.is_empty()),
        amount,
        message,
        details: json!({ "middle_name": form.opt("middle_name") }),
        branch_code,
    })
}

async fn submit(
    State(state): State<AppState>,
    meta: ClientMeta,
    headers: HeaderMap,
    req: Request,
) -> AppResult<Response> {
    if !state
        .public_limiter
        .allow("enquiry", meta.ip, 8, StdDuration::from_secs(3600))
    {
        return Err(AppError::too_many(
            "Too many requests from your connection. Please call us instead.",
        ));
    }
    let form = forms::read(req, &state, None).await?;
    let kind = match form.get("form") {
        "career" => return careers::submit_from_form(state, meta, &headers, form).await,
        k => KINDS
            .iter()
            .find(|x| **x == k)
            .copied()
            .ok_or_else(|| AppError::field("form", "Unknown form type."))?,
    };
    let options = live::form_options(&state.db).await?;
    let e = validate(&form, kind, options.as_ref())?;
    let idem = idempotency_key(&headers, &form)?;
    let hash = request_hash(&form);
    let signals = spam_signals(&form);

    let mut tx = state.db.begin().await?;
    if let Some(key) = &idem {
        let existing: Option<(String, Option<String>)> = sqlx::query_as(
            "select reference, request_hash from enquiries where idempotency_key = $1",
        )
        .bind(key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((reference, existing_hash)) = existing {
            if existing_hash.as_deref() != Some(hash.as_str()) {
                return Err(AppError::conflict(
                    "idempotency_conflict",
                    "This request key was already used for different details.",
                ));
            }
            return Ok((StatusCode::OK, Json(json!({ "data": { "reference": reference, "status": "received" }, "request_id": meta.request_id })))
                .into_response());
        }
    }
    let branch_id: Option<Uuid> = match &e.branch_code {
        Some(code) => {
            sqlx::query_scalar("select id from branches where code = $1 and active")
                .bind(code)
                .fetch_optional(&mut *tx)
                .await?
        }
        None => None,
    };
    let duplicate: Option<Uuid> = sqlx::query_scalar(
        "select id from enquiries where phone_normalized = $1 and created_at > now() - interval '30 days' and status <> 'spam'
         order by created_at desc limit 1",
    )
    .bind(&e.phone_normalized)
    .fetch_optional(&mut *tx)
    .await?;
    let n: i64 = sqlx::query_scalar("select nextval('enquiry_reference_seq')")
        .fetch_one(&mut *tx)
        .await?;
    let reference = reference("LMS", n);
    let retention_months = settings::privacy(&mut tx).await?.lead_retention_months;
    let mut details = e.details.clone();
    if !signals.is_empty() {
        details["spam_signals"] = json!(signals);
    }
    let id: Uuid = sqlx::query_scalar(
        "insert into enquiries (reference, kind, name, phone, phone_normalized, email, city, product, amount, message, details,
             branch_id, status, possible_duplicate_of, source_page, consent_version, consent_at, idempotency_key, request_hash,
             retention_until)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now(), $17, $18,
                 (now() at time zone 'Asia/Kolkata')::date + make_interval(months => $19))
         returning id",
    )
    .bind(&reference)
    .bind(e.kind)
    .bind(&e.name)
    .bind(&e.phone)
    .bind(&e.phone_normalized)
    .bind(&e.email)
    .bind(&e.city)
    .bind(&e.product)
    .bind(e.amount)
    .bind(&e.message)
    .bind(details)
    .bind(branch_id)
    .bind(if signals.is_empty() { "new" } else { "spam" })
    .bind(duplicate)
    .bind(form.opt("page").map(|p| p.chars().take(200).collect::<String>()))
    .bind(form.opt("consent_version").unwrap_or(CONSENT_VERSION))
    .bind(&idem)
    .bind(&hash)
    .bind(retention_months as i32)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "insert into enquiry_events (enquiry_id, kind, to_value) values ($1, 'created', $2)",
    )
    .bind(id)
    .bind(e.kind)
    .execute(&mut *tx)
    .await?;
    if signals.is_empty() {
        jobs::enqueue(
            &mut tx,
            "notify_enquiry",
            json!({ "enquiry_id": id }),
            None,
            None,
        )
        .await?;
    }
    audit::record(
        &mut *tx,
        &Actor::anonymous(&meta),
        "enquiry.received",
        "enquiry",
        &reference,
        Outcome::Success,
        json!({ "kind": e.kind, "spam_signals": signals }),
    )
    .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(json!({ "data": { "reference": reference, "status": "received" }, "request_id": meta.request_id }))).into_response())
}

/// Background job: email the department (and the branch, if one was chosen). No contact details in the email.
pub async fn notify(state: &AppState, enquiry_id: Uuid) -> anyhow::Result<()> {
    let row = sqlx::query(
        "select e.reference, e.kind, e.product, e.city, e.name, b.name as branch, b.notification_email
         from enquiries e left join branches b on b.id = e.branch_id where e.id = $1",
    )
    .bind(enquiry_id)
    .fetch_one(&state.db)
    .await?;
    let kind: String = row.get("kind");
    let mut conn = state.db.acquire().await?;
    let cfg = settings::notifications(&mut conn).await?;
    let mut to: Vec<String> = cfg
        .by_kind
        .get(&kind)
        .cloned()
        .unwrap_or_else(|| cfg.default_recipients.clone());
    if let Some(email) = row.get::<Option<String>, _>("notification_email") {
        to.push(email);
    }
    to.sort();
    to.dedup();
    let reference: String = row.get("reference");
    let link = state.config.admin_link(&format!("/leads?ref={reference}"));
    let text = format!(
        "A new {kind} enquiry has arrived.\n\nReference: {reference}\nProduct: {}\nCity: {}\nBranch: {}\nName: {}\n\nOpen it in the admin panel to see contact details:\n{link}\n",
        row.get::<Option<String>, _>("product")
            .unwrap_or_else(|| "—".into()),
        row.get::<Option<String>, _>("city")
            .unwrap_or_else(|| "—".into()),
        row.get::<Option<String>, _>("branch")
            .unwrap_or_else(|| "Not chosen".into()),
        row.get::<String, _>("name"),
    );
    state
        .mailer
        .send(&OutgoingEmail {
            to,
            subject: format!("New website enquiry {reference}"),
            text,
        })
        .await
}

// ------------------------------------------------------------------------------------------------
// Staff inbox
// ------------------------------------------------------------------------------------------------

#[derive(Clone)]
enum Scope {
    All,
    Branches(Vec<Uuid>),
}

fn scope(user: &CurrentUser) -> AppResult<Scope> {
    if user.can("leads.view.all") {
        Ok(Scope::All)
    } else if user.can("leads.view.own_branch") {
        Ok(Scope::Branches(user.branch_ids.clone()))
    } else {
        Err(AppError::missing_permission("leads.view.own_branch"))
    }
}

fn push_scope(qb: &mut QueryBuilder<'_, Postgres>, scope: &Scope) {
    if let Scope::Branches(ids) = scope {
        qb.push(" and e.branch_id = any(")
            .push_bind(ids.clone())
            .push(")");
    }
}

#[derive(Deserialize, Default)]
struct LeadFilters {
    status: Option<String>,
    kind: Option<String>,
    branch: Option<Uuid>,
    assignee: Option<String>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
    follow_up_due: Option<bool>,
    duplicate: Option<bool>,
    q: Option<String>,
    sort: Option<String>,
    #[serde(rename = "ref")]
    reference: Option<String>,
}

fn push_filters(qb: &mut QueryBuilder<'_, Postgres>, f: &LeadFilters, user: &CurrentUser) {
    if let Some(s) = f.status.as_deref().filter(|s| STATUSES.contains(s)) {
        qb.push(" and e.status = ").push_bind(s.to_owned());
    } else if f.status.as_deref() == Some("open") {
        qb.push(" and e.status in ('new', 'contacted', 'in_progress')");
    }
    if let Some(k) = f.kind.as_deref().filter(|k| KINDS.contains(k)) {
        qb.push(" and e.kind = ").push_bind(k.to_owned());
    }
    if let Some(b) = f.branch {
        qb.push(" and e.branch_id = ").push_bind(b);
    }
    match f.assignee.as_deref() {
        Some("me") => {
            qb.push(" and e.assignee_id = ").push_bind(user.id);
        }
        Some("none") => {
            qb.push(" and e.assignee_id is null");
        }
        Some(id) => {
            if let Ok(id) = id.parse::<Uuid>() {
                qb.push(" and e.assignee_id = ").push_bind(id);
            }
        }
        None => {}
    }
    if let Some(from) = f.from {
        qb.push(" and e.created_at >= ").push_bind(from);
    }
    if let Some(to) = f.to {
        qb.push(" and e.created_at < ").push_bind(to);
    }
    if f.follow_up_due == Some(true) {
        qb.push(" and e.follow_up_at <= now() and e.status in ('new', 'contacted', 'in_progress')");
    }
    if f.duplicate == Some(true) {
        qb.push(" and e.possible_duplicate_of is not null");
    }
    if let Some(r) = f.reference.as_deref().filter(|r| !r.is_empty()) {
        qb.push(" and e.reference = ").push_bind(r.to_uppercase());
    }
    if let Some(q) = f.q.as_deref().map(str::trim).filter(|q| q.len() >= 2) {
        let digits: String = q.chars().filter(|c| c.is_ascii_digit()).collect();
        qb.push(" and (e.reference ilike ")
            .push_bind(format!("%{q}%"));
        qb.push(" or e.name ilike ").push_bind(format!("%{q}%"));
        if digits.len() >= 4 {
            qb.push(" or e.phone_normalized like ")
                .push_bind(format!("%{digits}%"));
        }
        qb.push(")");
    }
}

fn order_by(sort: Option<&str>) -> &'static str {
    match sort {
        Some("created_at") => " order by e.created_at asc, e.id",
        Some("follow_up_at") => " order by e.follow_up_at asc nulls last, e.id",
        Some("-follow_up_at") => " order by e.follow_up_at desc nulls last, e.id",
        Some("reference") => " order by e.reference asc",
        _ => " order by e.created_at desc, e.id",
    }
}

#[derive(FromRow)]
struct LeadRow {
    id: Uuid,
    reference: String,
    kind: String,
    name: String,
    phone_normalized: String,
    email: Option<String>,
    city: Option<String>,
    product: Option<String>,
    status: String,
    branch_id: Option<Uuid>,
    branch_name: Option<String>,
    assignee_id: Option<Uuid>,
    assignee_name: Option<String>,
    follow_up_at: Option<DateTime<Utc>>,
    possible_duplicate_of: Option<Uuid>,
    created_at: DateTime<Utc>,
}

const LEAD_SELECT: &str = "select e.id, e.reference, e.kind, e.name, e.phone_normalized, e.email, e.city, e.product, e.status,
        e.branch_id, b.name as branch_name, e.assignee_id, u.name as assignee_name, e.follow_up_at, e.possible_duplicate_of, e.created_at
    from enquiries e left join branches b on b.id = e.branch_id left join users u on u.id = e.assignee_id
    where e.anonymized_at is null";

fn lead_json(r: &LeadRow, reveal: bool) -> Value {
    json!({
        "id": r.id,
        "reference": r.reference,
        "kind": r.kind,
        "name": r.name,
        "phone": if reveal { r.phone_normalized.clone() } else { mask_phone(&r.phone_normalized) },
        "email": r.email.as_deref().map(|e| if reveal { e.to_owned() } else { mask_email(e) }),
        "contact_masked": !reveal,
        "city": r.city,
        "product": r.product,
        "status": r.status,
        "branch": r.branch_id.map(|id| json!({ "id": id, "name": r.branch_name })),
        "assignee": r.assignee_id.map(|id| json!({ "id": id, "name": r.assignee_name })),
        "follow_up_at": r.follow_up_at,
        "possible_duplicate": r.possible_duplicate_of.is_some(),
        "created_at": r.created_at,
    })
}

async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(page): Query<PageQuery>,
    Query(f): Query<LeadFilters>,
) -> AppResult<Json<Value>> {
    let scope = scope(&user)?;
    let mut qb = QueryBuilder::new(LEAD_SELECT);
    push_scope(&mut qb, &scope);
    push_filters(&mut qb, &f, &user);
    qb.push(order_by(f.sort.as_deref()));
    qb.push(" limit ")
        .push_bind(page.limit())
        .push(" offset ")
        .push_bind(page.offset());
    let rows: Vec<LeadRow> = qb.build_query_as().fetch_all(&state.db).await?;

    let mut count =
        QueryBuilder::new("select count(*) from enquiries e where e.anonymized_at is null");
    push_scope(&mut count, &scope);
    push_filters(&mut count, &f, &user);
    let total: i64 = count.build_query_scalar().fetch_one(&state.db).await?;

    // Status tab counts use the same scope and filters, except status itself.
    let mut tabs = QueryBuilder::new(
        "select e.status, count(*) from enquiries e where e.anonymized_at is null",
    );
    push_scope(&mut tabs, &scope);
    push_filters(
        &mut tabs,
        &LeadFilters {
            status: None,
            ..clone_filters(&f)
        },
        &user,
    );
    tabs.push(" group by e.status");
    let by_status: Vec<(String, i64)> = tabs.build_query_as().fetch_all(&state.db).await?;

    Ok(Json(json!({
        "data": rows.iter().map(|r| lead_json(r, false)).collect::<Vec<_>>(),
        "meta": { "total": total, "page": page.page(), "per_page": page.limit(),
                  "by_status": by_status.into_iter().collect::<std::collections::BTreeMap<_, _>>(),
                  "scope": match scope { Scope::All => "all", Scope::Branches(_) => "own_branches" } },
    })))
}

fn clone_filters(f: &LeadFilters) -> LeadFilters {
    LeadFilters {
        status: f.status.clone(),
        kind: f.kind.clone(),
        branch: f.branch,
        assignee: f.assignee.clone(),
        from: f.from,
        to: f.to,
        follow_up_due: f.follow_up_due,
        duplicate: f.duplicate,
        q: f.q.clone(),
        sort: None,
        reference: f.reference.clone(),
    }
}

async fn load_scoped(
    conn: &mut PgConnection,
    user: &CurrentUser,
    id: Uuid,
    lock: bool,
) -> AppResult<LeadRow> {
    let scope = scope(user)?;
    let mut qb = QueryBuilder::new(LEAD_SELECT);
    qb.push(" and e.id = ").push_bind(id);
    push_scope(&mut qb, &scope);
    if lock {
        qb.push(" for update of e");
    }
    qb.build_query_as::<LeadRow>()
        .fetch_optional(&mut *conn)
        .await?
        .ok_or_else(AppError::not_found)
}

async fn detail(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let mut conn = state.db.acquire().await?;
    let lead = load_scoped(&mut conn, &user, id, false).await?;
    let reveal = user.can("leads.contact.reveal");
    let extra = sqlx::query(
        "select phone, amount, message, details, source_page, consent_version, consent_at, retention_until, possible_duplicate_of
         from enquiries where id = $1",
    )
    .bind(id)
    .fetch_one(&mut *conn)
    .await?;
    let notes = sqlx::query("select n.id, n.body, n.created_at, u.name from enquiry_notes n join users u on u.id = n.author_id where n.enquiry_id = $1 order by n.created_at")
        .bind(id)
        .fetch_all(&mut *conn)
        .await?;
    let events = sqlx::query("select ev.kind, ev.from_value, ev.to_value, ev.note, ev.at, u.name from enquiry_events ev left join users u on u.id = ev.actor_id where ev.enquiry_id = $1 order by ev.at")
        .bind(id)
        .fetch_all(&mut *conn)
        .await?;
    let scope = scope(&user)?;
    let mut related = QueryBuilder::new(LEAD_SELECT);
    related
        .push(" and e.phone_normalized = ")
        .push_bind(lead.phone_normalized.clone())
        .push(" and e.id <> ")
        .push_bind(id);
    push_scope(&mut related, &scope);
    related.push(" order by e.created_at desc limit 10");
    let related: Vec<LeadRow> = related.build_query_as().fetch_all(&mut *conn).await?;

    audit::record(
        &mut *conn,
        &user.actor(),
        if reveal {
            "lead.viewed_with_contact"
        } else {
            "lead.viewed"
        },
        "enquiry",
        &lead.reference,
        Outcome::Success,
        json!({}),
    )
    .await?;

    let mut data = lead_json(&lead, reveal);
    data["phone_as_entered"] = if reveal {
        json!(extra.get::<String, _>("phone"))
    } else {
        Value::Null
    };
    data["amount"] = json!(extra.get::<Option<i64>, _>("amount"));
    data["message"] = json!(extra.get::<Option<String>, _>("message"));
    data["details"] = extra.get::<Value, _>("details");
    data["source_page"] = json!(extra.get::<Option<String>, _>("source_page"));
    data["consent"] = json!({ "version": extra.get::<Option<String>, _>("consent_version"), "at": extra.get::<Option<DateTime<Utc>>, _>("consent_at") });
    data["retention_until"] = json!(extra.get::<Option<chrono::NaiveDate>, _>("retention_until"));
    data["notes"] = json!(notes.iter().map(|n| json!({ "id": n.get::<Uuid, _>("id"), "body": n.get::<String, _>("body"), "created_at": n.get::<DateTime<Utc>, _>("created_at"), "author": n.get::<String, _>("name") })).collect::<Vec<_>>());
    data["events"] = json!(events.iter().map(|e| json!({ "kind": e.get::<String, _>("kind"), "from": e.get::<Option<String>, _>("from_value"), "to": e.get::<Option<String>, _>("to_value"), "note": e.get::<Option<String>, _>("note"), "at": e.get::<DateTime<Utc>, _>("at"), "actor": e.get::<Option<String>, _>("name") })).collect::<Vec<_>>());
    data["related"] = json!(
        related
            .iter()
            .map(|r| lead_json(r, false))
            .collect::<Vec<_>>()
    );
    data["allowed"] = json!({
        "update": user.can("leads.update"),
        "assign": user.can("leads.assign"),
        "statuses": STATUSES,
    });
    Ok(Json(json!({ "data": data })))
}

/// Reads an optional nullable field: absent → None, null → Some(None), value → Some(Some(v)).
fn nullable<T: serde::de::DeserializeOwned>(
    body: &Value,
    key: &str,
) -> AppResult<Option<Option<T>>> {
    match body.get(key) {
        None => Ok(None),
        Some(Value::Null) => Ok(Some(None)),
        Some(v) => serde_json::from_value(v.clone())
            .map(|x| Some(Some(x)))
            .map_err(|_| AppError::field(key, "Invalid value.")),
    }
}

async fn update(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(body): Json<Value>,
) -> AppResult<Json<Value>> {
    user.require("leads.update")?;
    let status: Option<String> = body
        .get("status")
        .and_then(|v| v.as_str())
        .map(str::to_owned);
    let reason: Option<String> = body
        .get("reason")
        .and_then(|v| v.as_str())
        .map(clean_multiline)
        .filter(|s| !s.is_empty());
    let assignee: Option<Option<Uuid>> = nullable(&body, "assignee_id")?;
    let branch: Option<Option<Uuid>> = nullable(&body, "branch_id")?;
    let follow_up: Option<Option<DateTime<Utc>>> = nullable(&body, "follow_up_at")?;

    let mut tx = state.db.begin().await?;
    let lead = load_scoped(&mut tx, &user, id, true).await?;
    let mut changes = vec![];

    if let Some(new_status) = status.filter(|s| *s != lead.status) {
        if !STATUSES.contains(&new_status.as_str()) {
            return Err(AppError::field("status", "Unknown status."));
        }
        if CLOSED.contains(&lead.status.as_str()) && reason.is_none() {
            return Err(AppError::field(
                "reason",
                "Give a reason for reopening or changing a closed enquiry.",
            ));
        }
        let closing = CLOSED.contains(&new_status.as_str());
        sqlx::query("update enquiries set status = $2, closed_at = case when $3 then now() else null end, updated_at = now() where id = $1")
            .bind(id)
            .bind(&new_status)
            .bind(closing)
            .execute(&mut *tx)
            .await?;
        sqlx::query("insert into enquiry_events (enquiry_id, actor_id, kind, from_value, to_value, note) values ($1, $2, 'status', $3, $4, $5)")
            .bind(id)
            .bind(user.id)
            .bind(&lead.status)
            .bind(&new_status)
            .bind(&reason)
            .execute(&mut *tx)
            .await?;
        changes.push("status");
    }

    if let Some(new_branch) = branch.filter(|b| *b != lead.branch_id) {
        user.require("leads.assign")?;
        if let Some(b) = new_branch {
            let ok: bool = sqlx::query_scalar(
                "select exists(select 1 from branches where id = $1 and active)",
            )
            .bind(b)
            .fetch_one(&mut *tx)
            .await?;
            if !ok {
                return Err(AppError::field("branch_id", "Choose an active branch."));
            }
            if let Scope::Branches(ids) = scope(&user)?
                && !ids.contains(&b)
            {
                return Err(AppError::field(
                    "branch_id",
                    "You can only move enquiries between your own branches.",
                ));
            }
        }
        sqlx::query("update enquiries set branch_id = $2, updated_at = now() where id = $1")
            .bind(id)
            .bind(new_branch)
            .execute(&mut *tx)
            .await?;
        sqlx::query("insert into enquiry_events (enquiry_id, actor_id, kind, from_value, to_value) values ($1, $2, 'branch', $3, $4)")
            .bind(id)
            .bind(user.id)
            .bind(lead.branch_name.clone())
            .bind(match new_branch {
                Some(b) => sqlx::query_scalar::<_, String>("select name from branches where id = $1").bind(b).fetch_one(&mut *tx).await.ok(),
                None => None,
            })
            .execute(&mut *tx)
            .await?;
        changes.push("branch");
    }

    if let Some(new_assignee) = assignee.filter(|a| *a != lead.assignee_id) {
        user.require("leads.assign")?;
        if let Some(a) = new_assignee {
            let branch_now: Option<Uuid> =
                sqlx::query_scalar("select branch_id from enquiries where id = $1")
                    .bind(id)
                    .fetch_one(&mut *tx)
                    .await?;
            let eligible: bool = sqlx::query_scalar(
                "select exists(
                    select 1 from users u
                    join user_roles ur on ur.user_id = u.id join role_permissions rp on rp.role_id = ur.role_id
                    where u.id = $1 and u.status = 'active' and (
                        rp.permission = 'leads.view.all'
                        or (rp.permission = 'leads.view.own_branch' and exists(select 1 from user_branch_scopes s where s.user_id = u.id and s.branch_id = $2))))",
            )
            .bind(a)
            .bind(branch_now)
            .fetch_one(&mut *tx)
            .await?;
            if !eligible {
                return Err(AppError::field(
                    "assignee_id",
                    "This person cannot see enquiries for this branch.",
                ));
            }
        }
        sqlx::query("update enquiries set assignee_id = $2, updated_at = now() where id = $1")
            .bind(id)
            .bind(new_assignee)
            .execute(&mut *tx)
            .await?;
        let name: Option<String> = match new_assignee {
            Some(a) => {
                sqlx::query_scalar("select name from users where id = $1")
                    .bind(a)
                    .fetch_optional(&mut *tx)
                    .await?
            }
            None => None,
        };
        sqlx::query("insert into enquiry_events (enquiry_id, actor_id, kind, from_value, to_value) values ($1, $2, 'assignee', $3, $4)")
            .bind(id)
            .bind(user.id)
            .bind(lead.assignee_name.clone())
            .bind(name)
            .execute(&mut *tx)
            .await?;
        if let Some(a) = new_assignee.filter(|a| *a != user.id) {
            sqlx::query("insert into notifications (user_id, kind, title, link) values ($1, 'lead_assigned', $2, $3)")
                .bind(a)
                .bind(format!("Enquiry {} was assigned to you", lead.reference))
                .bind(format!("/leads/{id}"))
                .execute(&mut *tx)
                .await?;
        }
        changes.push("assignee");
    }

    if let Some(at) = follow_up.filter(|f| *f != lead.follow_up_at) {
        sqlx::query("update enquiries set follow_up_at = $2, updated_at = now() where id = $1")
            .bind(id)
            .bind(at)
            .execute(&mut *tx)
            .await?;
        sqlx::query("insert into enquiry_events (enquiry_id, actor_id, kind, to_value) values ($1, $2, 'follow_up', $3)")
            .bind(id)
            .bind(user.id)
            .bind(at.map(|a| a.to_rfc3339()))
            .execute(&mut *tx)
            .await?;
        changes.push("follow_up");
    }

    if !changes.is_empty() {
        audit::record(
            &mut *tx,
            &user.actor(),
            "lead.updated",
            "enquiry",
            &lead.reference,
            Outcome::Success,
            json!({ "fields": changes }),
        )
        .await?;
    }
    tx.commit().await?;
    detail(State(state), user, Path(id)).await
}

#[derive(Deserialize)]
struct NoteBody {
    body: String,
}

async fn add_note(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<NoteBody>,
) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("leads.update")?;
    let body = clean_multiline(&b.body);
    if body.is_empty() || body.chars().count() > 4000 {
        return Err(AppError::field(
            "body",
            "Write a note of up to 4000 characters.",
        ));
    }
    let mut tx = state.db.begin().await?;
    let lead = load_scoped(&mut tx, &user, id, true).await?;
    let note_id: Uuid = sqlx::query_scalar(
        "insert into enquiry_notes (enquiry_id, author_id, body) values ($1, $2, $3) returning id",
    )
    .bind(id)
    .bind(user.id)
    .bind(&body)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("insert into enquiry_events (enquiry_id, actor_id, kind) values ($1, $2, 'note')")
        .bind(id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("update enquiries set updated_at = now() where id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "lead.note_added",
        "enquiry",
        &lead.reference,
        Outcome::Success,
        json!({}),
    )
    .await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "data": { "id": note_id } })),
    ))
}

#[derive(Deserialize)]
struct FollowUpBody {
    at: DateTime<Utc>,
    note: Option<String>,
}

async fn set_follow_up(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<FollowUpBody>,
) -> AppResult<Json<Value>> {
    user.require("leads.update")?;
    let mut tx = state.db.begin().await?;
    let lead = load_scoped(&mut tx, &user, id, true).await?;
    if CLOSED.contains(&lead.status.as_str()) {
        return Err(AppError::conflict(
            "closed",
            "Reopen the enquiry before scheduling a follow-up.",
        ));
    }
    sqlx::query("update enquiries set follow_up_at = $2, updated_at = now() where id = $1")
        .bind(id)
        .bind(b.at)
        .execute(&mut *tx)
        .await?;
    sqlx::query("insert into enquiry_events (enquiry_id, actor_id, kind, to_value, note) values ($1, $2, 'follow_up', $3, $4)")
        .bind(id)
        .bind(user.id)
        .bind(b.at.to_rfc3339())
        .bind(b.note.as_deref().map(clean_multiline))
        .execute(&mut *tx)
        .await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "lead.follow_up_set",
        "enquiry",
        &lead.reference,
        Outcome::Success,
        json!({}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "data": { "follow_up_at": b.at } })))
}

#[derive(Deserialize)]
struct ExportQuery {
    format: Option<String>,
}

/// Exports the current filtered view within the user's scope. Contact details are included only for
/// users who may reveal them; every cell is neutralised against spreadsheet formulas.
async fn export(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(f): Query<LeadFilters>,
    Query(x): Query<ExportQuery>,
) -> AppResult<Response> {
    user.require("leads.export")?;
    let scope = scope(&user)?;
    let reveal = user.can("leads.contact.reveal");
    let mut qb = QueryBuilder::new(LEAD_SELECT);
    push_scope(&mut qb, &scope);
    push_filters(&mut qb, &f, &user);
    qb.push(order_by(f.sort.as_deref()));
    qb.push(" limit 10001");
    let rows: Vec<LeadRow> = qb.build_query_as().fetch_all(&state.db).await?;
    if rows.len() > 10_000 {
        return Err(AppError::unprocessable(
            "too_many_rows",
            "More than 10,000 enquiries match. Narrow the filters (for example a date range) and export again.",
        ));
    }
    let headers = [
        "Reference",
        "Received (IST)",
        "Type",
        "Status",
        "Name",
        "Phone",
        "Email",
        "City",
        "Product",
        "Branch",
        "Assigned to",
        "Follow-up (IST)",
    ];
    let fmt = |d: Option<DateTime<Utc>>| {
        d.map(|d| {
            d.with_timezone(&Kolkata)
                .format("%d-%m-%Y %H:%M")
                .to_string()
        })
        .unwrap_or_default()
    };
    let records: Vec<Vec<String>> = rows
        .iter()
        .map(|r| {
            vec![
                r.reference.clone(),
                fmt(Some(r.created_at)),
                r.kind.clone(),
                r.status.clone(),
                r.name.clone(),
                if reveal {
                    r.phone_normalized.clone()
                } else {
                    mask_phone(&r.phone_normalized)
                },
                r.email
                    .as_deref()
                    .map(|e| if reveal { e.to_owned() } else { mask_email(e) })
                    .unwrap_or_default(),
                r.city.clone().unwrap_or_default(),
                r.product.clone().unwrap_or_default(),
                r.branch_name.clone().unwrap_or_default(),
                r.assignee_name.clone().unwrap_or_default(),
                fmt(r.follow_up_at),
            ]
            .into_iter()
            .map(|c| spreadsheet_safe(&c))
            .collect()
        })
        .collect();
    let stamp = Utc::now().with_timezone(&Kolkata).format("%Y%m%d-%H%M");
    let xlsx = x.format.as_deref() == Some("xlsx");
    let (bytes, ctype, ext) = if xlsx {
        (
            crate::exports::xlsx("Enquiries", &headers, &records)?,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "xlsx",
        )
    } else {
        (
            crate::exports::csv(&headers, &records)?,
            "text/csv; charset=utf-8",
            "csv",
        )
    };
    audit::record(&state.db, &user.actor(), "lead.exported", "enquiry", "*", Outcome::Success, json!({
        "rows": records.len(), "format": ext, "contact_included": reveal,
        "filters": { "status": f.status, "kind": f.kind, "branch": f.branch, "from": f.from, "to": f.to },
    })).await?;
    Response::builder()
        .header(header::CONTENT_TYPE, ctype)
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"enquiries-{stamp}.{ext}\""),
        )
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(bytes))
        .map_err(AppError::internal)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn form(pairs: &[(&str, &str)]) -> forms::FormData {
        let mut f = forms::FormData::default();
        for (k, v) in pairs {
            f.fields.insert((*k).into(), (*v).into());
        }
        f
    }

    #[test]
    fn loan_enquiry_validates_and_normalises() {
        let f = form(&[
            ("name", " Ramesh  Patil "),
            ("phone", "98765 43210"),
            ("email", "R@Example.com"),
            ("city", "Solapur"),
            ("loan_type", "Housing Loan"),
            ("amount", "5,00,000"),
            ("consent", "on"),
        ]);
        let e = validate(&f, "loan", None).unwrap();
        assert_eq!(e.name, "Ramesh Patil");
        assert_eq!(e.phone_normalized, "+919876543210");
        assert_eq!(e.email.as_deref(), Some("r@example.com"));
        assert_eq!(e.amount, Some(500000));
    }

    #[test]
    fn retired_products_are_rejected() {
        let opts = live::FormOptions {
            deposit_types: vec!["Vishwamangal Fixed Deposit".into()],
            loan_types: vec![],
            branch_codes: vec![],
            jobs: vec![],
        };
        let f = form(&[
            ("first_name", "A"),
            ("last_name", "B"),
            ("phone", "9876543210"),
            ("email", "a@b.in"),
            ("city", "X"),
            ("deposit_type", "Old Scheme"),
            ("consent", "on"),
        ]);
        let err = validate(&f, "deposit", Some(&opts)).err().unwrap();
        assert!(err.fields.unwrap().contains_key("deposit_type"));
    }

    #[test]
    fn missing_fields_are_reported_together() {
        let err = validate(&form(&[]), "contact", None).err().unwrap();
        let fields = err.fields.unwrap();
        for k in ["name", "phone", "email", "message", "consent"] {
            assert!(fields.contains_key(k), "{k}");
        }
    }

    #[test]
    fn spam_signals_and_request_hash() {
        let ts = (Utc::now().timestamp_millis() - 500).to_string();
        let f = form(&[
            ("website", "http://spam"),
            ("ts", ts.as_str()),
            ("name", "x"),
        ]);
        assert_eq!(spam_signals(&f), vec!["honeypot", "submitted_too_fast"]);
        let a = form(&[("name", "x"), ("ts", "1")]);
        let b = form(&[("name", "x"), ("ts", "2")]);
        assert_eq!(request_hash(&a), request_hash(&b));
    }
}
