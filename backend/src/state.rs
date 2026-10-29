//! Shared application state and small request helpers.

use std::{
    collections::{HashMap, VecDeque},
    net::{IpAddr, SocketAddr},
    ops::Deref,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use axum::{
    extract::{ConnectInfo, FromRequestParts, Query},
    http::request::Parts,
};
use serde::Deserialize;
use sqlx::PgPool;

use crate::{config::Config, error::current_request_id, mail::Mailer};

#[derive(Clone)]
pub struct AppState(Arc<Inner>);

pub struct Inner {
    pub db: PgPool,
    pub config: Config,
    pub http: reqwest::Client,
    pub mailer: Mailer,
    pub public_limiter: SlidingLimiter,
}

impl AppState {
    pub fn new(db: PgPool, config: Config, mailer: Mailer) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("lokmangal-backend")
            .build()
            .expect("HTTP client");
        Self(Arc::new(Inner {
            db,
            config,
            http,
            mailer,
            public_limiter: SlidingLimiter::default(),
        }))
    }
}

impl Deref for AppState {
    type Target = Inner;
    fn deref(&self) -> &Inner {
        &self.0
    }
}

/// Who is calling: client IP (from Caddy's X-Forwarded-For when TRUST_PROXY is set), user agent, request id.
#[derive(Clone, Debug, Default)]
pub struct ClientMeta {
    pub ip: Option<IpAddr>,
    pub user_agent: Option<String>,
    pub request_id: Option<String>,
}

impl FromRequestParts<AppState> for ClientMeta {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(client_meta(parts, state.config.trust_proxy))
    }
}

pub fn client_meta(parts: &Parts, trust_proxy: bool) -> ClientMeta {
    let forwarded = trust_proxy
        .then(|| {
            parts
                .headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
        })
        .flatten()
        .and_then(|v| v.split(',').next())
        .and_then(|v| v.trim().parse::<IpAddr>().ok());
    let ip = forwarded.or_else(|| {
        parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|c| c.0.ip())
    });
    let user_agent = parts
        .headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.chars().take(300).collect());
    ClientMeta {
        ip,
        user_agent,
        request_id: current_request_id(),
    }
}

pub fn ip_network(ip: Option<IpAddr>) -> Option<sqlx::types::ipnetwork::IpNetwork> {
    ip.map(sqlx::types::ipnetwork::IpNetwork::from)
}

/// Fixed page sizes keep queries predictable (25, 50 or 100 rows).
#[derive(Debug, Deserialize, Clone, Copy)]
pub struct PageQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

impl PageQuery {
    pub fn limit(&self) -> i64 {
        match self.per_page {
            Some(50) => 50,
            Some(100) => 100,
            _ => 25,
        }
    }
    pub fn page(&self) -> i64 {
        self.page.unwrap_or(1).max(1)
    }
    pub fn offset(&self) -> i64 {
        (self.page() - 1) * self.limit()
    }
}

pub type Paging = Query<PageQuery>;

/// In-memory sliding-window limiter for public endpoints (per API instance).
#[derive(Default)]
pub struct SlidingLimiter {
    hits: Mutex<HashMap<(String, IpAddr), VecDeque<Instant>>>,
}

impl SlidingLimiter {
    /// Returns false when `ip` already made `max` requests to `bucket` within `window`.
    pub fn allow(&self, bucket: &str, ip: Option<IpAddr>, max: usize, window: Duration) -> bool {
        let Some(ip) = ip else { return true };
        let now = Instant::now();
        let mut map = self.hits.lock().expect("limiter lock");
        if map.len() > 50_000 {
            map.retain(|_, q| q.back().is_some_and(|t| now.duration_since(*t) < window));
        }
        let q = map.entry((bucket.to_owned(), ip)).or_default();
        while q.front().is_some_and(|t| now.duration_since(*t) >= window) {
            q.pop_front();
        }
        if q.len() >= max {
            return false;
        }
        q.push_back(now);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limiter_blocks_after_max() {
        let l = SlidingLimiter::default();
        let ip = Some("10.0.0.1".parse().unwrap());
        for _ in 0..3 {
            assert!(l.allow("x", ip, 3, Duration::from_secs(60)));
        }
        assert!(!l.allow("x", ip, 3, Duration::from_secs(60)));
        assert!(l.allow("y", ip, 3, Duration::from_secs(60)));
    }

    #[test]
    fn page_sizes_are_allowlisted() {
        let q = PageQuery {
            page: Some(3),
            per_page: Some(37),
        };
        assert_eq!((q.limit(), q.offset()), (25, 50));
    }
}
