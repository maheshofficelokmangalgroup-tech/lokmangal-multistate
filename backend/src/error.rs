//! One error type for every handler, rendered as
//! `{"error": {"code", "message", "fields", "request_id"}}` (specification §12.3).

use std::collections::BTreeMap;

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

tokio::task_local! {
    pub static REQUEST_ID: String;
}

pub fn current_request_id() -> Option<String> {
    REQUEST_ID.try_with(|id| id.clone()).ok()
}

pub type AppResult<T> = Result<T, AppError>;

/// Field-level validation messages, keyed by the request field name.
#[derive(Debug, Default, Clone)]
pub struct FieldErrors(pub BTreeMap<String, String>);

impl FieldErrors {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn add(&mut self, field: impl Into<String>, message: impl Into<String>) {
        self.0.entry(field.into()).or_insert_with(|| message.into());
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
    pub fn into_result(self) -> AppResult<()> {
        if self.0.is_empty() {
            Ok(())
        } else {
            Err(AppError::validation(self))
        }
    }
}

#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
    pub fields: Option<BTreeMap<String, String>>,
    pub extra: Option<Value>,
    pub source: Option<anyhow::Error>,
}

impl AppError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            fields: None,
            extra: None,
            source: None,
        }
    }
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "bad_request", message)
    }
    pub fn validation(fields: FieldErrors) -> Self {
        let mut e = Self::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "validation_failed",
            "Please correct the highlighted fields.",
        );
        e.fields = Some(fields.0);
        e
    }
    pub fn field(field: &str, message: impl Into<String>) -> Self {
        let mut f = FieldErrors::new();
        f.add(field, message);
        Self::validation(f)
    }
    pub fn unprocessable(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNPROCESSABLE_ENTITY, code, message)
    }
    pub fn unauthorized() -> Self {
        Self::new(
            StatusCode::UNAUTHORIZED,
            "unauthenticated",
            "Please sign in again.",
        )
    }
    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "forbidden", message)
    }
    pub fn missing_permission(permission: &str) -> Self {
        Self::forbidden(format!(
            "Your role does not include the “{permission}” permission."
        ))
        .with_extra(json!({ "permission": permission }))
    }
    /// Same response for "does not exist" and "exists but you may not see it".
    pub fn not_found() -> Self {
        Self::new(
            StatusCode::NOT_FOUND,
            "not_found",
            "This record does not exist or you do not have access to it.",
        )
    }
    pub fn conflict(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, code, message)
    }
    pub fn too_many(message: impl Into<String>) -> Self {
        Self::new(StatusCode::TOO_MANY_REQUESTS, "rate_limited", message)
    }
    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::new(StatusCode::SERVICE_UNAVAILABLE, "unavailable", message)
    }
    pub fn internal(err: impl Into<anyhow::Error>) -> Self {
        let mut e = Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
            "Something went wrong on our side. Please try again.",
        );
        e.source = Some(err.into());
        e
    }
    pub fn with_extra(mut self, extra: Value) -> Self {
        self.extra = Some(extra);
        self
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} {}: {}",
            self.status.as_u16(),
            self.code,
            self.message
        )
    }
}

impl std::error::Error for AppError {}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let request_id = current_request_id();
        if self.status.is_server_error() {
            tracing::error!(request_id = request_id.as_deref().unwrap_or("-"), error = ?self.source, code = self.code, "request failed");
        }
        let mut body = json!({
            "code": self.code,
            "message": self.message,
            "request_id": request_id,
        });
        if let Some(fields) = self.fields {
            body["fields"] = json!(fields);
        }
        if let Some(Value::Object(extra)) = self.extra {
            for (k, v) in extra {
                body[k] = v;
            }
        }
        (self.status, Json(json!({ "error": body }))).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        if let sqlx::Error::RowNotFound = err {
            return Self::not_found();
        }
        if let Some(db) = err.as_database_error() {
            let message = db.message().to_owned();
            match db.code().as_deref() {
                Some("23505") => {
                    return Self::conflict(
                        "already_exists",
                        "A record with these details already exists.",
                    );
                }
                Some("23P01") => {
                    return Self::conflict(
                        "overlapping_period",
                        "Another approved rate set already covers part of these dates.",
                    );
                }
                Some("40001") | Some("40P01") => {
                    return Self::conflict(
                        "retry",
                        "Another change happened at the same time. Please try again.",
                    );
                }
                Some("P0001") => return Self::conflict("rule_violation", message),
                Some("23514") | Some("22P02") | Some("22003") => {
                    return Self::unprocessable(
                        "invalid_data",
                        "Some values are not allowed. Please check the form and try again.",
                    );
                }
                _ => {}
            }
        }
        Self::internal(err)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::internal(err)
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        Self::internal(err)
    }
}
