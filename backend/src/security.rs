//! Tokens, keyed hashing and at-rest encryption.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chacha20poly1305::{
    ChaCha20Poly1305, Key, Nonce,
    aead::{Aead, KeyInit},
};
use hmac::{Hmac, Mac};
use rand::{RngCore, rngs::OsRng};
use sha2::{Digest, Sha256};

/// A random URL-safe token with `bytes` bytes of entropy.
pub fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    OsRng.fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

/// Tokens are stored only as HMAC-SHA256(server key, token), so a database leak does not reveal them.
pub fn hash_token(key: &[u8], token: &str) -> Vec<u8> {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(token.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Encrypts with ChaCha20-Poly1305; output is nonce (12 bytes) || ciphertext.
pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> anyhow::Result<Vec<u8>> {
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext)
        .map_err(|_| anyhow::anyhow!("encryption failed"))?;
    let mut out = nonce.to_vec();
    out.extend(ct);
    Ok(out)
}

pub fn decrypt(key: &[u8; 32], data: &[u8]) -> anyhow::Result<Vec<u8>> {
    if data.len() < 13 {
        anyhow::bail!("ciphertext too short");
    }
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(&data[..12]), &data[12..])
        .map_err(|_| anyhow::anyhow!("decryption failed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encryption_round_trips_and_detects_tampering() {
        let key = [9u8; 32];
        let mut sealed = encrypt(&key, b"JBSWY3DPEHPK3PXP").unwrap();
        assert_eq!(decrypt(&key, &sealed).unwrap(), b"JBSWY3DPEHPK3PXP");
        let last = sealed.len() - 1;
        sealed[last] ^= 1;
        assert!(decrypt(&key, &sealed).is_err());
    }

    #[test]
    fn token_hash_depends_on_key() {
        assert_ne!(hash_token(b"a", "t"), hash_token(b"b", "t"));
        assert_eq!(hash_token(b"a", "t"), hash_token(b"a", "t"));
        assert_eq!(random_token(32).len(), 43);
    }
}
