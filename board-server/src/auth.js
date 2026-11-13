// Magic-link auth + server-side sessions. Ported from the Worker, same guarantees:
//   - only the token hash is stored; the raw secret lives in the emailed link
//   - tokens are single-use (conditional UPDATE) and expire in 24h
//   - the session cookie is "<id>.<HMAC(id)>", verified before the table is read
import { randomToken, sha256Hex, hmacHex, timingSafeEqual, uuid } from './crypto.js';
import { nowIso, isoFromNow, findMemberById } from './db.js';

export const COOKIE_NAME = 'ccga_board_session';
export const TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

// Rate limits, counted off the tokens table (rolling window).
const PER_EMAIL_PER_HOUR = 3;
const PER_IP_PER_HOUR = 20;

export function tooManyRequests(db, { email, ip }) {
  const since = isoFromNow(-60 * 60);
  const byEmail = db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE email = ? AND created_at > ?')
    .get(email, since).n;
  if (byEmail >= PER_EMAIL_PER_HOUR) return true;
  if (ip) {
    const byIp = db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE created_ip = ? AND created_at > ?')
      .get(ip, since).n;
    if (byIp >= PER_IP_PER_HOUR) return true;
  }
  return false;
}

export function issueToken(db, { email, ip }) {
  const id = uuid();
  const secret = randomToken(32);
  const tokenHash = sha256Hex(secret);
  const expiresAt = isoFromNow(TOKEN_TTL_SECONDS);
  db.prepare('INSERT INTO tokens (id, email, token_hash, expires_at, used_at, created_ip, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)')
    .run(id, email, tokenHash, expiresAt, ip ?? null, nowIso());
  return { token: `${id}.${secret}`, expiresAt };
}

export function redeemToken(db, rawToken) {
  const value = String(rawToken ?? '');
  const dot = value.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };
  const id = value.slice(0, dot);
  const secret = value.slice(dot + 1);

  const row = db.prepare('SELECT id, email, token_hash, expires_at, used_at FROM tokens WHERE id = ?').get(id);
  if (!row) return { ok: false, reason: 'not_found' };
  if (!timingSafeEqual(sha256Hex(secret), row.token_hash)) return { ok: false, reason: 'bad_token' };
  if (row.used_at) return { ok: false, reason: 'already_used' };
  if (row.expires_at <= nowIso()) return { ok: false, reason: 'expired' };

  // Only the first redemption flips used_at from NULL.
  const res = db.prepare('UPDATE tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').run(nowIso(), id);
  if (res.changes !== 1) return { ok: false, reason: 'already_used' };
  return { ok: true, email: row.email };
}

export function purgeExpiredTokens(db) {
  db.prepare('DELETE FROM tokens WHERE expires_at < ?').run(isoFromNow(-7 * 24 * 60 * 60));
}

/* ---- sessions ---- */

export function createSession(db, secret, memberId) {
  const id = uuid();
  const expiresAt = isoFromNow(SESSION_TTL_SECONDS);
  db.prepare('INSERT INTO sessions (id, member_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(id, memberId, expiresAt, nowIso());
  return { id, expiresAt, cookieValue: `${id}.${hmacHex(secret, id)}` };
}

export function getSession(db, secret, cookieValue) {
  const raw = String(cookieValue ?? '');
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!timingSafeEqual(sig, hmacHex(secret, id))) return null;

  const row = db.prepare('SELECT id, member_id, expires_at FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  if (row.expires_at <= nowIso()) {
    destroySession(db, id);
    return null;
  }
  const member = findMemberById(db, row.member_id);
  if (!member || !member.is_active) return null;
  return { sessionId: row.id, member };
}

export function destroySession(db, sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function cookieHeader(value, maxAgeSeconds, secure) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure) attrs.push('Secure');
  return `${COOKIE_NAME}=${value}; ${attrs.join('; ')}`;
}

export function readCookie(cookieString, name) {
  if (!cookieString) return null;
  for (const part of cookieString.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
