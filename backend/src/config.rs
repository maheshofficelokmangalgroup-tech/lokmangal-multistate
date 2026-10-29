//! Runtime configuration from environment variables (see deploy/.env.example).
//! Production refuses to start with missing or weak settings; errors never echo secret values.

use std::{env, net::SocketAddr, path::PathBuf};

use anyhow::{Context, anyhow, bail};
use base64::{Engine, engine::general_purpose::STANDARD};
use url::Url;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppEnv {
    Development,
    Test,
    Production,
}

#[derive(Clone, Debug)]
pub enum SmtpSecurity {
    None,
    StartTls,
    Tls,
}

#[derive(Clone, Debug)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub user: Option<String>,
    pub password: Option<String>,
    pub security: SmtpSecurity,
}

/// How a ready release is put in front of visitors.
#[derive(Clone, Debug)]
pub enum ActivationDriver {
    /// Writes RELEASES_ROOT/current (development: served by the dev site server).
    File,
    /// Renders a Caddyfile from a template and loads it through Caddy's admin API.
    Caddy {
        admin_url: Url,
        template: PathBuf,
        output: PathBuf,
    },
}

#[derive(Clone, Debug)]
pub struct Config {
    pub env: AppEnv,
    pub bind: SocketAddr,
    pub internal_bind: SocketAddr,
    pub dev_site_bind: Option<SocketAddr>,
    pub database_url: String,
    pub public_site_url: Url,
    pub admin_url: Url,
    pub preview_url: Url,
    /// Server-side pepper for hashing session, reset and preview tokens (HMAC-SHA256).
    pub token_key: Vec<u8>,
    pub data_key: [u8; 32],
    pub data_key_version: i16,
    pub build_service_url: Url,
    pub build_service_token: String,
    /// How the builder reaches this API's internal listener (snapshot download and status callbacks).
    pub internal_url: Url,
    pub activation: ActivationDriver,
    /// Optional URL used to confirm the serving release (defaults to PUBLIC_SITE_URL).
    pub release_check_url: Url,
    pub releases_root: PathBuf,
    pub previews_root: PathBuf,
    pub media_root: PathBuf,
    pub private_root: PathBuf,
    pub smtp: Option<SmtpConfig>,
    pub mail_from: String,
    pub job_concurrency: usize,
    pub build_timeout_secs: u64,
    pub trust_proxy: bool,
    pub run_worker: bool,
    pub source_commit: Option<String>,
    pub builder_image: Option<String>,
}

fn var(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

fn url(name: &str, default: Option<&str>) -> anyhow::Result<Url> {
    let raw = var(name)
        .or_else(|| default.map(str::to_owned))
        .ok_or_else(|| anyhow!("{name} is required"))?;
    Url::parse(&raw).with_context(|| format!("{name} is not a valid URL"))
}

fn secret_bytes(name: &str, min_len: usize, env: AppEnv) -> anyhow::Result<Vec<u8>> {
    match var(name) {
        Some(v) => {
            let bytes = STANDARD
                .decode(&v)
                .with_context(|| format!("{name} must be base64"))?;
            if bytes.len() < min_len {
                bail!("{name} must decode to at least {min_len} bytes");
            }
            Ok(bytes)
        }
        None if env != AppEnv::Production => {
            tracing::warn!("{name} not set; using an insecure development value");
            Ok(vec![7u8; min_len.max(32)])
        }
        None => bail!("{name} is required in production"),
    }
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let env = match var("APP_ENV").as_deref() {
            Some("production") => AppEnv::Production,
            Some("test") => AppEnv::Test,
            Some("development") | None => AppEnv::Development,
            Some(other) => bail!("APP_ENV must be development, test or production (got {other:?})"),
        };
        let prod = env == AppEnv::Production;

        let database_url =
            var("DATABASE_URL").ok_or_else(|| anyhow!("DATABASE_URL is required"))?;
        let public_site_url = url(
            "PUBLIC_SITE_URL",
            (!prod).then_some("http://localhost:4400"),
        )?;
        let admin_url = url("ADMIN_URL", (!prod).then_some("http://localhost:5173"))?;
        let preview_url = url("PREVIEW_URL", (!prod).then_some("http://localhost:4401"))?;
        if prod {
            for (n, u) in [
                ("PUBLIC_SITE_URL", &public_site_url),
                ("ADMIN_URL", &admin_url),
                ("PREVIEW_URL", &preview_url),
            ] {
                if u.scheme() != "https" {
                    bail!("{n} must use https in production");
                }
            }
        }

        let token_key = secret_bytes("SESSION_KEY", 32, env)?;
        let data_key_vec = secret_bytes("DATA_ENCRYPTION_KEY", 32, env)?;
        let data_key: [u8; 32] = data_key_vec[..32].try_into().expect("length checked");
        let data_key_version: i16 = var("DATA_ENCRYPTION_KEY_VERSION")
            .map(|v| v.parse())
            .transpose()?
            .unwrap_or(1);

        let build_service_token = match var("BUILD_SERVICE_TOKEN") {
            Some(t) if t.len() >= 32 => t,
            Some(_) => bail!("BUILD_SERVICE_TOKEN must be at least 32 characters"),
            None if !prod => "development-build-token-change-me-0000".to_owned(),
            None => bail!("BUILD_SERVICE_TOKEN is required in production"),
        };

        let var_root = PathBuf::from(var("DATA_ROOT").unwrap_or_else(|| "../var".to_owned()));
        let path = |name: &str, sub: &str| {
            var(name)
                .map(PathBuf::from)
                .unwrap_or_else(|| var_root.join(sub))
        };

        let activation =
            match var("ACTIVATION_DRIVER").as_deref() {
                Some("caddy") => ActivationDriver::Caddy {
                    admin_url: url("CADDY_ADMIN_URL", Some("http://caddy:2019"))?,
                    template: PathBuf::from(var("CADDY_TEMPLATE").ok_or_else(|| {
                        anyhow!("CADDY_TEMPLATE is required for the caddy driver")
                    })?),
                    output: PathBuf::from(
                        var("CADDY_RENDERED")
                            .unwrap_or_else(|| "/srv/state/Caddyfile.rendered".to_owned()),
                    ),
                },
                Some("file") | None => ActivationDriver::File,
                Some(other) => bail!("ACTIVATION_DRIVER must be file or caddy (got {other:?})"),
            };

        let smtp = match var("SMTP_HOST") {
            Some(host) => Some(SmtpConfig {
                host,
                port: var("SMTP_PORT")
                    .map(|p| p.parse())
                    .transpose()
                    .context("SMTP_PORT")?
                    .unwrap_or(587),
                user: var("SMTP_USER"),
                password: var("SMTP_PASSWORD"),
                security: match var("SMTP_SECURITY").as_deref() {
                    Some("none") => SmtpSecurity::None,
                    Some("tls") => SmtpSecurity::Tls,
                    Some("starttls") | None => SmtpSecurity::StartTls,
                    Some(other) => {
                        bail!("SMTP_SECURITY must be none, starttls or tls (got {other:?})")
                    }
                },
            }),
            None => None,
        };
        if prod && smtp.is_none() {
            tracing::warn!(
                "SMTP_HOST is not set: notification emails will be logged and marked failed"
            );
        }

        let release_check_url = url("RELEASE_CHECK_URL", Some(public_site_url.as_str()))?;

        Ok(Self {
            env,
            bind: var("API_BIND")
                .unwrap_or_else(|| "127.0.0.1:8000".into())
                .parse()
                .context("API_BIND")?,
            internal_bind: var("INTERNAL_BIND")
                .unwrap_or_else(|| "127.0.0.1:8001".into())
                .parse()
                .context("INTERNAL_BIND")?,
            dev_site_bind: if prod {
                None
            } else {
                var("DEV_SITE_BIND")
                    .map(|v| v.parse())
                    .transpose()
                    .context("DEV_SITE_BIND")?
            },
            database_url,
            public_site_url,
            admin_url,
            preview_url,
            token_key,
            data_key,
            data_key_version,
            build_service_url: url("BUILD_SERVICE_URL", Some("http://127.0.0.1:4300"))?,
            build_service_token,
            internal_url: url("INTERNAL_URL", Some("http://127.0.0.1:8001"))?,
            activation,
            release_check_url,
            releases_root: path("RELEASES_ROOT", "releases"),
            previews_root: path("PREVIEWS_ROOT", "previews"),
            media_root: path("MEDIA_STORE_ROOT", "media"),
            private_root: path("PRIVATE_FILES_ROOT", "private"),
            smtp,
            mail_from: var("MAIL_FROM")
                .unwrap_or_else(|| "Lokmangal Website <no-reply@lokmangalmultistate.com>".into()),
            job_concurrency: var("JOB_CONCURRENCY")
                .map(|v| v.parse())
                .transpose()
                .context("JOB_CONCURRENCY")?
                .unwrap_or(2),
            build_timeout_secs: var("BUILD_TIMEOUT_SECONDS")
                .map(|v| v.parse())
                .transpose()
                .context("BUILD_TIMEOUT_SECONDS")?
                .unwrap_or(300),
            trust_proxy: var("TRUST_PROXY").is_some_and(|v| v == "true" || v == "1"),
            run_worker: var("RUN_WORKER").is_none_or(|v| v != "false" && v != "0"),
            source_commit: var("SOURCE_COMMIT"),
            builder_image: var("BUILDER_IMAGE"),
        })
    }

    pub fn is_production(&self) -> bool {
        self.env == AppEnv::Production
    }

    /// Admin session cookie. `__Host-` requires HTTPS, so plain-HTTP development uses a different name.
    pub fn session_cookie_name(&self) -> &'static str {
        if self.admin_url.scheme() == "https" {
            "__Host-lm_session"
        } else {
            "lm_session"
        }
    }

    pub fn preview_cookie_name(&self) -> &'static str {
        if self.preview_url.scheme() == "https" {
            "__Host-lm_preview"
        } else {
            "lm_preview"
        }
    }

    pub fn cookie_secure(&self) -> bool {
        self.admin_url.scheme() == "https"
    }

    pub fn admin_origin(&self) -> String {
        self.admin_url.origin().ascii_serialization()
    }

    pub fn public_origin(&self) -> String {
        self.public_site_url.origin().ascii_serialization()
    }

    pub fn admin_link(&self, path_and_fragment: &str) -> String {
        format!(
            "{}{}",
            self.admin_url.as_str().trim_end_matches('/'),
            path_and_fragment
        )
    }
}
