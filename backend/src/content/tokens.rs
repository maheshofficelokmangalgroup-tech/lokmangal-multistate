//! Rate placeholders in product text — the same grammar as packages/finance/src/tokens.ts:
//! `{rate:KEY}`, `{rate2:KEY}`, `{number:KEY}`, `{calc}`, `{calc:interest}`, `{calc:invested}`.

use std::{collections::BTreeSet, sync::LazyLock};

use regex::Regex;
use serde_json::Value;

static TOKEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{(rate|rate2|number|calc)(?::([A-Za-z0-9.+_-]+))?\}").expect("regex")
});
static BRACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{(rate|rate2|number|calc)\b[^}]*\}?").expect("regex"));

#[derive(Debug, Default, PartialEq)]
pub struct TokenUse {
    pub rate_keys: BTreeSet<String>,
    pub uses_calc: bool,
    /// Placeholders that look like tokens but do not follow the grammar.
    pub malformed: Vec<String>,
}

pub fn scan(value: &Value) -> TokenUse {
    let mut out = TokenUse::default();
    walk(value, &mut out);
    out
}

fn walk(value: &Value, out: &mut TokenUse) {
    match value {
        Value::String(s) => {
            for c in TOKEN.captures_iter(s) {
                match (&c[1], c.get(2)) {
                    ("calc", None) => out.uses_calc = true,
                    ("calc", Some(arg)) if matches!(arg.as_str(), "interest" | "invested") => {
                        out.uses_calc = true
                    }
                    ("calc", Some(arg)) => out.malformed.push(format!("{{calc:{}}}", arg.as_str())),
                    (_, Some(key)) => {
                        out.rate_keys.insert(key.as_str().to_owned());
                    }
                    (kind, None) => out.malformed.push(format!("{{{kind}}}")),
                }
            }
            for m in BRACE.find_iter(s) {
                if !TOKEN.is_match(m.as_str()) {
                    out.malformed.push(m.as_str().to_owned());
                }
            }
        }
        Value::Array(a) => a.iter().for_each(|v| walk(v, out)),
        Value::Object(o) => o.values().for_each(|v| walk(v, out)),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn finds_keys_and_problems() {
        let t = scan(
            &json!({ "a": "{rate2:fd.7-30.regular}% and {calc}", "b": ["{number:doubling.general.months}", "{rate}", "{rate:bad key}"] }),
        );
        assert_eq!(
            t.rate_keys.into_iter().collect::<Vec<_>>(),
            vec!["doubling.general.months", "fd.7-30.regular"]
        );
        assert!(t.uses_calc);
        assert!(t.malformed.contains(&"{rate}".to_owned()));
        assert!(t.malformed.iter().any(|m| m.starts_with("{rate:bad")));
    }
}
