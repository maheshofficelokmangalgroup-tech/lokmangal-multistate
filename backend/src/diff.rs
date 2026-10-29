//! Field-level differences between two JSON documents, for review screens.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize, PartialEq)]
pub struct Change {
    pub path: String,
    pub kind: &'static str,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

pub fn diff(before: Option<&Value>, after: &Value) -> Vec<Change> {
    let mut out = vec![];
    match before {
        None => out.push(Change {
            path: String::new(),
            kind: "added",
            before: None,
            after: Some(after.clone()),
        }),
        Some(b) => walk("", b, after, &mut out),
    }
    out
}

fn walk(path: &str, a: &Value, b: &Value, out: &mut Vec<Change>) {
    match (a, b) {
        (Value::Object(x), Value::Object(y)) => {
            for (k, va) in x {
                let p = if path.is_empty() {
                    k.clone()
                } else {
                    format!("{path}.{k}")
                };
                match y.get(k) {
                    Some(vb) => walk(&p, va, vb, out),
                    None => out.push(Change {
                        path: p,
                        kind: "removed",
                        before: Some(va.clone()),
                        after: None,
                    }),
                }
            }
            for (k, vb) in y {
                if !x.contains_key(k) {
                    let p = if path.is_empty() {
                        k.clone()
                    } else {
                        format!("{path}.{k}")
                    };
                    out.push(Change {
                        path: p,
                        kind: "added",
                        before: None,
                        after: Some(vb.clone()),
                    });
                }
            }
        }
        (Value::Array(x), Value::Array(y)) => {
            for i in 0..x.len().max(y.len()) {
                let p = format!("{path}[{i}]");
                match (x.get(i), y.get(i)) {
                    (Some(va), Some(vb)) => walk(&p, va, vb, out),
                    (Some(va), None) => out.push(Change {
                        path: p,
                        kind: "removed",
                        before: Some(va.clone()),
                        after: None,
                    }),
                    (None, Some(vb)) => out.push(Change {
                        path: p,
                        kind: "added",
                        before: None,
                        after: Some(vb.clone()),
                    }),
                    (None, None) => {}
                }
            }
        }
        _ if a != b => out.push(Change {
            path: path.to_owned(),
            kind: "changed",
            before: Some(a.clone()),
            after: Some(b.clone()),
        }),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reports_changes_additions_and_removals() {
        let a = json!({ "name": "A", "facts": [{ "v": "1" }], "gone": true });
        let b = json!({ "name": "B", "facts": [{ "v": "1" }, { "v": "2" }], "new": 1 });
        let d = diff(Some(&a), &b);
        let paths: Vec<(&str, &str)> = d.iter().map(|c| (c.path.as_str(), c.kind)).collect();
        assert!(paths.contains(&("name", "changed")));
        assert!(paths.contains(&("facts[1]", "added")));
        assert!(paths.contains(&("gone", "removed")));
        assert!(paths.contains(&("new", "added")));
        assert_eq!(d.len(), 4);
    }
}
