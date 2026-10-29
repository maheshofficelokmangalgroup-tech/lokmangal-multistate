//! TOTP (RFC 6238: SHA-1, 6 digits, 30 s) with replay protection, plus one-time recovery codes.

use rand::{Rng, RngCore, rngs::OsRng};
use totp_rs::{Algorithm, TOTP};

use crate::security::hash_token;

pub const STEP: u64 = 30;

pub fn new_secret() -> Vec<u8> {
    let mut s = vec![0u8; 20];
    OsRng.fill_bytes(&mut s);
    s
}

/// RFC 4648 base32 without padding, as authenticator apps expect.
pub fn base32(data: &[u8]) -> String {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut out = String::new();
    let mut buffer: u32 = 0;
    let mut bits = 0;
    for &b in data {
        buffer = (buffer << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            out.push(ALPHABET[((buffer >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        out.push(ALPHABET[((buffer << (5 - bits)) & 31) as usize] as char);
    }
    out
}

pub fn otpauth_url(secret: &[u8], account: &str) -> String {
    let issuer = "Lokmangal Admin";
    let enc = |s: &str| {
        url::form_urlencoded::byte_serialize(s.as_bytes())
            .collect::<String>()
            .replace('+', "%20")
    };
    format!(
        "otpauth://totp/{}:{}?secret={}&issuer={}&algorithm=SHA1&digits=6&period=30",
        enc(issuer),
        enc(account),
        base32(secret),
        enc(issuer)
    )
}

fn totp(secret: &[u8]) -> anyhow::Result<TOTP> {
    TOTP::new(Algorithm::SHA1, 6, 1, STEP, secret.to_vec())
        .map_err(|e| anyhow::anyhow!("invalid TOTP secret: {e:?}"))
}

/// Verifies `code` for `now` (±1 step). Returns the matched step, which must be stored and is never
/// accepted again (replay protection).
pub fn verify(
    secret: &[u8],
    code: &str,
    now_unix: u64,
    last_step: Option<i64>,
) -> anyhow::Result<Option<i64>> {
    let code: String = code.chars().filter(|c| !c.is_whitespace()).collect();
    if code.len() != 6 || !code.chars().all(|c| c.is_ascii_digit()) {
        return Ok(None);
    }
    let t = totp(secret)?;
    let current = (now_unix / STEP) as i64;
    for step in [current - 1, current, current + 1] {
        if last_step.is_some_and(|l| step <= l) {
            continue;
        }
        if t.generate(step as u64 * STEP) == code {
            return Ok(Some(step));
        }
    }
    Ok(None)
}

const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/// Ten codes like "K7QD-M2XA"; shown once, stored only as keyed hashes.
pub fn new_recovery_codes() -> Vec<String> {
    (0..10)
        .map(|_| {
            let chars: String = (0..8)
                .map(|_| CODE_ALPHABET[OsRng.gen_range(0..CODE_ALPHABET.len())] as char)
                .collect();
            format!("{}-{}", &chars[..4], &chars[4..])
        })
        .collect()
}

pub fn normalize_recovery_code(code: &str) -> String {
    code.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

pub fn recovery_code_hash(key: &[u8], code: &str) -> String {
    hex::encode(hash_token(
        key,
        &format!("recovery:{}", normalize_recovery_code(code)),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base32_matches_rfc4648() {
        assert_eq!(base32(b"foobar"), "MZXW6YTBOI");
        assert_eq!(base32(b"f"), "MY");
    }

    #[test]
    fn totp_verifies_once() {
        let secret = new_secret();
        let now = 1_800_000_000u64;
        let code = totp(&secret).unwrap().generate(now);
        let step = verify(&secret, &code, now, None).unwrap().expect("valid");
        assert_eq!(
            verify(&secret, &code, now, Some(step)).unwrap(),
            None,
            "replay rejected"
        );
        assert_eq!(
            verify(&secret, "000000", now, None).unwrap().is_some(),
            code == "000000"
        );
        assert!(verify(&secret, "12ab56", now, None).unwrap().is_none());
    }

    #[test]
    fn recovery_codes_normalise() {
        let codes = new_recovery_codes();
        assert_eq!(codes.len(), 10);
        let k = b"key";
        assert_eq!(
            recovery_code_hash(k, &codes[0]),
            recovery_code_hash(k, &codes[0].to_lowercase().replace('-', " "))
        );
    }
}
