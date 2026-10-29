//! Media library. Images are decoded under strict limits and re-encoded to WebP at 480/960/1600 px
//! (never upscaled), which drops metadata and anything hidden in the original. PDFs are checked
//! structurally. Files live in the private media store; a release copies the versions it references,
//! so drafts never leak and rollbacks keep their files.

use std::io::Cursor;

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{StatusCode, header},
    response::Response,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use image::{ImageFormat, ImageReader, Limits, imageops::FilterType};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    audit::{self, Outcome},
    auth::CurrentUser,
    error::{AppError, AppResult},
    security::sha256_hex,
    state::{AppState, PageQuery},
    text::clean_line,
};

const MAX_IMAGE: usize = 15 * 1024 * 1024;
const MAX_PDF: usize = 50 * 1024 * 1024;
const WIDTHS: [u32; 3] = [480, 960, 1600];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/media", get(list).post(upload))
        .route("/media/{id}", get(detail).patch(update).delete(retire))
        .route("/media/{id}/versions", post(new_version))
        .route("/media/files/{version}/{file}", get(file))
        .layer(DefaultBodyLimit::max(MAX_PDF + 1024 * 1024))
}

/// File name, bytes and pixel size of each stored variant.
type Variant = (String, Vec<u8>, Option<(u32, u32)>);

struct Processed {
    kind: &'static str,
    mime: &'static str,
    width: Option<i32>,
    height: Option<i32>,
    files: Vec<Variant>,
}

fn process_image(bytes: &[u8]) -> Result<Processed, String> {
    let format =
        image::guess_format(bytes).map_err(|_| "This file is not a supported image.".to_owned())?;
    let mime = match format {
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::Png => "image/png",
        ImageFormat::WebP => "image/webp",
        _ => {
            return Err(
                "Upload JPEG, PNG or WebP images. SVG, GIF and other formats are not accepted."
                    .into(),
            );
        }
    };
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(12_000);
    limits.max_image_height = Some(12_000);
    limits.max_alloc = Some(512 * 1024 * 1024);
    reader.limits(limits);
    let img = reader
        .decode()
        .map_err(|_| "The image could not be read. It may be damaged or too large.".to_owned())?;
    let (w, h) = (img.width(), img.height());
    if w < 16 || h < 16 {
        return Err("The image is too small.".into());
    }
    let mut targets: Vec<u32> = WIDTHS.iter().copied().filter(|t| *t <= w).collect();
    if targets.is_empty() {
        targets.push(w);
    }
    let mut files = vec![];
    for t in targets {
        let resized = if t == w {
            img.clone()
        } else {
            img.resize(
                t,
                (h as u64 * t as u64 / w as u64).max(1) as u32,
                FilterType::Lanczos3,
            )
        };
        let rgba = resized.to_rgba8();
        let encoded =
            webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height()).encode(82.0);
        files.push((
            format!("{t}.webp"),
            encoded.to_vec(),
            Some((rgba.width(), rgba.height())),
        ));
    }
    Ok(Processed {
        kind: "image",
        mime,
        width: Some(w as i32),
        height: Some(h as i32),
        files,
    })
}

fn process_pdf(bytes: &[u8]) -> Result<Processed, String> {
    if bytes.len() > MAX_PDF {
        return Err("PDFs can be at most 50 MB.".into());
    }
    if !bytes.starts_with(b"%PDF-")
        || infer::get(bytes).map(|t| t.mime_type()) != Some("application/pdf")
    {
        return Err("This file is not a PDF.".into());
    }
    if !bytes[bytes.len().saturating_sub(4096)..]
        .windows(5)
        .any(|w| w == b"%%EOF")
    {
        return Err("This PDF looks incomplete. Save it again and re-upload.".into());
    }
    Ok(Processed {
        kind: "document",
        mime: "application/pdf",
        width: None,
        height: None,
        files: vec![("document.pdf".into(), bytes.to_vec(), None)],
    })
}

struct Incoming {
    file_name: String,
    bytes: Vec<u8>,
    title: Option<String>,
    alt: Option<String>,
    decorative: bool,
}

async fn read_upload(mut mp: Multipart) -> AppResult<Incoming> {
    let mut out = Incoming {
        file_name: String::new(),
        bytes: vec![],
        title: None,
        alt: None,
        decorative: false,
    };
    while let Some(field) = mp
        .next_field()
        .await
        .map_err(|_| AppError::bad_request("The upload did not complete."))?
    {
        match field.name().unwrap_or("") {
            "file" => {
                out.file_name = field
                    .file_name()
                    .unwrap_or("upload")
                    .chars()
                    .take(150)
                    .collect();
                out.bytes = field
                    .bytes()
                    .await
                    .map_err(|_| AppError::bad_request("The upload did not complete."))?
                    .to_vec();
            }
            "title" => {
                out.title = Some(clean_line(&field.text().await.unwrap_or_default()))
                    .filter(|s| !s.is_empty())
            }
            "alt" => {
                out.alt = Some(clean_line(&field.text().await.unwrap_or_default()))
                    .filter(|s| !s.is_empty())
            }
            "decorative" => {
                out.decorative = matches!(
                    field.text().await.unwrap_or_default().as_str(),
                    "true" | "on" | "1"
                )
            }
            _ => {}
        }
    }
    if out.bytes.is_empty() {
        return Err(AppError::field("file", "Choose a file to upload."));
    }
    Ok(out)
}

async fn process(bytes: Vec<u8>) -> AppResult<Processed> {
    let is_pdf = bytes.starts_with(b"%PDF-");
    if !is_pdf && bytes.len() > MAX_IMAGE {
        return Err(AppError::field("file", "Images can be at most 15 MB."));
    }
    tokio::task::spawn_blocking(move || {
        if is_pdf {
            process_pdf(&bytes)
        } else {
            process_image(&bytes)
        }
    })
    .await
    .map_err(AppError::internal)?
    .map_err(|m| AppError::field("file", m))
}

async fn store_version(
    state: &AppState,
    tx: &mut sqlx::PgConnection,
    media_id: Uuid,
    version: i32,
    inc: &Incoming,
    p: &Processed,
    user: Uuid,
) -> AppResult<Uuid> {
    let version_id = Uuid::new_v4();
    let dir = state.config.media_root.join(version_id.to_string());
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(AppError::internal)?;
    let mut variants = vec![];
    for (name, data, dims) in &p.files {
        tokio::fs::write(dir.join(name), data)
            .await
            .map_err(AppError::internal)?;
        variants.push(json!({ "file": name, "bytes": data.len(), "width": dims.map(|d| d.0), "height": dims.map(|d| d.1), "url": format!("/media/{version_id}/{name}") }));
    }
    sqlx::query(
        "insert into media_versions (id, media_id, version, original_name, mime, size_bytes, width, height, sha256, variants, status, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ready', $11)",
    )
    .bind(version_id)
    .bind(media_id)
    .bind(version)
    .bind(&inc.file_name)
    .bind(p.mime)
    .bind(inc.bytes.len() as i64)
    .bind(p.width)
    .bind(p.height)
    .bind(sha256_hex(&inc.bytes))
    .bind(json!(variants))
    .bind(user)
    .execute(&mut *tx)
    .await?;
    sqlx::query("update media set current_version_id = $2, updated_at = now() where id = $1")
        .bind(media_id)
        .bind(version_id)
        .execute(&mut *tx)
        .await?;
    Ok(version_id)
}

async fn upload(
    State(state): State<AppState>,
    user: CurrentUser,
    mp: Multipart,
) -> AppResult<(StatusCode, Json<Value>)> {
    user.require("media.upload")?;
    let inc = read_upload(mp).await?;
    let p = process(inc.bytes.clone()).await?;
    if p.kind == "image" && inc.alt.is_none() && !inc.decorative {
        return Err(AppError::field(
            "alt",
            "Describe the image for people who cannot see it, or mark it as decorative.",
        ));
    }
    let title = inc.title.clone().unwrap_or_else(|| inc.file_name.clone());
    let mut tx = state.db.begin().await?;
    let media_id: Uuid = sqlx::query_scalar("insert into media (kind, title, alt, decorative, created_by) values ($1, $2, $3, $4, $5) returning id")
        .bind(p.kind)
        .bind(&title)
        .bind(&inc.alt)
        .bind(inc.decorative)
        .bind(user.id)
        .fetch_one(&mut *tx)
        .await?;
    let version_id = store_version(&state, &mut tx, media_id, 1, &inc, &p, user.id).await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "media.uploaded",
        "media",
        media_id,
        Outcome::Success,
        json!({ "version": version_id, "kind": p.kind, "bytes": inc.bytes.len() }),
    )
    .await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "data": media_json(&state, media_id).await? })),
    ))
}

async fn new_version(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    mp: Multipart,
) -> AppResult<Json<Value>> {
    user.require("media.manage")?;
    let inc = read_upload(mp).await?;
    let p = process(inc.bytes.clone()).await?;
    let mut tx = state.db.begin().await?;
    let kind: String = sqlx::query_scalar(
        "select kind from media where id = $1 and deleted_at is null for update",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(AppError::not_found)?;
    if kind != p.kind {
        return Err(AppError::field(
            "file",
            "Replace an image with an image and a PDF with a PDF.",
        ));
    }
    let next: i32 = sqlx::query_scalar(
        "select coalesce(max(version), 0) + 1 from media_versions where media_id = $1",
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    let version_id = store_version(&state, &mut tx, id, next, &inc, &p, user.id).await?;
    audit::record(
        &mut *tx,
        &user.actor(),
        "media.version_added",
        "media",
        id,
        Outcome::Success,
        json!({ "version": version_id }),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "data": media_json(&state, id).await? })))
}

async fn media_json(state: &AppState, id: Uuid) -> AppResult<Value> {
    let m = sqlx::query(
        "select m.id, m.kind, m.title, m.alt, m.decorative, m.created_at, u.name as created_by, v.id as version_id, v.version, v.original_name, v.mime,
                v.size_bytes, v.width, v.height, v.sha256, v.variants, v.status
         from media m left join media_versions v on v.id = m.current_version_id left join users u on u.id = m.created_by
         where m.id = $1 and m.deleted_at is null",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(AppError::not_found)?;
    let versions = sqlx::query("select id, version, original_name, size_bytes, created_at from media_versions where media_id = $1 order by version desc").bind(id).fetch_all(&state.db).await?;
    let usage = sqlx::query(
        "select distinct i.id, i.collection, i.slug, (i.live_revision_id = r.id) as live from media_usage mu
         join content_revisions r on r.id = mu.revision_id join content_items i on i.id = r.item_id
         where mu.media_id = $1 and (r.id = i.draft_revision_id or r.id = i.live_revision_id)",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    Ok(json!({
        "id": id, "kind": m.get::<String, _>("kind"), "title": m.get::<String, _>("title"), "alt": m.get::<Option<String>, _>("alt"),
        "decorative": m.get::<bool, _>("decorative"), "created_at": m.get::<DateTime<Utc>, _>("created_at"), "created_by": m.get::<Option<String>, _>("created_by"),
        "current": {
            "id": m.get::<Option<Uuid>, _>("version_id"), "version": m.get::<Option<i32>, _>("version"), "original_name": m.get::<Option<String>, _>("original_name"),
            "mime": m.get::<Option<String>, _>("mime"), "size_bytes": m.get::<Option<i64>, _>("size_bytes"), "width": m.get::<Option<i32>, _>("width"),
            "height": m.get::<Option<i32>, _>("height"), "sha256": m.get::<Option<String>, _>("sha256"), "variants": m.get::<Option<Value>, _>("variants"),
            "status": m.get::<Option<String>, _>("status"),
        },
        "versions": versions.iter().map(|v| json!({ "id": v.get::<Uuid, _>("id"), "version": v.get::<i32, _>("version"), "original_name": v.get::<String, _>("original_name"), "size_bytes": v.get::<i64, _>("size_bytes"), "created_at": v.get::<DateTime<Utc>, _>("created_at") })).collect::<Vec<_>>(),
        "used_by": usage.iter().map(|u| json!({ "item_id": u.get::<Uuid, _>("id"), "collection": u.get::<String, _>("collection"), "slug": u.get::<String, _>("slug"), "live": u.get::<Option<bool>, _>("live").unwrap_or(false) })).collect::<Vec<_>>(),
    }))
}

#[derive(Deserialize)]
struct ListQuery {
    q: Option<String>,
    kind: Option<String>,
}

async fn list(
    State(state): State<AppState>,
    user: CurrentUser,
    Query(page): Query<PageQuery>,
    Query(f): Query<ListQuery>,
) -> AppResult<Json<Value>> {
    user.require_any(&["media.upload", "media.manage", "content.view"])?;
    let q =
        f.q.as_deref()
            .map(str::trim)
            .filter(|q| !q.is_empty())
            .map(|q| format!("%{q}%"));
    let kind = f.kind.filter(|k| k == "image" || k == "document");
    let rows = sqlx::query(
        "select m.id, m.kind, m.title, m.alt, m.decorative, m.updated_at, v.id as version_id, v.variants, v.size_bytes, v.width, v.height,
                (select count(distinct r.item_id) from media_usage mu join content_revisions r on r.id = mu.revision_id where mu.media_id = m.id) as usage
         from media m left join media_versions v on v.id = m.current_version_id
         where m.deleted_at is null and ($1::text is null or m.title ilike $1 or m.alt ilike $1) and ($2::text is null or m.kind = $2)
         order by m.updated_at desc limit $3 offset $4",
    )
    .bind(&q)
    .bind(&kind)
    .bind(page.limit())
    .bind(page.offset())
    .fetch_all(&state.db)
    .await?;
    let total: i64 = sqlx::query_scalar("select count(*) from media m where m.deleted_at is null and ($1::text is null or m.title ilike $1 or m.alt ilike $1) and ($2::text is null or m.kind = $2)")
        .bind(&q)
        .bind(&kind)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(json!({
        "data": rows.iter().map(|r| json!({
            "id": r.get::<Uuid, _>("id"), "kind": r.get::<String, _>("kind"), "title": r.get::<String, _>("title"), "alt": r.get::<Option<String>, _>("alt"),
            "decorative": r.get::<bool, _>("decorative"), "updated_at": r.get::<DateTime<Utc>, _>("updated_at"), "version_id": r.get::<Option<Uuid>, _>("version_id"),
            "variants": r.get::<Option<Value>, _>("variants"), "size_bytes": r.get::<Option<i64>, _>("size_bytes"), "width": r.get::<Option<i32>, _>("width"),
            "height": r.get::<Option<i32>, _>("height"), "usage": r.get::<i64, _>("usage"),
        })).collect::<Vec<_>>(),
        "meta": { "total": total, "page": page.page(), "per_page": page.limit() },
    })))
}

async fn detail(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    user.require_any(&["media.upload", "media.manage", "content.view"])?;
    Ok(Json(json!({ "data": media_json(&state, id).await? })))
}

#[derive(Deserialize)]
struct UpdateBody {
    title: String,
    alt: Option<String>,
    decorative: bool,
}

async fn update(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<UpdateBody>,
) -> AppResult<Json<Value>> {
    user.require("media.manage")?;
    let title = clean_line(&b.title);
    if title.is_empty() {
        return Err(AppError::field("title", "Give the file a title."));
    }
    let alt = b.alt.as_deref().map(clean_line).filter(|a| !a.is_empty());
    let kind: String =
        sqlx::query_scalar("select kind from media where id = $1 and deleted_at is null")
            .bind(id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(AppError::not_found)?;
    if kind == "image" && alt.is_none() && !b.decorative {
        return Err(AppError::field(
            "alt",
            "Describe the image, or mark it as decorative.",
        ));
    }
    sqlx::query(
        "update media set title = $2, alt = $3, decorative = $4, updated_at = now() where id = $1",
    )
    .bind(id)
    .bind(&title)
    .bind(&alt)
    .bind(b.decorative)
    .execute(&state.db)
    .await?;
    audit::record(
        &state.db,
        &user.actor(),
        "media.updated",
        "media",
        id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    Ok(Json(json!({ "data": media_json(&state, id).await? })))
}

/// Retires a file that no draft, approved or live content uses. Files of retained releases stay in those
/// release folders, so rollbacks are unaffected.
async fn retire(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    user.require("media.manage")?;
    let in_use: bool = sqlx::query_scalar(
        "select exists(select 1 from media_usage mu join content_revisions r on r.id = mu.revision_id
                       where mu.media_id = $1 and r.status in ('draft', 'in_review', 'changes_requested', 'approved', 'released'))",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if in_use {
        return Err(AppError::conflict(
            "in_use",
            "This file is still used by website content. Remove it from that content first.",
        ));
    }
    let n = sqlx::query("update media set deleted_at = now() where id = $1 and deleted_at is null")
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::not_found());
    }
    audit::record(
        &state.db,
        &user.actor(),
        "media.retired",
        "media",
        id,
        Outcome::Success,
        json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Staff-only access to stored files (for previews inside the admin panel).
async fn file(
    State(state): State<AppState>,
    user: CurrentUser,
    Path((version, name)): Path<(Uuid, String)>,
) -> AppResult<Response> {
    user.require_any(&["media.upload", "media.manage", "content.view"])?;
    if !(name == "document.pdf"
        || (name.ends_with(".webp") && name[..name.len() - 5].chars().all(|c| c.is_ascii_digit())))
    {
        return Err(AppError::not_found());
    }
    let bytes = tokio::fs::read(
        state
            .config
            .media_root
            .join(version.to_string())
            .join(&name),
    )
    .await
    .map_err(|_| AppError::not_found())?;
    Response::builder()
        .header(
            header::CONTENT_TYPE,
            if name.ends_with(".pdf") {
                "application/pdf"
            } else {
                "image/webp"
            },
        )
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .header("X-Content-Type-Options", "nosniff")
        .body(Body::from(bytes))
        .map_err(AppError::internal)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(w: u32, h: u32) -> Vec<u8> {
        let img = image::RgbImage::from_fn(w, h, |x, y| {
            image::Rgb([(x % 255) as u8, (y % 255) as u8, 128])
        });
        let mut out = Cursor::new(vec![]);
        img.write_to(&mut out, ImageFormat::Png).unwrap();
        out.into_inner()
    }

    #[test]
    fn images_get_webp_variants_without_upscaling() {
        let p = process_image(&png(1000, 500)).unwrap();
        let names: Vec<&str> = p.files.iter().map(|f| f.0.as_str()).collect();
        assert_eq!(names, vec!["480.webp", "960.webp"]);
        assert!(p.files.iter().all(|f| f.1.starts_with(b"RIFF")));
        let small = process_image(&png(300, 200)).unwrap();
        assert_eq!(small.files[0].0, "300.webp");
    }

    #[test]
    fn non_images_and_svg_are_refused() {
        assert!(
            process_image(
                b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
            )
            .is_err()
        );
        assert!(process_image(b"GIF89a....").is_err());
        assert!(process_pdf(b"%PDF-1.4\n%%EOF").is_ok());
        assert!(process_pdf(b"not a pdf").is_err());
    }
}
