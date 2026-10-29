//! End-to-end API tests against a real PostgreSQL database (specification §17.2).
//!
//! Each test creates its own database, runs the migrations and drives the HTTP API in-process.
//!   TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/postgres cargo test -- --include-ignored
//! They are marked #[ignore] so `cargo test` without a database still passes; CI runs them.

use std::sync::OnceLock;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use lokmangal::{
    MIGRATOR, app, auth::password, config::Config, mail::Mailer, security, state::AppState,
};
use serde_json::{Value, json};
use sqlx::{PgPool, postgres::PgPoolOptions};

use totp_rs::{Algorithm, TOTP};
use tower::ServiceExt;
use uuid::Uuid;

static ENV: OnceLock<()> = OnceLock::new();
static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn base_url() -> String {
    std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must point at a PostgreSQL server (any database; tests create their own)")
}

fn config() -> Config {
    ENV.get_or_init(|| {
        // SAFETY: set once, before any test thread reads the environment through Config::from_env.
        unsafe {
            std::env::set_var("APP_ENV", "test");
            std::env::set_var("DATABASE_URL", base_url());
            std::env::set_var("ADMIN_URL", "http://admin.test");
            std::env::set_var("PUBLIC_SITE_URL", "http://site.test");
            std::env::set_var("PREVIEW_URL", "http://preview.test");
            std::env::set_var(
                "DATA_ROOT",
                std::env::temp_dir()
                    .join("lokmangal-tests")
                    .to_string_lossy()
                    .to_string(),
            );
        }
    });
    Config::from_env().expect("test config")
}

struct TestApp {
    state: AppState,
    router: Router,
    db: PgPool,
}

async fn test_app() -> TestApp {
    let mut cfg = config();
    let db = if std::env::var("TEST_DB_MODE").is_ok_and(|m| m == "reset") {
        // Single-database servers (e.g. PGlite): start from an empty public schema.
        cfg.database_url = base_url();
        let db = lokmangal::connect(&cfg)
            .await
            .expect("connect to TEST_DATABASE_URL");
        sqlx::raw_sql("drop schema public cascade; create schema public;")
            .execute(&db)
            .await
            .expect("reset schema");
        db
    } else {
        let admin = PgPoolOptions::new()
            .max_connections(1)
            .connect(&base_url())
            .await
            .expect("connect to TEST_DATABASE_URL");
        let name = format!("lm_test_{}", Uuid::new_v4().simple());
        sqlx::query(&format!("create database {name}"))
            .execute(&admin)
            .await
            .expect("create test database");
        let mut url = url::Url::parse(&base_url()).unwrap();
        url.set_path(&format!("/{name}"));
        cfg.database_url = url.to_string();
        lokmangal::connect(&cfg).await.unwrap()
    };
    MIGRATOR
        .run(&db)
        .await
        .expect("migrations apply to an empty database");
    let state = AppState::new(db.clone(), cfg.clone(), Mailer::from_config(&cfg).unwrap());
    TestApp {
        router: app::main_app(state.clone()),
        state,
        db,
    }
}

const PASSWORD: &str = "granite river 47 lamps";

impl TestApp {
    /// Creates an active user with an authenticator and the given roles; returns (id, totp secret).
    async fn user(&self, email: &str, roles: &[&str], branches: &[Uuid]) -> (Uuid, Vec<u8>) {
        let secret = lokmangal::auth::totp::new_secret();
        let id: Uuid = sqlx::query_scalar(
            "insert into users (email, name, status, password_hash, totp_secret_enc, totp_key_version, totp_enabled_at)
             values ($1, $2, 'active', $3, $4, 1, now()) returning id",
        )
        .bind(email)
        .bind(email.split('@').next().unwrap())
        .bind(password::hash_password(PASSWORD).unwrap())
        .bind(security::encrypt(&self.state.config.data_key, &secret).unwrap())
        .fetch_one(&self.db)
        .await
        .unwrap();
        for r in roles {
            sqlx::query("insert into user_roles (user_id, role_id) select $1, id from roles where code = $2").bind(id).bind(r).execute(&self.db).await.unwrap();
        }
        for b in branches {
            sqlx::query("insert into user_branch_scopes (user_id, branch_id) values ($1, $2)")
                .bind(id)
                .bind(b)
                .execute(&self.db)
                .await
                .unwrap();
        }
        (id, secret)
    }

    async fn branch(&self, code: &str) -> Uuid {
        sqlx::query_scalar(
            "insert into branches (code, name, region) values ($1, $1, 'Test') returning id",
        )
        .bind(code)
        .fetch_one(&self.db)
        .await
        .unwrap()
    }

    async fn send(&self, req: Request<Body>) -> (StatusCode, Value, Option<String>) {
        let res = self.router.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let cookie = res
            .headers()
            .get(header::SET_COOKIE)
            .and_then(|v| v.to_str().ok())
            .and_then(|c| c.split(';').next())
            .map(str::to_owned);
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
            cookie,
        )
    }

    /// Signs in with password + TOTP and returns a client session.
    async fn login(&self, email: &str, secret: &[u8]) -> Session {
        let (s, body, cookie) = self
            .send(
                Request::post("/api/admin/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({ "email": email, "password": PASSWORD }).to_string(),
                    ))
                    .unwrap(),
            )
            .await;
        assert_eq!(s, StatusCode::OK, "{body}");
        assert_eq!(body["data"]["stage"], "totp");
        let partial = Session {
            cookie: cookie.unwrap(),
            csrf: body["data"]["csrf_token"].as_str().unwrap().to_owned(),
        };
        let code = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret.to_vec())
            .unwrap()
            .generate_current()
            .unwrap();
        let (s, body, cookie) = self
            .send(partial.req("POST", "/api/admin/auth/2fa", Some(json!({ "code": code }))))
            .await;
        assert_eq!(s, StatusCode::OK, "{body}");
        Session {
            cookie: cookie.unwrap(),
            csrf: body["data"]["csrf_token"].as_str().unwrap().to_owned(),
        }
    }

    async fn call(
        &self,
        session: &Session,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let (s, v, _) = self.send(session.req(method, path, body)).await;
        (s, v)
    }
}

struct Session {
    cookie: String,
    csrf: String,
}

impl Session {
    fn req(&self, method: &str, path: &str, body: Option<Value>) -> Request<Body> {
        Request::builder()
            .method(method)
            .uri(path)
            .header(header::COOKIE, &self.cookie)
            .header("x-csrf-token", &self.csrf)
            .header("content-type", "application/json")
            .body(
                body.map(|b| Body::from(b.to_string()))
                    .unwrap_or_else(Body::empty),
            )
            .unwrap()
    }
}

fn enquiry_form(key: &str, phone: &str, branch: Option<&str>) -> Request<Body> {
    let mut fields = vec![
        ("form", "loan"),
        ("name", "Ramesh Patil"),
        ("phone", phone),
        ("email", "ramesh@example.com"),
        ("city", "Solapur"),
        ("loan_type", "Housing Loan"),
        ("amount", "500000"),
        ("consent", "on"),
    ];
    if let Some(b) = branch {
        fields.push(("branch", b));
    }
    let body = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(fields)
        .finish();
    Request::post("/api/v1/enquiries")
        .header("content-type", "application/x-www-form-urlencoded")
        .header("idempotency-key", key)
        .body(Body::from(body))
        .unwrap()
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL (PostgreSQL)"]
async fn sign_in_requires_both_factors_and_revocation_is_immediate() {
    let _g = SERIAL.lock().await;
    let t = test_app().await;
    let (_, secret) = t.user("admin@example.com", &["super_admin"], &[]).await;

    // Password alone does not open the API.
    let (_, body, cookie) = t
        .send(
            Request::post("/api/admin/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "email": "admin@example.com", "password": PASSWORD }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    let partial = Session {
        cookie: cookie.unwrap(),
        csrf: body["data"]["csrf_token"].as_str().unwrap().into(),
    };
    assert_eq!(
        t.call(&partial, "GET", "/api/admin/auth/me", None).await.0,
        StatusCode::UNAUTHORIZED
    );

    // Wrong password: generic message.
    let (s, body, _) = t
        .send(
            Request::post("/api/admin/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "email": "admin@example.com", "password": "nope" }).to_string(),
                ))
                .unwrap(),
        )
        .await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"]["message"], "Email or password is incorrect.");

    let session = t.login("admin@example.com", &secret).await;
    let (s, me) = t.call(&session, "GET", "/api/admin/auth/me", None).await;
    assert_eq!(s, StatusCode::OK);
    assert!(
        me["data"]["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p == "users.manage")
    );

    // Missing CSRF header is refused for state changes.
    let mut req = session.req("POST", "/api/admin/auth/keepalive", None);
    req.headers_mut().remove("x-csrf-token");
    assert_eq!(t.send(req).await.0, StatusCode::FORBIDDEN);

    // Revoking the session blocks the next request.
    let session_id: Uuid =
        sqlx::query_scalar("select id from sessions where stage = 'full' and revoked_at is null")
            .fetch_one(&t.db)
            .await
            .unwrap();
    sqlx::query("update sessions set revoked_at = now() where id = $1")
        .bind(session_id)
        .execute(&t.db)
        .await
        .unwrap();
    assert_eq!(
        t.call(&session, "GET", "/api/admin/auth/me", None).await.0,
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL (PostgreSQL)"]
async fn enquiries_are_idempotent_durable_and_branch_isolated() {
    let _g = SERIAL.lock().await;
    let t = test_app().await;
    let pune = t.branch("PUNE").await;
    let latur = t.branch("LATUR").await;

    // Same key + same content → same reference, one row. SMTP is not configured: still committed.
    let (s1, b1, _) = t
        .send(enquiry_form("key-aaaaaaaa", "9876543210", Some("PUNE")))
        .await;
    assert_eq!(s1, StatusCode::CREATED, "{b1}");
    let (s2, b2, _) = t
        .send(enquiry_form("key-aaaaaaaa", "9876543210", Some("PUNE")))
        .await;
    assert_eq!(s2, StatusCode::OK);
    assert_eq!(b1["data"]["reference"], b2["data"]["reference"]);
    // Same key, different content → conflict.
    assert_eq!(
        t.send(enquiry_form("key-aaaaaaaa", "9123456789", Some("PUNE")))
            .await
            .0,
        StatusCode::CONFLICT
    );
    let count: i64 = sqlx::query_scalar("select count(*) from enquiries")
        .fetch_one(&t.db)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let queued: i64 = sqlx::query_scalar("select count(*) from jobs where kind = 'notify_enquiry'")
        .fetch_one(&t.db)
        .await
        .unwrap();
    assert_eq!(queued, 1, "notification goes through the outbox");

    let (s, _, _) = t
        .send(enquiry_form("key-bbbbbbbb", "9123456789", Some("LATUR")))
        .await;
    assert_eq!(s, StatusCode::CREATED);

    let (_, secret) = t
        .user("pune@example.com", &["branch_manager"], &[pune])
        .await;
    let pune_mgr = t.login("pune@example.com", &secret).await;
    let (s, list) = t
        .call(&pune_mgr, "GET", "/api/admin/leads?status=all", None)
        .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(
        list["meta"]["total"], 1,
        "only own-branch leads are counted"
    );
    let latur_lead: Uuid = sqlx::query_scalar("select id from enquiries where branch_id = $1")
        .bind(latur)
        .fetch_one(&t.db)
        .await
        .unwrap();
    assert_eq!(
        t.call(
            &pune_mgr,
            "GET",
            &format!("/api/admin/leads/{latur_lead}"),
            None
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        t.call(
            &pune_mgr,
            "PATCH",
            &format!("/api/admin/leads/{latur_lead}"),
            Some(json!({ "status": "contacted" }))
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    // Branch managers have no export permission at all.
    assert_eq!(
        t.call(&pune_mgr, "GET", "/api/admin/leads/export", None)
            .await
            .0,
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL (PostgreSQL)"]
async fn makers_cannot_approve_their_own_rates_and_edits_invalidate_reviews() {
    let _g = SERIAL.lock().await;
    let t = test_app().await;
    let seed: Value =
        serde_json::from_str(include_str!("../../frontend/seed/snapshot.json")).unwrap();
    let summary = lokmangal::importer::import_snapshot(&t.db, &seed, false, "test")
        .await
        .unwrap();
    assert!(summary.errors.is_empty(), "{:?}", summary.errors);
    // Re-import is idempotent.
    let again = lokmangal::importer::import_snapshot(&t.db, &seed, false, "test")
        .await
        .unwrap();
    assert_eq!(again.created, 0);

    let (_, maker_secret) = t
        .user("maker@example.com", &["finance_maker", "super_admin"], &[])
        .await;
    let (_, checker_secret) = t.user("checker@example.com", &["approver"], &[]).await;
    let maker = t.login("maker@example.com", &maker_secret).await;
    let checker = t.login("checker@example.com", &checker_secret).await;

    let current: Uuid = sqlx::query_scalar("select id from rate_sets where status = 'approved'")
        .fetch_one(&t.db)
        .await
        .unwrap();
    let (s, created) = t.call(&maker, "POST", "/api/admin/rate-sets", Some(json!({ "from_id": current, "label": "2027–28", "valid_from": "2027-04-01", "valid_until": "2028-04-01" }))).await;
    assert_eq!(s, StatusCode::CREATED, "{created}");
    let id = created["data"]["id"].as_str().unwrap().to_owned();
    let mut entries = created["data"]["entries"].as_array().unwrap().clone();
    for e in entries.iter_mut() {
        if e["key"] == "deposit.lakshadish" {
            e["value"] = json!("9.50");
        }
    }
    let lock = created["data"]["lock_version"].clone();
    let body = json!({ "lock_version": lock, "label": "2027–28", "valid_from": "2027-04-01", "valid_until": "2028-04-01", "source_document": "Leaflet 2027–28", "change_reason": "Annual revision", "entries": entries });
    let (s, saved) = t
        .call(
            &maker,
            "PATCH",
            &format!("/api/admin/rate-sets/{id}"),
            Some(body.clone()),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{saved}");
    // Saving again with the old lock version is an edit conflict.
    assert_eq!(
        t.call(
            &maker,
            "PATCH",
            &format!("/api/admin/rate-sets/{id}"),
            Some(body)
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let (s, submitted) = t
        .call(
            &maker,
            "POST",
            &format!("/api/admin/rate-sets/{id}/submit"),
            Some(json!({})),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{submitted}");
    let approval = submitted["data"]["approval"]["id"]
        .as_str()
        .unwrap()
        .to_owned();

    // The maker holds Super Admin and financial approval rights, and still cannot approve.
    let (s, err) = t
        .call(
            &maker,
            "POST",
            &format!("/api/admin/approvals/{approval}/approve"),
            Some(json!({})),
        )
        .await;
    assert_eq!(s, StatusCode::FORBIDDEN, "{err}");
    // The database itself refuses a self-review, whatever the application does.
    let direct = sqlx::query("update approvals set status = 'approved', reviewer_id = submitted_by, decided_at = now() where id = $1::uuid").bind(&approval).execute(&t.db).await;
    assert!(direct.is_err());

    let (s, ok) = t
        .call(
            &checker,
            "POST",
            &format!("/api/admin/approvals/{approval}/approve"),
            Some(json!({ "comment": "Matches the leaflet" })),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{ok}");
    assert_eq!(ok["data"]["prepared_future_release"], true);
    // Approved rates are frozen.
    assert!(
        sqlx::query("update rate_entries set value = 1 where rate_set_id = $1::uuid")
            .bind(&id)
            .execute(&t.db)
            .await
            .is_err()
    );
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL (PostgreSQL)"]
async fn content_drafts_lock_and_stale_reviews_are_withdrawn() {
    let _g = SERIAL.lock().await;
    let t = test_app().await;
    let seed: Value =
        serde_json::from_str(include_str!("../../frontend/seed/snapshot.json")).unwrap();
    lokmangal::importer::import_snapshot(&t.db, &seed, false, "test")
        .await
        .unwrap();
    let (_, secret) = t.user("editor@example.com", &["finance_maker"], &[]).await;
    let (_, checker_secret) = t.user("checker@example.com", &["approver"], &[]).await;
    let editor = t.login("editor@example.com", &secret).await;
    let checker = t.login("checker@example.com", &checker_secret).await;

    let item: Uuid = sqlx::query_scalar(
        "select id from content_items where collection = 'loan' and slug = 'housing-loan'",
    )
    .fetch_one(&t.db)
    .await
    .unwrap();
    let (_, d) = t
        .call(
            &editor,
            "GET",
            &format!("/api/admin/content/loan/{item}"),
            None,
        )
        .await;
    let mut data = d["data"]["draft"]["data"].clone();
    data["summary"] = json!("Updated summary for the housing loan.");
    let save = json!({ "data": data, "revision_id": d["data"]["draft"]["id"], "lock_version": d["data"]["draft"]["lock_version"] });
    // The imported revision is approved, so saving creates a new draft revision.
    let (s, saved) = t
        .call(
            &editor,
            "PATCH",
            &format!("/api/admin/content/loan/{item}"),
            Some(save.clone()),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{saved}");
    assert_eq!(saved["data"]["draft"]["revision"], 2);
    // A second save based on the stale revision is refused.
    assert_eq!(
        t.call(
            &editor,
            "PATCH",
            &format!("/api/admin/content/loan/{item}"),
            Some(save)
        )
        .await
        .0,
        StatusCode::CONFLICT
    );

    let (s, sub) = t
        .call(
            &editor,
            "POST",
            &format!("/api/admin/content/loan/{item}/submit"),
            Some(json!({ "note": "Board resolution 3/2027" })),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{sub}");
    let approval = sub["data"]["approval"]["id"].as_str().unwrap().to_owned();

    // Editing after submission withdraws the review; approving the old revision is refused as stale.
    let mut data2 = sub["data"]["draft"]["data"].clone();
    data2["summary"] = json!("Changed again after submission.");
    let (s, _) = t.call(&editor, "PATCH", &format!("/api/admin/content/loan/{item}"), Some(json!({ "data": data2, "revision_id": sub["data"]["draft"]["id"], "lock_version": sub["data"]["draft"]["lock_version"] }))).await;
    assert_eq!(s, StatusCode::OK);
    let (s, stale) = t
        .call(
            &checker,
            "POST",
            &format!("/api/admin/approvals/{approval}/approve"),
            Some(json!({})),
        )
        .await;
    assert_eq!(s, StatusCode::CONFLICT, "{stale}");
    assert_eq!(stale["error"]["code"], "stale_review");

    // Rate placeholders that do not exist block submission.
    let (_, cur) = t
        .call(
            &editor,
            "GET",
            &format!("/api/admin/content/loan/{item}"),
            None,
        )
        .await;
    let mut bad = cur["data"]["draft"]["data"].clone();
    bad["rate"] = json!("{rate:loan.does-not-exist}%");
    t.call(&editor, "PATCH", &format!("/api/admin/content/loan/{item}"), Some(json!({ "data": bad, "revision_id": cur["data"]["draft"]["id"], "lock_version": cur["data"]["draft"]["lock_version"] }))).await;
    assert_eq!(
        t.call(
            &editor,
            "POST",
            &format!("/api/admin/content/loan/{item}/submit"),
            Some(json!({ "note": "x" }))
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL (PostgreSQL)"]
async fn releases_only_take_approved_financial_content_and_audit_is_append_only() {
    let _g = SERIAL.lock().await;
    let t = test_app().await;
    let seed: Value =
        serde_json::from_str(include_str!("../../frontend/seed/snapshot.json")).unwrap();
    lokmangal::importer::import_snapshot(&t.db, &seed, false, "test")
        .await
        .unwrap();
    let (_, secret) = t
        .user("publisher@example.com", &["admin", "finance_maker"], &[])
        .await;
    let s = t.login("publisher@example.com", &secret).await;

    // The imported baseline is eligible: every item is approved.
    let (status, pending) = t.call(&s, "GET", "/api/admin/publish/pending", None).await;
    assert_eq!(status, StatusCode::OK, "{pending}");
    let ids: Vec<Value> = pending["data"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|i| i["candidate_revision_id"].as_str().map(|x| json!(x)))
        .collect();
    assert!(ids.len() > 150);

    // An unapproved draft of a financial item cannot be selected for a live release.
    let item: Uuid = sqlx::query_scalar(
        "select id from content_items where collection = 'deposit_scheme' limit 1",
    )
    .fetch_one(&t.db)
    .await
    .unwrap();
    let (_, d) = t
        .call(
            &s,
            "GET",
            &format!("/api/admin/content/deposit_scheme/{item}"),
            None,
        )
        .await;
    let mut data = d["data"]["draft"]["data"].clone();
    data["pitch"] = json!("A new pitch nobody approved.");
    let (_, saved) = t.call(&s, "PATCH", &format!("/api/admin/content/deposit_scheme/{item}"), Some(json!({ "data": data, "revision_id": d["data"]["draft"]["id"], "lock_version": d["data"]["draft"]["lock_version"] }))).await;
    let draft_rev = saved["data"]["draft"]["id"].clone();
    let (status, blocked) = t
        .call(
            &s,
            "POST",
            "/api/admin/releases",
            Some(json!({ "revision_ids": [draft_rev] })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{blocked}");
    assert!(
        blocked["error"]["problems"]
            .to_string()
            .contains("not been approved")
    );

    // The approved baseline builds a snapshot with resolvable rates and no private data.
    let (status, created) = t
        .call(
            &s,
            "POST",
            "/api/admin/releases",
            Some(json!({ "revision_ids": ids, "idempotency_key": "first-release" })),
        )
        .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{created}");
    let snapshot: Value = sqlx::query_scalar("select snapshot from releases where id = $1::uuid")
        .bind(created["data"]["id"].as_str().unwrap())
        .fetch_one(&t.db)
        .await
        .unwrap();
    let text = snapshot.to_string();
    assert!(!text.contains("ramesh@example.com") && !text.contains("phone_normalized"));
    assert_eq!(
        snapshot["collections"]["deposit_scheme"]
            .as_array()
            .unwrap()
            .len(),
        9
    );
    assert_eq!(snapshot["rateSet"]["entries"].as_array().unwrap().len(), 28);
    // Idempotent: the same key returns the same release.
    let (status, again) = t
        .call(
            &s,
            "POST",
            "/api/admin/releases",
            Some(json!({ "revision_ids": [], "idempotency_key": "first-release" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(again["data"]["id"], created["data"]["id"]);

    // Audit rows cannot be changed or deleted by the application.
    assert!(
        sqlx::query("update audit_events set action = 'x'")
            .execute(&t.db)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("delete from audit_events")
            .execute(&t.db)
            .await
            .is_err()
    );
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL (PostgreSQL)"]
async fn every_read_endpoint_answers_for_a_full_access_user() {
    let _g = SERIAL.lock().await;
    let t = test_app().await;
    let seed: Value =
        serde_json::from_str(include_str!("../../frontend/seed/snapshot.json")).unwrap();
    lokmangal::importer::import_snapshot(&t.db, &seed, false, "test")
        .await
        .unwrap();
    let (_, secret) = t.user("all@example.com", &["super_admin", "hr"], &[]).await;
    let s = t.login("all@example.com", &secret).await;
    t.send(enquiry_form("key-cccccccc", "9876501234", None))
        .await;
    let lead: Uuid = sqlx::query_scalar("select id from enquiries limit 1")
        .fetch_one(&t.db)
        .await
        .unwrap();
    let rate_set: Uuid = sqlx::query_scalar("select id from rate_sets limit 1")
        .fetch_one(&t.db)
        .await
        .unwrap();
    let scheme: Uuid = sqlx::query_scalar(
        "select id from content_items where collection = 'deposit_scheme' limit 1",
    )
    .fetch_one(&t.db)
    .await
    .unwrap();
    let user: Uuid = sqlx::query_scalar("select id from users limit 1")
        .fetch_one(&t.db)
        .await
        .unwrap();
    let mut paths = vec![
        "/api/admin/auth/me".to_owned(),
        "/api/admin/auth/sessions".into(),
        "/api/admin/dashboard".into(),
        "/api/admin/dashboard?range=30d".into(),
        "/api/admin/leads?status=all&q=Ramesh&sort=follow_up_at".into(),
        format!("/api/admin/leads/{lead}"),
        "/api/admin/leads/export?format=xlsx".into(),
        "/api/admin/applications".into(),
        "/api/admin/content".into(),
        "/api/admin/rate-sets".into(),
        format!("/api/admin/rate-sets/{rate_set}"),
        format!("/api/admin/content/deposit_scheme/{scheme}"),
        format!("/api/admin/content/deposit_scheme/{scheme}/revisions"),
        format!("/api/admin/content/deposit_scheme/{scheme}/revisions/1"),
        "/api/admin/approvals".into(),
        "/api/admin/approvals?status=decided".into(),
        "/api/admin/publish/pending".into(),
        "/api/admin/releases".into(),
        "/api/admin/releases?kind=preview".into(),
        "/api/admin/media".into(),
        "/api/admin/users".into(),
        format!("/api/admin/users/{user}"),
        "/api/admin/roles".into(),
        "/api/admin/audit?outcome=success".into(),
        "/api/admin/audit/export".into(),
        "/api/admin/settings".into(),
        "/api/admin/system/status".into(),
        "/api/admin/notifications".into(),
        "/api/admin/directory/branches".into(),
        "/api/admin/directory/assignees".into(),
        "/api/admin/search?q=lak".into(),
        "/api/admin/data-requests".into(),
    ];
    for c in lokmangal::content::collections::COLLECTIONS {
        paths.push(format!("/api/admin/content/{}?status=unreleased", c.name));
    }
    for p in paths {
        let res = t
            .router
            .clone()
            .oneshot(s.req("GET", &p, None))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK, "GET {p}");
    }
}

/// A résumé of a few MB must get through the global 1 MB body limit, and must stay private.
#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL (PostgreSQL)"]
async fn job_applications_accept_a_pdf_resume_and_keep_it_private() {
    let _g = SERIAL.lock().await;
    let t = test_app().await;
    let boundary = "----lmboundary";
    let text_part = |name: &str, value: &str| {
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
        )
        .into_bytes()
    };
    let multipart = |resume: &[u8], filename_header: &str| -> Request<Body> {
        let mut body: Vec<u8> = vec![];
        for (k, v) in [
            ("name", "Asha Kulkarni"),
            ("phone", "9822012345"),
            ("email", "asha@example.com"),
            ("city", "Pune"),
            ("position", "Other"),
            ("consent", "on"),
        ] {
            body.extend(text_part(k, v));
        }
        body.extend(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"resume\"; {filename_header}\r\nContent-Type: application/pdf\r\n\r\n").into_bytes());
        body.extend_from_slice(resume);
        body.extend(format!("\r\n--{boundary}--\r\n").into_bytes());
        Request::post("/api/v1/applications")
            .header(
                "content-type",
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(Body::from(body))
            .unwrap()
    };

    let mut pdf = b"%PDF-1.7\n".to_vec();
    pdf.extend(std::iter::repeat_n(b'x', 3 * 1024 * 1024));
    pdf.extend_from_slice(b"\n%%EOF\n");
    let (status, resp, _) = t.send(multipart(&pdf, "filename=\"cv.pdf\"")).await;
    assert_eq!(status, StatusCode::CREATED, "{resp}");
    assert!(
        resp["data"]["reference"]
            .as_str()
            .unwrap()
            .starts_with("LMA-")
    );

    // The file is stored outside every public path, and only a user with the explicit permission can download it.
    let file_id: Uuid = sqlx::query_scalar("select resume_file_id from job_applications")
        .fetch_one(&t.db)
        .await
        .unwrap();
    assert!(
        t.state
            .config
            .private_root
            .join(format!("{file_id}.pdf"))
            .exists()
    );
    let (_, hr_secret) = t.user("hr@example.com", &["hr"], &[]).await;
    let (_, admin_secret) = t.user("admin2@example.com", &["admin"], &[]).await;
    let hr = t.login("hr@example.com", &hr_secret).await;
    let admin = t.login("admin2@example.com", &admin_secret).await;
    let path = format!("/api/admin/private-files/{file_id}/download");
    assert_eq!(
        t.call(&admin, "GET", &path, None).await.0,
        StatusCode::FORBIDDEN,
        "admins cannot download résumés"
    );
    let res = t
        .router
        .clone()
        .oneshot(hr.req("GET", &path, None))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers()[header::CACHE_CONTROL], "no-store");

    // A file that is not a PDF is refused with a field error, and so is a résumé over 5 MB.
    let (status, resp, _) = t
        .send(multipart(b"MZ this is an executable", "filename=\"x.pdf\""))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{resp}");
    assert!(resp["error"]["fields"]["resume"].is_string());
    let mut big = b"%PDF-1.7\n".to_vec();
    big.extend(std::iter::repeat_n(b'x', 5 * 1024 * 1024 + 10));
    big.extend_from_slice(b"\n%%EOF\n");
    let (status, _, _) = t.send(multipart(&big, "filename=\"big.pdf\"")).await;
    assert!(
        matches!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY
                | StatusCode::PAYLOAD_TOO_LARGE
                | StatusCode::BAD_REQUEST
        ),
        "{status}"
    );
    let stored: i64 = sqlx::query_scalar("select count(*) from job_applications")
        .fetch_one(&t.db)
        .await
        .unwrap();
    assert_eq!(stored, 1, "refused uploads create nothing");
}

/// Simulates the builder finishing: the release becomes "ready" and its folder carries the marker file.
async fn make_ready(t: &TestApp, id: Uuid) {
    sqlx::query("update releases set status = 'ready' where id = $1")
        .bind(id)
        .execute(&t.db)
        .await
        .unwrap();
    let dir = lokmangal::activation::release_dir(&t.state, id);
    tokio::fs::create_dir_all(&dir).await.unwrap();
    tokio::fs::write(dir.join("release.json"), json!({ "id": id }).to_string())
        .await
        .unwrap();
}

/// Moves the (approved) imported rate set relative to today, so the test does not depend on the date it runs.
async fn place_rates(t: &TestApp, from_days: i32, until_days: i32) {
    // Approved sets are frozen; a set is moved while it is a draft and approved again.
    sqlx::raw_sql(&format!(
        "update rate_sets set status = 'draft';
         update rate_sets set valid_from = (now() at time zone 'Asia/Kolkata')::date + ({from_days}),
                              valid_until = (now() at time zone 'Asia/Kolkata')::date + ({until_days});
         update rate_sets set status = 'approved';"
    ))
    .execute(&t.db)
    .await
    .unwrap();
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL (PostgreSQL)"]
async fn releases_activate_roll_back_and_fall_back_when_rates_expire() {
    use lokmangal::releases;
    let _g = SERIAL.lock().await;
    let t = test_app().await;
    let seed: Value =
        serde_json::from_str(include_str!("../../frontend/seed/snapshot.json")).unwrap();
    lokmangal::importer::import_snapshot(&t.db, &seed, false, "test")
        .await
        .unwrap();
    place_rates(&t, -30, 300).await;
    let (uid, secret) = t.user("publisher@example.com", &["admin"], &[]).await;
    let s = t.login("publisher@example.com", &secret).await;
    let status_of = |id: Uuid| {
        let db = t.db.clone();
        async move {
            sqlx::query_scalar::<_, String>("select status from releases where id = $1")
                .bind(id)
                .fetch_one(&db)
                .await
                .unwrap()
        }
    };

    // Release 1: the imported baseline goes live.
    let (_, pending) = t.call(&s, "GET", "/api/admin/publish/pending", None).await;
    let ids: Vec<Value> = pending["data"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|i| i["candidate_revision_id"].as_str().map(|x| json!(x)))
        .collect();
    let (code, r1) = t
        .call(
            &s,
            "POST",
            "/api/admin/releases",
            Some(json!({ "revision_ids": ids })),
        )
        .await;
    assert_eq!(code, StatusCode::ACCEPTED, "{r1}");
    let first: Uuid = r1["data"]["id"].as_str().unwrap().parse().unwrap();
    make_ready(&t, first).await;
    releases::activate_job(&t.state, first, Some(uid))
        .await
        .unwrap();
    assert_eq!(status_of(first).await, "live");
    let live_items: i64 =
        sqlx::query_scalar("select count(*) from content_items where live_revision_id is not null")
            .fetch_one(&t.db)
            .await
            .unwrap();
    assert!(live_items > 150, "activation records what is live");
    assert_eq!(
        lokmangal::activation::serving_release(&t.state)
            .await
            .unwrap(),
        Some(first)
    );

    // Release 2: an edited FAQ (no approval needed) replaces it; release 1 is kept for rollback.
    let faq: Uuid = sqlx::query_scalar("select id from content_items where collection = 'faq'")
        .fetch_one(&t.db)
        .await
        .unwrap();
    let (_, d) = t
        .call(&s, "GET", &format!("/api/admin/content/faq/{faq}"), None)
        .await;
    let mut data = d["data"]["draft"]["data"].clone();
    data["items"][0]["q"] = json!("What is Lokmangal, in one line?");
    let (code, saved) = t.call(&s, "PATCH", &format!("/api/admin/content/faq/{faq}"), Some(json!({ "data": data, "revision_id": d["data"]["draft"]["id"], "lock_version": d["data"]["draft"]["lock_version"] }))).await;
    assert_eq!(code, StatusCode::OK, "{saved}");
    let (code, r2) = t
        .call(
            &s,
            "POST",
            "/api/admin/releases",
            Some(json!({ "revision_ids": [saved["data"]["draft"]["id"]] })),
        )
        .await;
    assert_eq!(code, StatusCode::ACCEPTED, "{r2}");
    let second: Uuid = r2["data"]["id"].as_str().unwrap().parse().unwrap();
    make_ready(&t, second).await;
    releases::activate_job(&t.state, second, Some(uid))
        .await
        .unwrap();
    assert_eq!(status_of(second).await, "live");
    assert_eq!(status_of(first).await, "superseded");
    let live_faq: Value = sqlx::query_scalar("select r.data from content_items i join content_revisions r on r.id = i.live_revision_id where i.id = $1").bind(faq).fetch_one(&t.db).await.unwrap();
    assert_eq!(live_faq["items"][0]["q"], "What is Lokmangal, in one line?");

    // Rollback needs a reason, and puts release 1 back in front of visitors; drafts are untouched.
    assert_eq!(
        t.call(
            &s,
            "POST",
            &format!("/api/admin/releases/{first}/rollback"),
            Some(json!({ "reason": "  " }))
        )
        .await
        .0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let (code, rb) = t
        .call(
            &s,
            "POST",
            &format!("/api/admin/releases/{first}/rollback"),
            Some(json!({ "reason": "Wrong FAQ wording" })),
        )
        .await;
    assert_eq!(code, StatusCode::ACCEPTED, "{rb}");
    releases::activate_job(&t.state, first, Some(uid))
        .await
        .unwrap();
    assert_eq!(status_of(first).await, "live");
    assert_eq!(status_of(second).await, "superseded");
    assert_eq!(
        lokmangal::activation::serving_release(&t.state)
            .await
            .unwrap(),
        Some(first)
    );
    let draft_q: Value = sqlx::query_scalar("select r.data->'items'->0->'q' from content_items i join content_revisions r on r.id = i.draft_revision_id where i.id = $1").bind(faq).fetch_one(&t.db).await.unwrap();
    assert_eq!(
        draft_q, "What is Lokmangal, in one line?",
        "the newer draft is kept"
    );

    // A release that is not ready cannot be activated, and an activation that fails keeps the old release.
    sqlx::query("update releases set status = 'failed' where id = $1")
        .bind(second)
        .execute(&t.db)
        .await
        .unwrap();
    releases::activate_job(&t.state, second, Some(uid))
        .await
        .unwrap();
    assert_eq!(status_of(first).await, "live");

    // Rates that are no longer in force: rollback to a release showing other rates is refused.
    sqlx::query("update releases set status = 'superseded' where id = $1")
        .bind(second)
        .execute(&t.db)
        .await
        .unwrap();
    place_rates(&t, -400, -1).await;
    let (code, refused) = t
        .call(
            &s,
            "POST",
            &format!("/api/admin/releases/{second}/rollback"),
            Some(json!({ "reason": "test" })),
        )
        .await;
    assert_eq!(code, StatusCode::CONFLICT, "{refused}");
    assert_eq!(refused["error"]["code"], "rates_not_current");

    // Expiry watchdog: published rates have ended and nothing replaces them → a notice release is prepared.
    t.user("checker@example.com", &["approver"], &[]).await;
    releases::scheduler_tick(&t.state).await.unwrap();
    let fallback: Value = sqlx::query_scalar("select snapshot from releases where expiry_fallback")
        .fetch_one(&t.db)
        .await
        .unwrap();
    assert_eq!(fallback["rateSet"]["expired"], true);
    let alerts: i64 =
        sqlx::query_scalar("select count(*) from notifications where kind = 'rate_expiry'")
            .fetch_one(&t.db)
            .await
            .unwrap();
    assert!(alerts >= 1, "approvers are alerted");
    // Running the watchdog again does not pile up more notice releases.
    releases::scheduler_tick(&t.state).await.unwrap();
    let count: i64 = sqlx::query_scalar("select count(*) from releases where expiry_fallback")
        .fetch_one(&t.db)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

/// The headline workflow: rates approved for a future date are prepared ahead and go live by themselves
/// when that date arrives, with the new figures in every table, text and example.
#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL (PostgreSQL)"]
async fn approved_future_rates_prepare_a_release_that_goes_live_on_their_first_day() {
    use lokmangal::releases;
    let _g = SERIAL.lock().await;
    let t = test_app().await;
    let seed: Value =
        serde_json::from_str(include_str!("../../frontend/seed/snapshot.json")).unwrap();
    lokmangal::importer::import_snapshot(&t.db, &seed, false, "test")
        .await
        .unwrap();
    place_rates(&t, -30, 10).await;
    let (uid, secret) = t.user("publisher@example.com", &["admin"], &[]).await;
    let s = t.login("publisher@example.com", &secret).await;

    // Today's rates are live.
    let (_, pending) = t.call(&s, "GET", "/api/admin/publish/pending", None).await;
    let ids: Vec<Value> = pending["data"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|i| i["candidate_revision_id"].as_str().map(|x| json!(x)))
        .collect();
    let (code, r1) = t
        .call(
            &s,
            "POST",
            "/api/admin/releases",
            Some(json!({ "revision_ids": ids })),
        )
        .await;
    assert_eq!(code, StatusCode::ACCEPTED, "{r1}");
    let first: Uuid = r1["data"]["id"].as_str().unwrap().parse().unwrap();
    make_ready(&t, first).await;
    releases::activate_job(&t.state, first, Some(uid))
        .await
        .unwrap();

    // Next year's set (Lakshadish 9.25 → 9.50) is approved ahead of its start date, ten days from now.
    let today = "(now() at time zone 'Asia/Kolkata')::date";
    let future: Uuid = sqlx::query_scalar(&format!(
        "insert into rate_sets (lineage_id, label, valid_from, valid_until, status, source_document, change_reason, finance_policy)
         values (gen_random_uuid(), '2027–28', {today} + 10, {today} + 375, 'draft', 'Leaflet 2027–28', 'Annual revision', 'lmcs-fin-2026.1') returning id"
    ))
    .fetch_one(&t.db)
    .await
    .unwrap();
    sqlx::query(
        "insert into rate_entries (rate_set_id, key, section, label, category, tenure_min_days, tenure_max_days, value, unit, sort_order)
         select $1, key, section, label, category, tenure_min_days, tenure_max_days,
                case when key = 'deposit.lakshadish' then 9.50 else value end, unit, sort_order
         from rate_entries where rate_set_id <> $1",
    )
    .bind(future)
    .execute(&t.db)
    .await
    .unwrap();
    sqlx::query("update rate_sets set status = 'approved' where id = $1")
        .bind(future)
        .execute(&t.db)
        .await
        .unwrap();

    // Approval queues the preparation job; the job builds a release scheduled for 00:00 IST on day one.
    releases::prepare_rate_release(&t.state, future)
        .await
        .unwrap();
    let (prepared, at, rate_set, snapshot): (Uuid, chrono::DateTime<chrono::Utc>, Uuid, Value) =
        sqlx::query_as("select id, scheduled_for, rate_set_id, snapshot from releases where kind = 'live' and status = 'queued'").fetch_one(&t.db).await.unwrap();
    assert_eq!(rate_set, future);
    let first_day: chrono::NaiveDate = sqlx::query_scalar(&format!("select {today} + 10"))
        .fetch_one(&t.db)
        .await
        .unwrap();
    assert_eq!(
        at.with_timezone(&chrono_tz::Asia::Kolkata).date_naive(),
        first_day
    );
    assert_eq!(
        at.with_timezone(&chrono_tz::Asia::Kolkata)
            .format("%H:%M")
            .to_string(),
        "00:00"
    );
    let lakshadish = snapshot["rateSet"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["key"] == "deposit.lakshadish")
        .unwrap();
    assert_eq!(lakshadish["value"], "9.5");
    // Preparing again replaces rather than duplicates.
    releases::prepare_rate_release(&t.state, future)
        .await
        .unwrap();
    let active: i64 = sqlx::query_scalar("select count(*) from releases where kind = 'live' and scheduled_for is not null and status not in ('cancelled')").fetch_one(&t.db).await.unwrap();
    assert_eq!(active, 1);
    let prepared = sqlx::query_scalar::<_, Uuid>("select id from releases where kind = 'live' and scheduled_for is not null and status = 'queued'").fetch_one(&t.db).await.unwrap_or(prepared);

    // The builder finishes it: it waits as "scheduled", and is not live yet. The old rates are still served.
    sqlx::query("update releases set status = 'scheduled' where id = $1")
        .bind(prepared)
        .execute(&t.db)
        .await
        .unwrap();
    let dir = lokmangal::activation::release_dir(&t.state, prepared);
    tokio::fs::create_dir_all(&dir).await.unwrap();
    tokio::fs::write(
        dir.join("release.json"),
        json!({ "id": prepared }).to_string(),
    )
    .await
    .unwrap();
    releases::scheduler_tick(&t.state).await.unwrap();
    let queued_early: i64 = sqlx::query_scalar(
        "select count(*) from jobs where kind = 'activate_release' and payload->>'release_id' = $1",
    )
    .bind(prepared.to_string())
    .fetch_one(&t.db)
    .await
    .unwrap();
    assert_eq!(queued_early, 0, "nothing activates before the start date");
    assert_eq!(
        lokmangal::activation::serving_release(&t.state)
            .await
            .unwrap(),
        Some(first)
    );

    // Ten days pass: the new set is now the one in force, and the scheduled release is due.
    sqlx::raw_sql("update rate_sets set status = 'draft'; update rate_sets set valid_from = valid_from - 11, valid_until = valid_until - 11; update rate_sets set status = 'approved'; update releases set scheduled_for = now() - interval '1 minute' where status = 'scheduled';")
        .execute(&t.db)
        .await
        .unwrap();
    releases::scheduler_tick(&t.state).await.unwrap();
    let queued: i64 = sqlx::query_scalar(
        "select count(*) from jobs where kind = 'activate_release' and payload->>'release_id' = $1",
    )
    .bind(prepared.to_string())
    .fetch_one(&t.db)
    .await
    .unwrap();
    assert_eq!(
        queued, 1,
        "the scheduler queues the activation once the time has come"
    );
    releases::activate_job(&t.state, prepared, None)
        .await
        .unwrap();
    let (status, live_rates): (String, Uuid) =
        sqlx::query_as("select status, rate_set_id from releases where id = $1")
            .bind(prepared)
            .fetch_one(&t.db)
            .await
            .unwrap();
    assert_eq!((status.as_str(), live_rates), ("live", future));
    let old: String = sqlx::query_scalar("select status from releases where id = $1")
        .bind(first)
        .fetch_one(&t.db)
        .await
        .unwrap();
    assert_eq!(old, "superseded");
    assert_eq!(
        lokmangal::activation::serving_release(&t.state)
            .await
            .unwrap(),
        Some(prepared)
    );
    // And the previous release's old rates cannot be brought back by a rollback.
    let (_, secret2) = t.user("rollbacker@example.com", &["admin"], &[]).await;
    let s2 = t.login("rollbacker@example.com", &secret2).await;
    let (code, refused) = t
        .call(
            &s2,
            "POST",
            &format!("/api/admin/releases/{first}/rollback"),
            Some(json!({ "reason": "test" })),
        )
        .await;
    assert_eq!(code, StatusCode::CONFLICT, "{refused}");
    assert_eq!(refused["error"]["code"], "rates_not_current");
}

#[tokio::test]
#[ignore = "needs TEST_DATABASE_URL (PostgreSQL)"]
async fn re_import_updates_untouched_items_and_keeps_staff_edits() {
    let _g = SERIAL.lock().await;
    let t = test_app().await;
    let seed: Value =
        serde_json::from_str(include_str!("../../frontend/seed/snapshot.json")).unwrap();
    let first = lokmangal::importer::import_snapshot(&t.db, &seed, false, "test")
        .await
        .unwrap();
    assert!(first.errors.is_empty(), "{:?}", first.errors);

    // The seed changes one item that nobody has edited: it is updated, not reported as a conflict.
    let mut next = seed.clone();
    next["singletons"]["csr"]["initiatives"][0]["title"] = json!("Renamed initiative");
    let second = lokmangal::importer::import_snapshot(&t.db, &next, false, "test")
        .await
        .unwrap();
    assert_eq!(second.updated, 1, "{:?}", second.conflicts);
    assert!(second.conflicts.is_empty(), "{:?}", second.conflicts);
    let title: String = sqlx::query_scalar(
        "select r.data #>> '{initiatives,0,title}' from content_items i join content_revisions r on r.id = i.draft_revision_id where i.collection = 'csr' and i.slug = 'csr'",
    )
    .fetch_one(&t.db)
    .await
    .unwrap();
    assert_eq!(title, "Renamed initiative");

    // A staff member edits the people page. A later seed change to it must not overwrite that edit.
    let (staff, _) = t.user("editor@example.com", &["editor"], &[]).await;
    sqlx::query(
        "update content_revisions set updated_by = $1 where id = (select draft_revision_id from content_items where collection = 'people' and slug = 'people')",
    )
    .bind(staff)
    .execute(&t.db)
    .await
    .unwrap();
    let before: Value = sqlx::query_scalar(
        "select r.data from content_items i join content_revisions r on r.id = i.draft_revision_id where i.collection = 'people' and i.slug = 'people'",
    )
    .fetch_one(&t.db)
    .await
    .unwrap();
    let mut last = next.clone();
    last["singletons"]["people"]["chairman"]["role"] = json!("A role the seed now claims");
    let third = lokmangal::importer::import_snapshot(&t.db, &last, false, "test")
        .await
        .unwrap();
    assert_eq!(third.updated, 0);
    assert_eq!(third.conflicts.len(), 1, "{:?}", third.conflicts);
    assert!(third.conflicts[0].starts_with("people/people"));
    let after: Value = sqlx::query_scalar(
        "select r.data from content_items i join content_revisions r on r.id = i.draft_revision_id where i.collection = 'people' and i.slug = 'people'",
    )
    .fetch_one(&t.db)
    .await
    .unwrap();
    assert_eq!(before, after);
}
