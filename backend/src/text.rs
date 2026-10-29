//! Small text helpers: phone numbers, masking, spreadsheet safety, slugs.

/// Indian mobile/landline numbers → "+91XXXXXXXXXX". Accepts spaces, dashes, a leading 0, 91 or +91.
pub fn normalize_phone(input: &str) -> Option<String> {
    let digits: String = input.chars().filter(|c| c.is_ascii_digit()).collect();
    let local = match digits.len() {
        10 => digits.as_str(),
        11 if digits.starts_with('0') => &digits[1..],
        12 if digits.starts_with("91") => &digits[2..],
        13 if digits.starts_with("091") => &digits[3..],
        _ => return None,
    };
    if local.starts_with('0') {
        return None;
    }
    Some(format!("+91{local}"))
}

/// "+919876543210" → "+91 98xxxxx210"
pub fn mask_phone(normalized: &str) -> String {
    let d: Vec<char> = normalized.trim_start_matches("+91").chars().collect();
    if d.len() < 6 {
        return "••••".into();
    }
    format!(
        "+91 {}{}xxxxx{}",
        d[0],
        d[1],
        d[d.len() - 3..].iter().collect::<String>()
    )
}

/// "someone@example.com" → "so•••@example.com"
pub fn mask_email(email: &str) -> String {
    match email.split_once('@') {
        Some((user, domain)) => {
            let keep: String = user.chars().take(2).collect();
            format!("{keep}•••@{domain}")
        }
        None => "•••".into(),
    }
}

pub fn valid_email(email: &str) -> bool {
    let email = email.trim();
    if email.len() > 254 || email.contains(char::is_whitespace) {
        return false;
    }
    match email.rsplit_once('@') {
        Some((user, domain)) => {
            !user.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        }
        None => false,
    }
}

/// Trim, collapse internal whitespace runs on single-line fields, and drop control characters.
pub fn clean_line(s: &str) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .filter(|c| !c.is_control())
        .collect()
}

/// Multi-line text: trim, normalise newlines, drop other control characters.
pub fn clean_multiline(s: &str) -> String {
    s.replace("\r\n", "\n")
        .chars()
        .filter(|c| *c == '\n' || !c.is_control())
        .collect::<String>()
        .trim()
        .to_owned()
}

/// Neutralises spreadsheet formula injection (=, +, -, @, tab, CR) in exported cells.
pub fn spreadsheet_safe(s: &str) -> String {
    match s.chars().next() {
        Some('=' | '+' | '-' | '@' | '\t' | '\r') => format!("'{s}"),
        _ => s.to_owned(),
    }
}

pub fn slugify(s: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for c in s.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    out.trim_end_matches('-').to_owned()
}

pub fn is_slug(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 120
        && s.split('-').all(|p| {
            !p.is_empty()
                && p.chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phones_normalise() {
        assert_eq!(
            normalize_phone("98765 43210").as_deref(),
            Some("+919876543210")
        );
        assert_eq!(
            normalize_phone("+91-98765-43210").as_deref(),
            Some("+919876543210")
        );
        assert_eq!(
            normalize_phone("09876543210").as_deref(),
            Some("+919876543210")
        );
        assert_eq!(normalize_phone("12345"), None);
        assert_eq!(normalize_phone("0000000000"), None);
        assert_eq!(mask_phone("+919876543210"), "+91 98xxxxx210");
    }

    #[test]
    fn spreadsheet_cells_are_neutralised() {
        assert_eq!(spreadsheet_safe("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
        assert_eq!(spreadsheet_safe("+91 98"), "'+91 98");
        assert_eq!(spreadsheet_safe("Ramesh"), "Ramesh");
    }

    #[test]
    fn slugs() {
        assert_eq!(
            slugify("Annual Report 2016–2017"),
            "annual-report-2016-2017"
        );
        assert!(is_slug("lakshadish-deposit-scheme-1"));
        assert!(!is_slug("Bad Slug"));
        assert!(valid_email("a@b.in"));
        assert!(!valid_email("a@b"));
    }
}
