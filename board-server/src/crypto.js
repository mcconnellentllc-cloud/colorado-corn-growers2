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
