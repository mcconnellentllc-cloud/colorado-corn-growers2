// Cryptographic helpers, on Node's built-in crypto. Same design as the Worker's
// WebCrypto version, so the auth behaviour is identical.
import { randomBytes, createHash, createHmac, timingSafeEqual as nodeTimingSafeEqual, randomUUID } from 'node:crypto';

/** Random bytes as a URL-safe base64 string (no padding). */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/** Hex SHA-256 of a UTF-8 string. */
export function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

/** Hex HMAC-SHA-256 of `message` under `secret`. */
export function hmacHex(secret, message) {
  return createHmac('sha256', String(secret)).update(String(message), 'utf8').digest('hex');
}

/**
 * Constant-time string compare. Equal-length hex/base64 digests only; a length
 * mismatch returns false without leaking which side differed.
 */
export function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length) return false;
  return nodeTimingSafeEqual(ab, bb);
}

export function uuid() {
  return randomUUID();
}

/* ---- passwords (scrypt) ---- */

import { scryptSync } from 'node:crypto';

/** Hash a password with a random salt. Format: s1.<saltB64>.<hashB64> */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64);
  return 's1.' + salt.toString('base64') + '.' + hash.toString('base64');
}

/** Verify a password against a stored hash, in constant time. */
export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [v, saltB64, hashB64] = String(stored).split('.');
  if (v !== 's1' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(String(password), Buffer.from(saltB64, 'base64'), 64);
  return actual.length === expected.length && nodeTimingSafeEqual(actual, expected);
}
