//! Job applications: public intake (with an optional PDF résumé kept outside every public path) and
//! the HR inbox. Job openings themselves are content (collection "job_opening").

use std::time::Duration as StdDuration;

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{Postgres, QueryBuilder, Row};
use uuid::Uuid;

use crate::{
    audit::{self, Actor, Outcome},
    auth::CurrentUser,
    enquiries::{idempotency_key, reference, request_hash, spam_signals},
    error::{AppError, AppResult, FieldErrors},
    forms::{self, FormData},
    jobs, live,
    mail::OutgoingEmail,
    security::sha256_hex,
    settings,
    state::{AppState, ClientMeta, PageQuery},
    text::{clean_line, clean_multiline, mask_email, mask_phone, normalize_phone, valid_email},
};

pub const STATUSES: [&str; 5] = ["new", "shortlisted", "interview", "selected", "rejected"];
pub const CONSENT_VERSION: &str = "2026-10-application";
const MAX_RESUME: usize = 5 * 1024 * 1024;

pub fn public_router() -> Router<AppState> {
    // The global limit is 1 MB; this endpoint accepts a résumé of up to MAX_RESUME plus the form fields.
    Router::new()
        .route("/applications", post(submit))
        .layer(DefaultBodyLimit::max(MAX_RESUME + 256 * 1024))
}

pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/applications", get(list))
        .route("/applications/{id}", get(detail).patch(update))
        .route("/private-files/{id}/download", get(download))
}

async fn submit(
    State(state): State<AppState>,
    meta: ClientMeta,
    headers: HeaderMap,
    req: Request,
) -> AppResult<Response> {
    let form = forms::read(req, &state, Some(MAX_RESUME)).await?;
    submit_from_form(state, meta, &headers, form).await
}

/// A résumé must really be a PDF: magic bytes, header and end-of-file marker, within the size limit.
fn check_pdf(bytes: &[u8]) -> Result<(), &'static str> {
    if bytes.len() > MAX_RESUME {
        return Err("The résumé must be 5 MB or smaller.");
    }
    if infer::get(bytes).map(|t| t.mime_type()) != Some("application/pdf")
        || !bytes.starts_with(b"%PDF-")
    {
        return Err("Upload your résumé as a PDF file.");
    }
    let tail = &bytes[bytes.len().saturating_sub(2048)..];
    if !tail.windows(5).any(|w| w == b"%%EOF") {
        return Err("This PDF looks incomplete. Please save it again and re-upload.");
    }
    Ok(())
}

pub async fn submit_from_form(
    state: AppState,
    meta: ClientMeta,
    headers: &HeaderMap,
    form: FormData,
) -> AppResult<Response> {
    if !state
        .public_limiter
        .allow("application", meta.ip, 5, StdDuration::from_secs(3600))
    {
        return Err(AppError::too_many(
            "Too many requests from your connection. Please email us instead.",
        ));
    }
    let options = live::form_options(&state.db).await?;
    let mut errors = FieldErrors::new();
    let name = clean_line(form.get("name"));
    if name.chars().count() < 2 || name.chars().count() > 120 {
        errors.add("name", "Enter your full name.");
    }
    let phone = clean_line(form.get("phone"));
    let phone_normalized = normalize_phone(&phone);
    if phone_normalized.is_none() {
        errors.add("phone", "Enter a valid 10-digit phone number.");
    }
    let email = form.get("email").to_lowercase();
    if !valid_email(&email) {
        errors.add("email", "Enter a valid email address.");
    }
    let city = clean_line(form.get("city"));
    if city.is_empty() {
        errors.add("city", "Enter your current city.");
    }
    let position = clean_line(form.get("position"));
    let open = options
        .as_ref()
        .map(|o| o.jobs.contains(&position))
        .unwrap_or(!position.is_empty());
    if position != "Other" && !open {
        errors.add(
            "position",
            "This vacancy is closed. Please choose another position.",
        );
    }
    let experience = match form.opt("experience") {
        Some(x) => match x.parse::<i32>() {
            Ok(n) if (0..=60).contains(&n) => Some(n),
            _ => {
                errors.add("experience", "Enter your experience in whole years.");
                None
            }
        },
        None => None,
    };
    let message = form.opt("message").map(clean_multiline);
    if message.as_ref().is_some_and(|m| m.chars().count() > 3000) {
        errors.add("message", "Please keep this under 3000 characters.");
    }
    if form.get("consent").is_empty() {
        errors.add(
            "consent",
            "Please agree so we can consider your application.",
        );
    }
    let resume = form.files.iter().find(|f| f.field == "resume");
    if let Some(r) = resume
        && let Err(msg) = check_pdf(&r.bytes)
    {
        errors.add("resume", msg);
    }
    errors.into_result()?;

    let idem = idempotency_key(headers, &form)?;
    let mut hash_src = request_hash(&form);
    if let Some(r) = resume {
        hash_src.push_str(&sha256_hex(&r.bytes));
    }
    let hash = sha256_hex(hash_src.as_bytes());
    let signals = spam_signals(&form);

    let mut tx = state.db.begin().await?;
    if let Some(key) = &idem {
        let existing: Option<(String, Option<String>)> = sqlx::query_as(
            "select reference, request_hash from job_applications where idempotency_key = $1",
        )
        .bind(key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((reference, h)) = existing {
            if h.as_deref() != Some(hash.as_str()) {
                return Err(AppError::conflict(
                    "idempotency_conflict",
                    "This request key was already used for different details.",
                ));
            }
            return Ok((StatusCode::OK, Json(json!({ "data": { "reference": reference, "status": "received" }, "request_id": meta.request_id }))).into_response());
        }
    }
    let resume_id = match resume {
        Some(r) => {
            let id: Uuid = sqlx::query_scalar(
                "insert into private_files (purpose, original_name, mime, size_bytes, sha256, status) values ('resume', $1, 'application/pdf', $2, $3, 'clean') returning id",
            )
            .bind(r.file_name.chars().take(150).collect::<String>())
            .bind(r.bytes.len() as i64)
            .bind(sha256_hex(&r.bytes))
            .fetch_one(&mut *tx)
            .await?;
            tokio::fs::create_dir_all(&state.config.private_root)
                .await
                .map_err(AppError::internal)?;
            tokio::fs::write(
                state.config.private_root.join(format!("{id}.pdf")),
                &r.bytes,
            )
            .await
            .map_err(AppError::internal)?;
            Some(id)
        }
        None => None,
    };
    let job_item_id: Option<Uuid> = sqlx::query_scalar(
        "select i.id from content_items i join content_revisions r on r.id = i.live_revision_id
         where i.collection = 'job_opening' and r.data->>'title' = $1 limit 1",
    )
    .bind(&position)
    .fetch_optional(&mut *tx)
    .await?;
    let n: i64 = sqlx::query_scalar("select nextval('application_reference_seq')")
        .fetch_one(&mut *tx)
        .await?;
    let reference = reference("LMA", n);
    let months = settings::privacy(&mut tx)
        .await?
        .application_retention_months;
    let id: Uuid = sqlx::query_scalar(
        "insert into job_applications (reference, job_item_id, position, name, phone, phone_normalized, email, city, experience_years, message,
             resume_file_id, status, consent_version, consent_at, idempotency_key, request_hash, retention_until)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14, $15,
                 (now() at time zone 'Asia/Kolkata')::date + make_interval(months => $16))
         returning id",
    )
    .bind(&reference)
    .bind(job_item_id)
    .bind(&position)
    .bind(&name)
    .bind(&phone)
    .bind(phone_normalized.as_deref().unwrap_or_default())
    .bind(&email)
    .bind(&city)
    .bind(experience)
    .bind(&message)
    .bind(resume_id)
    .bind(if signals.is_empty() { "new" } else { "rejected" })
    .bind(form.opt("consent_version").unwrap_or(CONSENT_VERSION))
    .bind(&idem)
    .bind(&hash)
    .bind(months as i32)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "insert into application_events (application_id, kind, note) values ($1, 'created', $2)",
    )
    .bind(id)
    .bind((!signals.is_empty()).then(|| format!("Spam signals: {}", signals.join(", "))))
    .execute(&mut *tx)
    .await?;
    if signals.is_empty() {
        jobs::enqueue(
            &mut tx,
            "notify_application",
            json!({ "application_id": id }),
            None,
            None,
        )
        .await?;
    }
    audit::record(
        &mut *tx,
        &Actor::anonymous(&meta),
        "application.received",
        "application",
        &reference,
        Outcome::Success,
        json!({ "resume": resume_id.is_some(), "spam_signals": signals }),
    )
    .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(json!({ "data": { "reference": reference, "status": "received" }, "request_id": meta.request_id }))).into_response())
}

pub async fn notify(state: &AppState, application_id: Uuid) -> anyhow::Result<()> {
    let (reference, position): (String, String) =
        sqlx::query_as("select reference, position from job_applications where id = $1")
            .bind(application_id)
            .fetch_one(&state.db)
            .await?;
    let mut conn = state.db.acquire().await?;
    let cfg = settings::notifications(&mut conn).await?;
    let link = state
        .config
        .admin_link(&format!("/careers/applications/{application_id}"));
    state
        .mailer
        .send(&OutgoingEmail {
            to: cfg.application_recipients,
            subject: format!("New job application {reference}"),
            text: format!("A new application for “{position}” has arrived.\n\nReference: {reference}\nOpen it in the admin panel:\n{link}\n"),
        })
        .await
}

#[derive(Deserialize)]
struct Filters {
    status: Option<String>,
    position: Option<String>,
    q: Option<String>,
}

fn push_filters(qb: &mut QueryBuilder<'_, Postgres>, f: &Filters) {
    if let Some(s) = f.status.as_deref().filter(|s| STATUSES.contains(s)) {
        qb.push(" and a.status = ").push_bind(s.to_owned());
    }
    if let Some(p) = f.position.as_deref().filter(|p| !p.is_empty()) {
        qb.push(" and a.position = ").push_bind(p.to_owned());
    }
    if let Some(q) = f.q.as_deref().map(str::trim).filter(|q| q.len() >= 2) {
        qb.push(" and (a.reference ilike ")
            .push_bind(format!("%{q}%"))
            .push(" or a.name ilike ")
            .push_bind(format!("%{q}%"))
            .push(")");
    }
}

async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(page): Query<PageQuery>,
    Query(f): Query<Filters>,
) -> AppResult<Json<Value>> {
    user.require("applications.view")?;
    let reveal = user.can("applications.update");
    let mut qb = QueryBuilder::new(
        "select a.id, a.reference, a.position, a.name, a.phone_normalized, a.email, a.city, a.experience_years, a.status,
                a.resume_file_id is not null as has_resume, a.created_at
         from job_applications a where a.anonymized_at is null",
    );
    push_filters(&mut qb, &f);
    qb.push(" order by a.created_at desc limit ")
        .push_bind(page.limit())
        .push(" offset ")
        .push_bind(page.offset());
    let rows = qb.build().fetch_all(&state.db).await?;
    let mut count =
        QueryBuilder::new("select count(*) from job_applications a where a.anonymized_at is null");
    push_filters(&mut count, &f);
    let total: i64 = count.build_query_scalar().fetch_one(&state.db).await?;
    let data: Vec<Value> = rows
        .iter()
        .map(|r| {
            let phone: String = r.get("phone_normalized");
            let email: Option<String> = r.get("email");
            json!({
                "id": r.get::<Uuid, _>("id"),
                "reference": r.get::<String, _>("reference"),
                "position": r.get::<String, _>("position"),
                "name": r.get::<String, _>("name"),
                "phone": if reveal { phone.clone() } else { mask_phone(&phone) },
                "email": email.map(|e| if reveal { e } else { mask_email(&e) }),
                "city": r.get::<Option<String>, _>("city"),
                "experience_years": r.get::<Option<i32>, _>("experience_years"),
                "status": r.get::<String, _>("status"),
                "has_resume": r.get::<bool, _>("has_resume"),
                "created_at": r.get::<DateTime<Utc>, _>("created_at"),
            })
        })
        .collect();
    Ok(Json(
        json!({ "data": data, "meta": { "total": total, "page": page.page(), "per_page": page.limit() } }),
    ))
}

async fn detail(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    user.require("applications.view")?;
    let r = sqlx::query(
        "select a.*, f.original_name as resume_name, f.size_bytes as resume_size from job_applications a
         left join private_files f on f.id = a.resume_file_id and f.deleted_at is null
         where a.id = $1 and a.anonymized_at is null",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(AppError::not_found)?;
    let reveal = user.can("applications.update");
    let events = sqlx::query("select ev.kind, ev.from_value, ev.to_value, ev.note, ev.at, u.name from application_events ev left join users u on u.id = ev.actor_id where ev.application_id = $1 order by ev.at")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    let reference: String = r.get("reference");
    audit::record(
        &state.db,
        &user.actor(),
        "application.viewed",
        "application",
        &reference,
        Outcome::Success,
        json!({}),
    )
    .await?;
    let phone: String = r.get("phone_normalized");
    Ok(Json(json!({ "data": {
        "id": id,
        "reference": reference,
        "position": r.get::<String, _>("position"),
        "name": r.get::<String, _>("name"),
        "phone": if reveal { phone.clone() } else { mask_phone(&phone) },
        "email": r.get::<Option<String>, _>("email").map(|e| if reveal { e } else { mask_email(&e) }),
        "city": r.get::<Option<String>, _>("city"),
        "experience_years": r.get::<Option<i32>, _>("experience_years"),
        "message": r.get::<Option<String>, _>("message"),
        "status": r.get::<String, _>("status"),
        "resume": r.get::<Option<Uuid>, _>("resume_file_id").map(|fid| json!({
            "id": fid, "name": r.get::<Option<String>, _>("resume_name"), "size": r.get::<Option<i64>, _>("resume_size"),
            "can_download": user.can("applications.resume.download"),
        })),
        "consent": { "version": r.get::<Option<String>, _>("consent_version"), "at": r.get::<Option<DateTime<Utc>>, _>("consent_at") },
        "retention_until": r.get::<Option<chrono::NaiveDate>, _>("retention_until"),
        "created_at": r.get::<DateTime<Utc>, _>("created_at"),
        "events": events.iter().map(|e| json!({ "kind": e.get::<String, _>("kind"), "from": e.get::<Option<String>, _>("from_value"), "to": e.get::<Option<String>, _>("to_value"), "note": e.get::<Option<String>, _>("note"), "at": e.get::<DateTime<Utc>, _>("at"), "actor": e.get::<Option<String>, _>("name") })).collect::<Vec<_>>(),
        "allowed": { "update": user.can("applications.update"), "statuses": STATUSES },
    }})))
}

#[derive(Deserialize)]
struct UpdateBody {
    status: Option<String>,
    note: Option<String>,
    reason: Option<String>,
}

async fn update(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<UpdateBody>,
) -> AppResult<Json<Value>> {
    user.require("applications.update")?;
    let mut tx = state.db.begin().await?;
    let (reference, current): (String, String) =
        sqlx::query_as("select reference, status from job_applications where id = $1 and anonymized_at is null for update")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(AppError::not_found)?;
    if let Some(s) = b.status.as_deref().filter(|s| *s != current) {
        if !STATUSES.contains(&s) {
            return Err(AppError::field("status", "Unknown status."));
        }
        let reason = b
            .reason
            .as_deref()
            .map(clean_multiline)
            .filter(|r| !r.is_empty());
        if matches!(current.as_str(), "selected" | "rejected") && reason.is_none() {
            return Err(AppError::field(
                "reason",
                "Give a reason for reopening a decided application.",
            ));
        }
        sqlx::query("update job_applications set status = $2, updated_at = now() where id = $1")
            .bind(id)
            .bind(s)
            .execute(&mut *tx)
            .await?;
        sqlx::query("insert into application_events (application_id, actor_id, kind, from_value, to_value, note) values ($1, $2, 'status', $3, $4, $5)")
            .bind(id)
            .bind(user.id)
            .bind(&current)
            .bind(s)
            .bind(reason)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(note) = b
        .note
        .as_deref()
        .map(clean_multiline)
        .filter(|n| !n.is_empty())
    {
        sqlx::query("insert into application_events (application_id, actor_id, kind, note) values ($1, $2, 'note', $3)")
            .bind(id)
            .bind(user.id)
            .bind(note.chars().take(4000).collect::<String>())
            .execute(&mut *tx)
            .await?;
    }
    audit::record(
        &mut *tx,
        &user.actor(),
        "application.updated",
        "application",
        &reference,
        Outcome::Success,
        json!({ "status": b.status }),
    )
    .await?;
    tx.commit().await?;
    detail(State(state), user, Path(id)).await
}

/// Résumés are only ever served through this permission-checked, audited, non-cached route.
async fn download(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Response> {
    if !user.can("applications.resume.download") {
        audit::record_best_effort(
            &state.db,
            &user.actor(),
            "private_file.download_denied",
            "private_file",
            id,
            Outcome::Denied,
            json!({}),
        )
        .await;
        return Err(AppError::missing_permission("applications.resume.download"));
    }
    let (name, reference): (String, String) = sqlx::query_as(
        "select f.original_name, a.reference from private_files f join job_applications a on a.resume_file_id = f.id
         where f.id = $1 and f.deleted_at is null and f.status = 'clean' and a.anonymized_at is null",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(AppError::not_found)?;
    let bytes = tokio::fs::read(state.config.private_root.join(format!("{id}.pdf")))
        .await
        .map_err(|_| AppError::not_found())?;
    audit::record(
        &state.db,
        &user.actor(),
        "private_file.downloaded",
        "application",
        &reference,
        Outcome::Success,
        json!({ "file": id }),
    )
    .await?;
    let safe_name: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect();
    Response::builder()
        .header(header::CONTENT_TYPE, "application/pdf")
        .header(
            header::CONTENT_DISPOSITION,
            format!(
                "attachment; filename=\"{}\"",
                if safe_name.is_empty() {
                    "resume.pdf".into()
                } else {
                    safe_name
                }
            ),
        )
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(Body::from(bytes))
        .map_err(AppError::internal)
}

#[cfg(test)]
mod tests {
    use super::check_pdf;

    #[test]
    fn only_complete_pdfs_pass() {
        assert!(check_pdf(b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n").is_ok());
        assert!(check_pdf(b"%PDF-1.7\nno end marker").is_err());
        assert!(check_pdf(b"MZ\x90\x00 executable").is_err());
        assert!(check_pdf(b"<html><script>alert(1)</script>%%EOF").is_err());
    }
}
