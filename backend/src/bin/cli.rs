//! lokmangal-cli — operator commands.
//!
//!   lokmangal-cli migrate
//!   lokmangal-cli create-admin --email you@example.com --name "Your Name"
//!   lokmangal-cli import-seed path/to/snapshot.json [--dry-run]
//!   lokmangal-cli reset-2fa --email someone@example.com --reason "verified by phone with GM"
//!   lokmangal-cli reconcile
//!   lokmangal-cli backup-status --ok|--failed [--message "..."]
//!   lokmangal-cli check-config

use anyhow::{Context, bail};
use lokmangal::{
    MIGRATOR,
    audit::{self, Actor, Outcome},
    auth::{revoke_all_sessions, routes::issue_invitation},
    config::Config,
    connect, importer,
    mail::Mailer,
    releases,
    state::AppState,
};
use serde_json::json;
use uuid::Uuid;

fn flag(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(cmd) = args.first().cloned() else {
        eprintln!(
            "usage: lokmangal-cli <migrate|create-admin|import-seed|reset-2fa|reconcile|backup-status|check-config> …"
        );
        std::process::exit(2);
    };
    let config = Config::from_env()?;
    if cmd == "check-config" {
        println!("Configuration is valid ({:?}).", config.env);
        return Ok(());
    }
    let db = connect(&config).await?;
    match cmd.as_str() {
        "migrate" => {
            MIGRATOR.run(&db).await?;
            println!("Migrations applied.");
        }
        "create-admin" => {
            MIGRATOR.run(&db).await?;
            let email = flag(&args, "--email")
                .context("--email is required")?
                .trim()
                .to_lowercase();
            let name = flag(&args, "--name").context("--name is required")?;
            let state = AppState::new(db.clone(), config.clone(), Mailer::from_config(&config)?);
            let mut tx = db.begin().await?;
            let id: Uuid = sqlx::query_scalar(
                "insert into users (email, name, status) values ($1, $2, 'invited') returning id",
            )
            .bind(&email)
            .bind(&name)
            .fetch_one(&mut *tx)
            .await
            .context("could not create the user (does the email already exist?)")?;
            sqlx::query("insert into user_roles (user_id, role_id) select $1, id from roles where code = 'super_admin'").bind(id).execute(&mut *tx).await?;
            let link = issue_invitation(&state, &mut tx, id, None)
                .await
                .map_err(|e| anyhow::anyhow!(e.message))?;
            audit::record(
                &mut *tx,
                &Actor::system("cli"),
                "user.invited",
                "user",
                id,
                Outcome::Success,
                json!({ "roles": ["super_admin"], "via": "cli" }),
            )
            .await?;
            tx.commit().await?;
            println!(
                "Super Admin {email} created. Open this link within 48 hours to set a password and two-factor authentication:\n{link}"
            );
        }
        "import-seed" => {
            MIGRATOR.run(&db).await?;
            let path = args.get(1).context("path to snapshot.json is required")?;
            let snapshot: serde_json::Value = serde_json::from_slice(
                &std::fs::read(path).with_context(|| format!("reading {path}"))?,
            )?;
            let dry = args.iter().any(|a| a == "--dry-run");
            let summary = importer::import_snapshot(&db, &snapshot, dry, "cli").await?;
            println!("{}", serde_json::to_string_pretty(&summary)?);
            if !summary.errors.is_empty() {
                bail!("import had errors; nothing was saved");
            }
        }
        "reset-2fa" => {
            let email = flag(&args, "--email")
                .context("--email is required")?
                .trim()
                .to_lowercase();
            let reason = flag(&args, "--reason").context("--reason is required")?;
            let mut tx = db.begin().await?;
            let id: Uuid = sqlx::query_scalar("update users set totp_secret_enc = null, totp_enabled_at = null, totp_last_step = null where email = $1 returning id")
                .bind(&email)
                .fetch_optional(&mut *tx)
                .await?
                .context("no such user")?;
            sqlx::query("delete from recovery_codes where user_id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            revoke_all_sessions(&mut *tx, id, None, "2fa_reset")
                .await
                .map_err(|e| anyhow::anyhow!(e.message))?;
            audit::record(
                &mut *tx,
                &Actor::system("cli"),
                "user.2fa_reset",
                "user",
                id,
                Outcome::Success,
                json!({ "reason": reason, "via": "cli" }),
            )
            .await?;
            tx.commit().await?;
            println!(
                "Two-factor authentication reset for {email}; they will set it up again at their next sign-in."
            );
        }
        "reconcile" => {
            let state = AppState::new(db, config.clone(), Mailer::from_config(&config)?);
            releases::reconcile(&state).await?;
            println!("Release state reconciled.");
        }
        "backup-status" => {
            let ok = args.iter().any(|a| a == "--ok");
            let message = flag(&args, "--message").unwrap_or_default();
            sqlx::query("insert into app_settings (key, value) values ('backup_status', $1) on conflict (key) do update set value = excluded.value, updated_at = now()")
                .bind(json!({ "ok": ok, "message": message, "at": chrono::Utc::now() }))
                .execute(&db)
                .await?;
            println!("Backup status recorded.");
        }
        other => bail!("unknown command {other}"),
    }
    Ok(())
}
