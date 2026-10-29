//! Release controller drivers: put a built release in front of visitors, and confirm which release is
//! actually being served by fetching its /release.json marker.
//!
//! * `file`  (development): writes RELEASES_ROOT/current.json, read by the dev site server.
//! * `caddy` (production): renders deploy/caddy/Caddyfile.template with the release id and its HTTP
//!   redirects, and loads it through Caddy's admin API. Caddy validates a config before applying it, so a
//!   bad config leaves the previous release serving.

use std::{path::PathBuf, time::Duration};

use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{config::ActivationDriver, state::AppState};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct RedirectRule {
    pub from: String,
    pub to: String,
    pub status: u16,
}

pub fn release_dir(state: &AppState, id: Uuid) -> PathBuf {
    state.config.releases_root.join(id.to_string())
}

pub fn preview_dir(state: &AppState, id: Uuid) -> PathBuf {
    state.config.previews_root.join(id.to_string())
}

fn safe_path(s: &str) -> bool {
    !s.is_empty()
        && !s
            .chars()
            .any(|c| c.is_whitespace() || matches!(c, '"' | '\'' | '{' | '}' | '\\' | '`' | '#'))
}

/// Caddyfile lines answering each legacy URL (with or without a trailing slash) with a real HTTP redirect.
pub fn render_redirects(rules: &[RedirectRule]) -> String {
    let mut out = String::new();
    for (i, r) in rules.iter().enumerate() {
        if !safe_path(&r.from) || !safe_path(&r.to) || ![301, 302].contains(&r.status) {
            tracing::warn!(from = %r.from, "skipping unsafe redirect");
            continue;
        }
        let base = r.from.trim_end_matches('/');
        out.push_str(&format!(
            "\t@redirect{i} path {base} {base}/\n\tredir @redirect{i} {} {}\n",
            r.to, r.status
        ));
    }
    out
}

pub fn render_template(template: &str, release: Uuid, rules: &[RedirectRule]) -> String {
    template
        .replace("{{RELEASE_ID}}", &release.to_string())
        .replace("{{REDIRECTS}}", &render_redirects(rules))
}

pub async fn activate(
    state: &AppState,
    release: Uuid,
    rules: &[RedirectRule],
) -> anyhow::Result<()> {
    let dir = release_dir(state, release);
    if !dir.join("release.json").exists() {
        anyhow::bail!("release files are missing at {}", dir.display());
    }
    match &state.config.activation {
        ActivationDriver::File => {
            let root = &state.config.releases_root;
            let tmp = root.join("current.json.tmp");
            tokio::fs::write(
                &tmp,
                serde_json::to_vec_pretty(&json!({ "id": release, "redirects": rules }))?,
            )
            .await?;
            tokio::fs::rename(&tmp, root.join("current.json")).await?;
            Ok(())
        }
        ActivationDriver::Caddy {
            admin_url,
            template,
            output,
        } => {
            let tpl = tokio::fs::read_to_string(template).await?;
            let rendered = render_template(&tpl, release, rules);
            let tmp = output.with_extension("tmp");
            tokio::fs::write(&tmp, &rendered).await?;
            tokio::fs::rename(&tmp, output).await?;
            let res = state
                .http
                .post(admin_url.join("/load")?)
                .header("Content-Type", "text/caddyfile")
                .body(rendered)
                .send()
                .await?;
            if !res.status().is_success() {
                let body = res.text().await.unwrap_or_default();
                anyhow::bail!(
                    "Caddy rejected the configuration: {}",
                    body.chars().take(500).collect::<String>()
                );
            }
            Ok(())
        }
    }
}

#[derive(Deserialize)]
struct Marker {
    id: Uuid,
}

/// The release visitors are being served, according to its marker file.
pub async fn serving_release(state: &AppState) -> anyhow::Result<Option<Uuid>> {
    match (&state.config.activation, state.config.dev_site_bind) {
        (ActivationDriver::File, None) => {
            let path = state.config.releases_root.join("current.json");
            match tokio::fs::read(&path).await {
                Ok(bytes) => Ok(Some(serde_json::from_slice::<Marker>(&bytes)?.id)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(e.into()),
            }
        }
        _ => {
            let base = match (&state.config.activation, state.config.dev_site_bind) {
                (ActivationDriver::File, Some(addr)) => format!("http://{addr}"),
                _ => state
                    .config
                    .release_check_url
                    .as_str()
                    .trim_end_matches('/')
                    .to_owned(),
            };
            let url = format!("{base}/release.json?check={}", Uuid::new_v4());
            let res = state
                .http
                .get(url)
                .header("Cache-Control", "no-cache")
                .timeout(Duration::from_secs(10))
                .send()
                .await?;
            if !res.status().is_success() {
                return Ok(None);
            }
            Ok(Some(res.json::<Marker>().await?.id))
        }
    }
}

/// Confirms visitors now get `release` (retrying briefly while the server reloads).
pub async fn verify(state: &AppState, release: Uuid) -> anyhow::Result<()> {
    let mut last = None;
    for _ in 0..20 {
        match serving_release(state).await {
            Ok(Some(id)) if id == release => return Ok(()),
            Ok(other) => last = Some(format!("serving {other:?}")),
            Err(e) => last = Some(e.to_string()),
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    anyhow::bail!(
        "the site did not start serving the new release ({})",
        last.unwrap_or_default()
    )
}

pub async fn remove_release_files(state: &AppState, id: Uuid) {
    let _ = tokio::fs::remove_dir_all(release_dir(state, id)).await;
}

pub async fn remove_preview_files(state: &AppState, id: Uuid) {
    let _ = tokio::fs::remove_dir_all(preview_dir(state, id)).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_http_redirects_and_skips_unsafe_rules() {
        let rules = vec![
            RedirectRule {
                from: "/top-banks-in-pune".into(),
                to: "/about-us/".into(),
                status: 301,
            },
            RedirectRule {
                from: "/bad path".into(),
                to: "/x/".into(),
                status: 301,
            },
            RedirectRule {
                from: "/inject".into(),
                to: "/x/}\nadmin".into(),
                status: 301,
            },
        ];
        let out = render_redirects(&rules);
        assert!(out.contains("@redirect0 path /top-banks-in-pune /top-banks-in-pune/"));
        assert!(out.contains("redir @redirect0 /about-us/ 301"));
        assert!(!out.contains("bad path"));
        assert!(!out.contains("admin"));
        let id = Uuid::nil();
        assert!(
            render_template(
                "root * /srv/releases/{{RELEASE_ID}}\n{{REDIRECTS}}",
                id,
                &rules[..1]
            )
            .contains("/srv/releases/00000000-0000-0000-0000-000000000000")
        );
    }
}
