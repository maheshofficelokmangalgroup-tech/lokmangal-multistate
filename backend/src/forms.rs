//! Reads public form submissions sent as multipart/form-data (the website's forms), URL-encoded
//! bodies or JSON objects, with bounded sizes.

use std::collections::HashMap;

use axum::{
    Form, Json,
    extract::{FromRequest, Multipart, Request},
    http::header,
};
use bytes::Bytes;
use serde_json::Value;

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

pub struct Upload {
    pub field: String,
    pub file_name: String,
    pub content_type: Option<String>,
    pub bytes: Bytes,
}

#[derive(Default)]
pub struct FormData {
    pub fields: HashMap<String, String>,
    pub files: Vec<Upload>,
}

impl FormData {
    pub fn get(&self, key: &str) -> &str {
        self.fields.get(key).map(|s| s.trim()).unwrap_or("")
    }
    pub fn opt(&self, key: &str) -> Option<&str> {
        Some(self.get(key)).filter(|s| !s.is_empty())
    }
}

const MAX_FIELD_BYTES: usize = 8 * 1024;
const MAX_FIELDS: usize = 40;

/// `max_file_bytes` = None rejects any file part.
pub async fn read(
    req: Request,
    state: &AppState,
    max_file_bytes: Option<usize>,
) -> AppResult<FormData> {
    let ctype = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut out = FormData::default();
    if ctype.starts_with("multipart/form-data") {
        let mut mp = Multipart::from_request(req, state)
            .await
            .map_err(|_| AppError::bad_request("The form could not be read."))?;
        while let Some(field) = mp
            .next_field()
            .await
            .map_err(|_| AppError::bad_request("The form could not be read."))?
        {
            let name = field.name().unwrap_or("").to_owned();
            if let Some(file_name) = field.file_name().map(str::to_owned) {
                let Some(limit) = max_file_bytes else {
                    return Err(AppError::bad_request(
                        "Files cannot be attached to this form.",
                    ));
                };
                let content_type = field.content_type().map(str::to_owned);
                let bytes = field.bytes().await.map_err(|_| {
                    AppError::bad_request("The file upload did not complete. Please try again.")
                })?;
                if bytes.is_empty() {
                    continue;
                }
                if bytes.len() > limit {
                    return Err(AppError::field(
                        &name,
                        format!("The file is larger than {} MB.", limit / (1024 * 1024)),
                    ));
                }
                out.files.push(Upload {
                    field: name,
                    file_name,
                    content_type,
                    bytes,
                });
            } else {
                let text = field
                    .text()
                    .await
                    .map_err(|_| AppError::bad_request("The form could not be read."))?;
                insert(&mut out, name, text)?;
            }
        }
    } else if ctype.starts_with("application/x-www-form-urlencoded") {
        let Form(map) = Form::<Vec<(String, String)>>::from_request(req, state)
            .await
            .map_err(|_| AppError::bad_request("The form could not be read."))?;
        for (k, v) in map {
            insert(&mut out, k, v)?;
        }
    } else if ctype.starts_with("application/json") {
        let Json(map) = Json::<HashMap<String, Value>>::from_request(req, state)
            .await
            .map_err(|_| AppError::bad_request("The request body is not valid JSON."))?;
        for (k, v) in map {
            let text = match v {
                Value::String(s) => s,
                Value::Number(n) => n.to_string(),
                Value::Bool(b) => {
                    if b {
                        "on".into()
                    } else {
                        String::new()
                    }
                }
                Value::Null => String::new(),
                _ => return Err(AppError::bad_request(format!("Field {k} must be text."))),
            };
            insert(&mut out, k, text)?;
        }
    } else {
        return Err(AppError::new(
            axum::http::StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "unsupported_media_type",
            "Send the form as multipart/form-data, URL-encoded or JSON.",
        ));
    }
    Ok(out)
}

fn insert(out: &mut FormData, key: String, value: String) -> AppResult<()> {
    if out.fields.len() >= MAX_FIELDS || key.len() > 64 {
        return Err(AppError::bad_request("The form has too many fields."));
    }
    if value.len() > MAX_FIELD_BYTES {
        return Err(AppError::field(&key, "This field is too long."));
    }
    out.fields.insert(key, value);
    Ok(())
}
