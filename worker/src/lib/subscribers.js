// Public mailing list: sign-up, double opt-in confirmation, unsubscribe.
//
// This is deliberately separate from the board roster in `members`. Nothing in
// here grants access to anything — a subscriber is an address that has asked
// to hear from us and can stop at any time.
//
// Two rules shape the whole file:
//
//   1. Nobody is mailable until they click. A sign-up writes a 'pending' row
//      and sends exactly one confirmation message. Only the click moves the
//      row to 'active'. This is double opt-in, and it is the difference
//      between a list that reaches inboxes and one that reaches spam folders.
//
//   2. Sign-up never reveals whether an address is already on the list. The
//      response is identical either way, the same way /auth/request is.

import { randomToken, sha256Hex, timingSafeEqual, uuid, hmacHex } from './crypto.js';
import { isoFromNow, nowIso, normalizeEmail } from './db.js';

export const CONFIRM_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// A sign-up is cheap to fake, so both windows are tighter than the board's.
export const SIGNUP_LIMIT_PER_IP_PER_HOUR = 10;

/** Rough shape check. Real validation is the confirmation email arriving. */
export function looksLikeEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export async function checkSignupLimit(env, ip) {
  const windowStart = isoFromNow(-3600);
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM subscribers WHERE created_ip = ? AND created_at >= ?',
  )
    .bind(ip, windowStart)
    .first();
  return (row?.n ?? 0) < SIGNUP_LIMIT_PER_IP_PER_HOUR;
}

export async function findSubscriberByEmail(env, email) {
  return env.DB.prepare('SELECT * FROM subscribers WHERE email = ?').bind(email).first();
}

/**
 * Start a sign-up. Returns { confirmToken } when a confirmation email should
 * go out, or { confirmToken: null } when it should not — already active, or
 * asked again too soon. The caller's response must not differ between them.
 */
export async function startSignup(env, { email, fullName, source, ip }) {
  const address = normalizeEmail(email);
  const existing = await findSubscriberByEmail(env, address);

  // Already confirmed: say nothing, send nothing. Re-confirming an active
  // subscriber on demand would let anyone mailbomb a known address.
  if (existing && existing.status === 'active') return { confirmToken: null };

  const secret = randomToken(32);
  const confirmHash = await sha256Hex(secret);
  const expires = isoFromNow(CONFIRM_TTL_SECONDS);
  const now = nowIso();

  if (existing) {
    // Pending or previously unsubscribed: re-open the same row. An
    // unsubscribed address coming back through the front door is a new opt-in,
    // so it goes back to 'pending' and must click again.
    await env.DB.prepare(
      `UPDATE subscribers
          SET status = 'pending', confirm_hash = ?, confirm_expires = ?,
              full_name = COALESCE(?, full_name), source = COALESCE(?, source),
              created_at = ?, created_ip = ?, unsubscribed_at = NULL
        WHERE id = ?`,
    )
      .bind(confirmHash, expires, fullName || null, source || null, now, ip, existing.id)
      .run();
    return { confirmToken: `${existing.id}.${secret}` };
  }

  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO subscribers
       (id, email, full_name, status, confirm_hash, confirm_expires, unsub_secret,
        source, created_at, created_ip, confirmed_at, unsubscribed_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, NULL, NULL)`,
  )
    .bind(id, address, fullName || null, confirmHash, expires, randomToken(24), source || null, now, ip)
    .run();

  return { confirmToken: `${id}.${secret}` };
}

/**
 * Complete a sign-up. Same split-token shape as the magic link: look the row
 * up by its non-secret id, then compare hashes in constant time.
 */
export async function confirmSignup(env, rawToken) {
  const value = String(rawToken ?? '');
  const dot = value.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };

  const id = value.slice(0, dot);
  const secret = value.slice(dot + 1);

  const row = await env.DB.prepare('SELECT * FROM subscribers WHERE id = ?').bind(id).first();
  if (!row || !row.confirm_hash) return { ok: false, reason: 'not_found' };

  const presented = await sha256Hex(secret);
  if (!timingSafeEqual(presented, row.confirm_hash)) return { ok: false, reason: 'mismatch' };

  // An already-active row clicking its old link again is a success, not an
  // error. People forward these to themselves and click twice.
  if (row.status === 'active') return { ok: true, email: row.email, already: true };

  if (row.confirm_expires && Date.parse(row.confirm_expires) <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  await env.DB.prepare(
    `UPDATE subscribers
        SET status = 'active', confirmed_at = ?, confirm_hash = NULL, confirm_expires = NULL
      WHERE id = ? AND status = 'pending'`,
  )
    .bind(nowIso(), id)
    .run();

  return { ok: true, email: row.email, already: false };
}

/** The signed value that makes an unsubscribe link work without a login. */
export async function unsubSignature(env, row) {
  return hmacHex(env.SESSION_SECRET, `unsub:${row.id}:${row.unsub_secret}`);
}

export async function unsubscribeLink(env, row) {
  const sig = await unsubSignature(env, row);
  return `${env.API_ORIGIN}/list/unsubscribe?id=${encodeURIComponent(row.id)}&sig=${sig}`;
}

/**
 * Unsubscribe. Idempotent: an address that is already off the list is a
 * success, because the person asked to be off the list and they are.
 */
export async function unsubscribe(env, { id, sig }) {
  const row = await env.DB.prepare('SELECT * FROM subscribers WHERE id = ?').bind(id).first();
  if (!row) return { ok: false, reason: 'not_found' };

  const expected = await unsubSignature(env, row);
  if (!timingSafeEqual(String(sig ?? ''), expected)) return { ok: false, reason: 'bad_signature' };

  if (row.status !== 'unsubscribed') {
    await env.DB.prepare(
      `UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE id = ?`,
    )
      .bind(nowIso(), id)
      .run();
  }

  return { ok: true, email: row.email };
}

export async function activeSubscribers(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, email, full_name, unsub_secret FROM subscribers WHERE status = 'active' ORDER BY created_at`,
  ).all();
  return results ?? [];
}

export async function listStats(env) {
  const { results } = await env.DB.prepare(
    'SELECT status, COUNT(*) AS n FROM subscribers GROUP BY status',
  ).all();
  const out = { pending: 0, active: 0, unsubscribed: 0 };
  for (const row of results ?? []) out[row.status] = row.n;
  return out;
}
