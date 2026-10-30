//! Argon2id password hashing and the password policy (≥12 characters, not a known weak password).

use argon2::{
    Algorithm, Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, Version,
    password_hash::{SaltString, rand_core::OsRng},
};

/// OWASP-recommended Argon2id baseline (19 MiB, 2 iterations, 1 lane). Re-benchmark on the production host.
fn hasher() -> Argon2<'static> {
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(19 * 1024, 2, 1, None).expect("valid params"),
    )
}

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(hasher()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("hashing failed: {e}"))?
        .to_string())
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => hasher()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

/// Spends the same time as a real verification, so unknown emails cannot be detected by timing.
pub fn burn_verification(password: &str) {
    static DUMMY: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    let hash = DUMMY.get_or_init(|| hash_password("dummy-password-for-timing").expect("hash"));
    let _ = verify_password(password, hash);
}

const COMMON: &[&str] = &[
    "password",
    "password1",
    "password123",
    "123456789012",
    "1234567890",
    "qwertyuiop",
    "qwerty123456",
    "iloveyou",
    "welcome123",
    "admin123456",
    "letmein12345",
    "lokmangal",
    "lokmangal123",
    "solapur",
    "india12345",
    "abcdefghijkl",
    "passw0rd",
    "p@ssw0rd",
    "changeme",
    "administrator",
    "1q2w3e4r5t6y",
    "aaaaaaaaaaaa",
    "111111111111",
];

/// Returns a human-readable reason when the password is not acceptable.
pub fn policy_problem(password: &str, email: &str) -> Option<&'static str> {
    let len = password.chars().count();
    if len < 12 {
        return Some("Use at least 12 characters.");
    }
    if len > 128 {
        return Some("Use at most 128 characters.");
    }
    let lower = password.to_lowercase();
    if COMMON
        .iter()
        .any(|c| lower == *c || (c.len() >= 8 && lower.starts_with(c) && len - c.len() <= 4))
    {
        return Some("This password is too common. Choose something harder to guess.");
    }
    if let Some((local, _)) = email.split_once('@')
        && local.len() >= 4
        && lower.contains(&local.to_lowercase())
    {
        return Some("Do not include your email address in the password.");
    }
    if password
        .chars()
        .collect::<std::collections::HashSet<_>>()
        .len()
        < 5
    {
        return Some("Use a greater variety of characters.");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_and_verify() {
        let h = hash_password("correct horse battery staple").unwrap();
        assert!(h.starts_with("$argon2id$"));
        assert!(verify_password("correct horse battery staple", &h));
        assert!(!verify_password("wrong", &h));
    }

    #[test]
    fn policy() {
        assert!(policy_problem("short", "a@b.in").is_some());
        assert!(policy_problem("password1234", "a@b.in").is_some());
        assert!(policy_problem("mahesh-secret-2026", "mahesh@lokmangal.in").is_some());
        assert!(policy_problem("granite river 47 lamps", "a@b.in").is_none());
    }
}
