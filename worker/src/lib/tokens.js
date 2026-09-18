import { randomToken, sha256Hex, timingSafeEqual, uuid } from './crypto.js';
import { isoFromNow, nowIso } from './db.js';

export const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// A magic-link token is "<row id>.<32 random bytes, base64url>".
//
// Splitting it this way is what makes the hash comparison genuinely
// constant-time: the row is fetched by its non-secret id, and only then is the
// stored SHA-256 compared against the hash of the presented secret with a
// constant-time compare. Looking a row up *by* its hash would push the
// comparison into SQLite's index, where we control nothing about its timing.
//
// Only the hash is ever persisted. The raw secret exists in the emailed URL
// and nowhere else.

export async function issueToken(env, { email, ip }) {
  const id = uuid();
  const secret = randomToken(32);
  const tokenHash = await sha256Hex(secret);
  const expiresAt = isoFromNow(TOKEN_TTL_SECONDS);

  await env.DB.prepare(
    'INSERT INTO tokens (id, email, token_hash, expires_at, used_at, created_ip, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)',
  )
    .bind(id, email, tokenHash, expiresAt, ip, nowIso())
    .run();

  return { token: `${id}.${secret}`, expiresAt };
}

/**
 * Redeem a token. Returns { ok, email } or { ok: false, reason }.
 * Marks the row used in the same statement that checks it is unused, so two
 * simultaneous clicks on one link cannot both succeed.
 */
export async function redeemToken(env, rawToken) {
  const value = String(rawToken ?? '');
  const dot = value.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };

  const id = value.slice(0, dot);
  const secret = value.slice(dot + 1);

  const row = await env.DB.prepare(
    'SELECT id, email, token_hash, expires_at, used_at FROM tokens WHERE id = ?',
  )
    .bind(id)
    .first();
  if (!row) return { ok: false, reason: 'not_found' };

  const presentedHash = await sha256Hex(secret);
  if (!timingSafeEqual(presentedHash, row.token_hash)) {
    return { ok: false, reason: 'bad_token' };
  }

  if (row.used_at) return { ok: false, reason: 'already_used' };
  if (row.expires_at <= nowIso()) return { ok: false, reason: 'expired' };

  // Conditional update: only the first redemption flips used_at from NULL.
  const result = await env.DB.prepare(
    'UPDATE tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
  )
    .bind(nowIso(), id)
    .run();

  if (!result.meta || result.meta.changes !== 1) {
    return { ok: false, reason: 'already_used' };
  }

  return { ok: true, email: row.email };
}

/** Housekeeping: drop tokens that are long past use. Called opportunistically. */
export async function purgeExpiredTokens(env) {
  await env.DB.prepare('DELETE FROM tokens WHERE expires_at < ?')
    .bind(isoFromNow(-7 * 24 * 60 * 60))
    .run();
}
