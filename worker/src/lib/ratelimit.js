import { isoFromNow } from './db.js';

// Rate limits for POST /auth/request. Counted straight off the tokens table,
// so there is no extra store to keep in sync: every issued token is one
// request, and both windows are rolling.

export const EMAIL_LIMIT_PER_HOUR = 3;
export const IP_LIMIT_PER_HOUR = 20;

/**
 * Returns { allowed, reason } for a sign-in-link request. Checked before a
 * token is minted, and — importantly — the result never changes the response
 * the caller sees, only whether an email actually goes out.
 */
export async function checkAuthRequestLimits(env, { email, ip }) {
  const windowStart = isoFromNow(-3600);

  const byEmail = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM tokens WHERE email = ? AND created_at >= ?',
  )
    .bind(email, windowStart)
    .first();

  if ((byEmail?.n ?? 0) >= EMAIL_LIMIT_PER_HOUR) {
    return { allowed: false, reason: 'email_hourly_limit' };
  }

  const byIp = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM tokens WHERE created_ip = ? AND created_at >= ?',
  )
    .bind(ip, windowStart)
    .first();

  if ((byIp?.n ?? 0) >= IP_LIMIT_PER_HOUR) {
    return { allowed: false, reason: 'ip_hourly_limit' };
  }

  return { allowed: true, reason: null };
}

// One broadcast per 15 minutes, counted off audit_log rather than a
// dedicated table.
export const BROADCAST_COOLDOWN_SECONDS = 15 * 60;

export async function checkBroadcastCooldown(env) {
  const windowStart = isoFromNow(-BROADCAST_COOLDOWN_SECONDS);
  const row = await env.DB.prepare(
    "SELECT created_at FROM audit_log WHERE action = 'admin.send_all' AND created_at >= ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(windowStart)
    .first();

  if (!row) return { allowed: true, retryAfterSeconds: 0 };

  const elapsed = Math.floor((Date.now() - Date.parse(row.created_at)) / 1000);
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, BROADCAST_COOLDOWN_SECONDS - elapsed),
  };
}
