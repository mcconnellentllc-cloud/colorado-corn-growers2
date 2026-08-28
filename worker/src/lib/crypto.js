// Cryptographic helpers built on the WebCrypto API available in Workers.

const encoder = new TextEncoder();

/** Random bytes as a URL-safe base64 string (no padding). */
export function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export function base64url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Hex SHA-256 of a UTF-8 string. */
export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compare two strings in time proportional to their length only — the number
 * of matching characters must not affect how long this takes. Used for token
 * hashes and cookie signatures.
 */
export function timingSafeEqual(a, b) {
  const aBytes = encoder.encode(String(a));
  const bBytes = encoder.encode(String(b));
  // Length is not secret (both sides are fixed-width hex/base64 digests), but
  // returning early on a mismatch would still leak nothing useful. Keep the
  // loop over a constant width so the comparison itself has no early exit.
  let diff = aBytes.length ^ bBytes.length;
  const width = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < width; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/** Hex HMAC-SHA-256 of `message` under `secret`. */
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function uuid() {
  return crypto.randomUUID();
}
