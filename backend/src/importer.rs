//! Imports a public content snapshot (frontend/seed/snapshot.json) as the migration baseline.
//!
//! Idempotent: every item has a source key and checksum. Re-running skips unchanged items, updates items
//! staff have not touched since the last import, and never overwrites staff edits (reported as conflicts).
//! Imported revisions are marked approved because they reproduce what is already public; the first release
//! still goes through the normal build and activation.

use serde::Serialize;
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::{
    audit::{self, Actor, Outcome},
    content::collections,
    rates::{self, Entry},
    releases::FINANCE_POLICY,
    security::sha256_hex,
};

#[derive(Debug, Default, Serialize)]
pub struct Summary {
    pub created: usize,
    pub updated: usize,
    pub unchanged: usize,
    pub conflicts: Vec<String>,
    pub errors: Vec<String>,
    pub dry_run: bool,
}

const SOURCE: &str = "website-seed";

fn checksum(v: &Value) -> String {
    sha256_hex(v.to_string().as_bytes())
}

/// Internal item identifiers are ASCII; Marathi post URLs keep their own `slug` field in the data.
fn item_slug(collection: &str, slug: &str, data: &Value) -> String {
    if crate::text::is_slug(slug) {
        return slug.to_owned();
    }
    match data.get("id") {
        Some(Value::Number(n)) => format!("{}-{n}", collection.replace('_', "-")),
        _ => format!(
            "{}-{}",
            collection.replace('_', "-"),
            &sha256_hex(slug.as_bytes())[..12]
        ),
    }
}

async fn import_item(
    conn: &mut PgConnection,
    summary: &mut Summary,
    collection: &str,
    slug: &str,
    data: Value,
) -> anyhow::Result<()> {
    let key = format!("{collection}/{slug}");
    let data = match collections::validate(collection, data) {
        Ok(d) => d,
        Err(e) => {
            summary.errors.push(format!(
                "{key}: {}",
                e.0.values().cloned().collect::<Vec<_>>().join("; ")
            ));
            return Ok(());
        }
    };
    let sum = checksum(&data);
    let mapping: Option<(Uuid, String)> = sqlx::query_as(
        "select target_id, checksum from source_mappings where source = $1 and source_key = $2",
    )
    .bind(SOURCE)
    .bind(&key)
    .fetch_optional(&mut *conn)
    .await?;
    match mapping {
        Some((_, old)) if old == sum => summary.unchanged += 1,
        Some((item_id, _)) => {
            // A draft nobody but the importer has touched has no author. (Comparing the stored JSON with the
            // seed's checksum does not work: PostgreSQL reorders object keys, so the hashes never match.)
            let (draft_id, untouched): (Uuid, bool) =
                sqlx::query_as("select r.id, (r.created_by is null and r.updated_by is null) from content_items i join content_revisions r on r.id = i.draft_revision_id where i.id = $1").bind(item_id).fetch_one(&mut *conn).await?;
            if !untouched {
                summary.conflicts.push(format!(
                    "{key}: changed by staff since the last import — kept the staff version"
                ));
                return Ok(());
            }
            let next: i32 = sqlx::query_scalar(
                "select max(revision) + 1 from content_revisions where item_id = $1",
            )
            .bind(item_id)
            .fetch_one(&mut *conn)
            .await?;
            let rev: Uuid = sqlx::query_scalar(
                "insert into content_revisions (item_id, revision, data, status, note, source_revision_id) values ($1, $2, $3, 'approved', 'Re-imported from the website seed', $4) returning id",
            )
            .bind(item_id)
            .bind(next)
            .bind(&data)
            .bind(draft_id)
            .fetch_one(&mut *conn)
            .await?;
            sqlx::query(
                "update content_items set draft_revision_id = $2, updated_at = now() where id = $1",
            )
            .bind(item_id)
            .bind(rev)
            .execute(&mut *conn)
            .await?;
            sqlx::query("update source_mappings set checksum = $3, imported_at = now() where source = $1 and source_key = $2").bind(SOURCE).bind(&key).bind(&sum).execute(&mut *conn).await?;
            summary.updated += 1;
        }
        None => {
            let exists: bool = sqlx::query_scalar(
                "select exists(select 1 from content_items where collection = $1 and slug = $2)",
            )
            .bind(collection)
            .bind(item_slug(collection, slug, &data))
            .fetch_one(&mut *conn)
            .await?;
            if exists {
                summary.conflicts.push(format!(
                    "{key}: already created in the admin panel — not imported"
                ));
                return Ok(());
            }
            let item: Uuid = sqlx::query_scalar(
                "insert into content_items (collection, slug) values ($1, $2) returning id",
            )
            .bind(collection)
            .bind(item_slug(collection, slug, &data))
            .fetch_one(&mut *conn)
            .await?;
            let rev: Uuid = sqlx::query_scalar(
                "insert into content_revisions (item_id, revision, data, status, note) values ($1, 1, $2, 'approved', 'Imported from the existing website (baseline)') returning id",
            )
            .bind(item)
            .bind(&data)
            .fetch_one(&mut *conn)
            .await?;
            sqlx::query("update content_items set draft_revision_id = $2 where id = $1")
                .bind(item)
                .bind(rev)
                .execute(&mut *conn)
                .await?;
            sqlx::query("insert into source_mappings (source, source_key, target_type, target_id, checksum) values ($1, $2, 'content_item', $3, $4)")
                .bind(SOURCE)
                .bind(&key)
                .bind(item)
                .bind(&sum)
                .execute(&mut *conn)
                .await?;
            summary.created += 1;
        }
    }
    if collection == "branch" {
        let s = |k: &str| {
            data.get(k)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned()
        };
        sqlx::query(
            "insert into branches (code, name, region, is_head_office, active) values ($1, $2, $3, $4, $5)
             on conflict (code) do update set name = excluded.name, region = excluded.region, is_head_office = excluded.is_head_office, active = excluded.active, updated_at = now()",
        )
        .bind(s("code"))
        .bind(s("name"))
        .bind(s("region"))
        .bind(data.get("headOffice").and_then(Value::as_bool).unwrap_or(false))
        .bind(data.get("active").and_then(Value::as_bool).unwrap_or(true))
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn import_rate_set(
    conn: &mut PgConnection,
    summary: &mut Summary,
    rs: &Value,
) -> anyhow::Result<()> {
    let key = format!("rateSet/{}", rs["id"].as_str().unwrap_or("seed"));
    let entries: Vec<Entry> = rs["entries"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(i, e)| -> anyhow::Result<Entry> {
            Ok(Entry {
                key: e["key"].as_str().unwrap_or_default().to_owned(),
                section: e["section"].as_str().unwrap_or_default().to_owned(),
                label: e["label"].as_str().unwrap_or_default().to_owned(),
                category: e["category"].as_str().map(str::to_owned),
                tenure_min_days: e["minDays"].as_i64().map(|v| v as i32),
                tenure_max_days: e["maxDays"].as_i64().map(|v| v as i32),
                value: e["value"].as_str().unwrap_or("x").parse()?,
                unit: e["unit"].as_str().unwrap_or_default().to_owned(),
                sort_order: i as i32,
            })
        })
        .collect::<anyhow::Result<_>>()?;
    let problems = rates::validate_entries(&entries);
    if !problems.is_empty() {
        summary.errors.push(format!("{key}: {:?}", problems.0));
        return Ok(());
    }
    let sum = checksum(&serde_json::to_value(&entries)?);
    let existing: Option<String> = sqlx::query_scalar(
        "select checksum from source_mappings where source = $1 and source_key = $2",
    )
    .bind(SOURCE)
    .bind(&key)
    .fetch_optional(&mut *conn)
    .await?;
    match existing {
        Some(c) if c == sum => summary.unchanged += 1,
        Some(_) => summary.conflicts.push(format!("{key}: the seed's rates differ from the imported set — prepare a new rate set in the admin panel instead")),
        None => {
            let id: Uuid = sqlx::query_scalar(
                "insert into rate_sets (lineage_id, label, valid_from, valid_until, status, source_document, change_reason, finance_policy)
                 values (gen_random_uuid(), $1, $2::date, $3::date, 'draft', $4, 'Imported baseline of the rates published on the existing website', $5) returning id",
            )
            .bind(rs["label"].as_str().unwrap_or("Imported"))
            .bind(rs["validFrom"].as_str().unwrap_or_default())
            .bind(rs["validUntil"].as_str().unwrap_or_default())
            .bind("2026–27 scheme leaflets (as published on lokmangalmultistate.com)")
            .bind(FINANCE_POLICY)
            .fetch_one(&mut *conn)
            .await?;
            for e in &entries {
                sqlx::query(
                    "insert into rate_entries (rate_set_id, key, section, label, category, tenure_min_days, tenure_max_days, value, unit, sort_order)
                     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                )
                .bind(id)
                .bind(&e.key)
                .bind(&e.section)
                .bind(&e.label)
                .bind(&e.category)
                .bind(e.tenure_min_days)
                .bind(e.tenure_max_days)
                .bind(e.value)
                .bind(&e.unit)
                .bind(e.sort_order)
                .execute(&mut *conn)
                .await?;
            }
            sqlx::query("update rate_sets set status = 'approved' where id = $1").bind(id).execute(&mut *conn).await?;
            sqlx::query("insert into source_mappings (source, source_key, target_type, target_id, checksum) values ($1, $2, 'rate_set', $3, $4)")
                .bind(SOURCE)
                .bind(&key)
                .bind(id)
                .bind(&sum)
                .execute(&mut *conn)
                .await?;
            summary.created += 1;
        }
    }
    Ok(())
}

pub async fn import_snapshot(
    db: &PgPool,
    snapshot: &Value,
    dry_run: bool,
    started_by: &str,
) -> anyhow::Result<Summary> {
    if snapshot["schemaVersion"] != json!(1) {
        anyhow::bail!("unsupported snapshot schema version");
    }
    let mut summary = Summary {
        dry_run,
        ..Default::default()
    };
    let mut tx = db.begin().await?;
    let run: Uuid = sqlx::query_scalar(
        "insert into import_runs (source, dry_run, started_by) values ($1, $2, $3) returning id",
    )
    .bind(SOURCE)
    .bind(dry_run)
    .bind(started_by)
    .fetch_one(&mut *tx)
    .await?;
    import_rate_set(&mut tx, &mut summary, &snapshot["rateSet"]).await?;
    if let Some(singletons) = snapshot["singletons"].as_object() {
        for (name, data) in singletons {
            import_item(&mut tx, &mut summary, name, name, data.clone()).await?;
        }
    }
    if let Some(cols) = snapshot["collections"].as_object() {
        for (name, items) in cols {
            for item in items.as_array().into_iter().flatten() {
                let slug = item["slug"].as_str().unwrap_or_default();
                import_item(&mut tx, &mut summary, name, slug, item["data"].clone()).await?;
            }
        }
    }
    sqlx::query("update import_runs set summary = $2, finished_at = now() where id = $1")
        .bind(run)
        .bind(serde_json::to_value(&summary)?)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut *tx, &Actor::system(&format!("import:{started_by}")), "import.completed", "import_run", run, Outcome::Success, json!({ "created": summary.created, "updated": summary.updated, "unchanged": summary.unchanged, "conflicts": summary.conflicts.len(), "errors": summary.errors.len(), "dry_run": dry_run })).await?;
    if dry_run || !summary.errors.is_empty() {
        tx.rollback().await?;
    } else {
        tx.commit().await?;
    }
    Ok(summary)
}
