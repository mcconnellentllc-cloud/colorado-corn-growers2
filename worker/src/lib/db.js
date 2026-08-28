import { uuid } from './crypto.js';

/** Current time as an ISO 8601 UTC string, matching the schema's format. */
export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** ISO 8601 UTC string `seconds` from now. */
export function isoFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** The caller's IP, as reported by Cloudflare's edge. */
export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

export async function findActiveMemberByEmail(env, email) {
  return env.DB.prepare(
    'SELECT id, email, full_name, role, is_admin, is_active FROM members WHERE email = ? AND is_active = 1',
  )
    .bind(email)
    .first();
}

export async function findMemberById(env, id) {
  return env.DB.prepare(
    'SELECT id, email, full_name, role, is_admin, is_active FROM members WHERE id = ?',
  )
    .bind(id)
    .first();
}

export async function listActiveMembers(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, email, full_name, role, is_admin, is_active FROM members WHERE is_active = 1 ORDER BY full_name',
  ).all();
  return results ?? [];
}

/**
 * Append to audit_log. Never throws into the request path — an audit write
 * failing must not take down a sign-in, but it is logged to the Worker tail.
 */
export async function audit(env, { actorEmail = null, action, detail = null, ip = null }) {
  try {
    await env.DB.prepare(
      'INSERT INTO audit_log (id, actor_email, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(uuid(), actorEmail, action, detail ? String(detail).slice(0, 2000) : null, ip, nowIso())
      .run();
  } catch (err) {
    console.error('audit_log write failed', action, err);
  }
}
