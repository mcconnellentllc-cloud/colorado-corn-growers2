import { hmacHex, timingSafeEqual, uuid } from './crypto.js';
import { findMemberById, isoFromNow, nowIso } from './db.js';

export const COOKIE_NAME = 'ccga_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// The cookie value is "<session id>.<HMAC-SHA256(session id) under
// SESSION_SECRET>". Verifying the signature first means a forged or mangled
// cookie is rejected without ever reaching D1.
//
// NOTE ON SameSite=Lax: the browser only sends this cookie back if the Worker
// is served from a host that is same-site with the static pages — that is, a
// cologrowers.com subdomain such as board-api.cologrowers.com. A *.workers.dev
// hostname is cross-site and the cookie will be silently dropped on every
// fetch from the portal. See the README's custom-domain step.

function cookieAttributes(maxAgeSeconds) {
  return [
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

export async function createSession(env, memberId) {
  const id = uuid();
  const expiresAt = isoFromNow(SESSION_TTL_SECONDS);

  await env.DB.prepare(
    'INSERT INTO sessions (id, member_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(id, memberId, expiresAt, nowIso())
    .run();

  const signature = await hmacHex(env.SESSION_SECRET, id);
  return { id, expiresAt, cookieValue: `${id}.${signature}` };
}

export function sessionCookieHeader(cookieValue) {
  return `${COOKIE_NAME}=${cookieValue}; ${cookieAttributes(SESSION_TTL_SECONDS)}`;
}

export function clearedCookieHeader() {
  return `${COOKIE_NAME}=; ${cookieAttributes(0)}`;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/**
 * Resolve the caller's session, or null. Returns the member row alongside the
 * session id so callers can both authorize and audit.
 */
export async function getSession(env, request) {
  const raw = readCookie(request, COOKIE_NAME);
  if (!raw) return null;

  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;

  const id = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const expected = await hmacHex(env.SESSION_SECRET, id);
  if (!timingSafeEqual(signature, expected)) return null;

  const row = await env.DB.prepare('SELECT id, member_id, expires_at FROM sessions WHERE id = ?')
    .bind(id)
    .first();
  if (!row) return null;

  if (row.expires_at <= nowIso()) {
    await destroySession(env, id);
    return null;
  }

  const member = await findMemberById(env, row.member_id);
  if (!member || !member.is_active) return null;

  return { sessionId: row.id, member };
}

export async function destroySession(env, sessionId) {
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}
