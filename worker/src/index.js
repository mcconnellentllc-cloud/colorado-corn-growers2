// CCGA Board Vote Portal — Cloudflare Worker API.
//
// Serves the JSON API behind the static /board/ pages on cologrowers.com.
// Nothing here is served by GitHub Pages; this deploys independently.
//
// Endpoints:
//   POST /auth/request     email a single-use sign-in link
//   GET  /auth/verify      redeem a link, set the session cookie, redirect
//   GET  /me               current member + their own vote
//   POST /vote             cast or change a vote (until the deadline)
//   GET  /results          tally (members after close, admins any time)
//   POST /admin/send-all   broadcast a fresh link to every active member
//   POST /auth/logout      destroy the session

import { corsHeaders, preflight } from './lib/cors.js';
import { uuid } from './lib/crypto.js';
import {
  audit,
  clientIp,
  findActiveMemberByEmail,
  listActiveMembers,
  nowIso,
  normalizeEmail,
} from './lib/db.js';
import { sendSignInEmail, MOTION_TITLE } from './lib/email.js';
import { checkAuthRequestLimits, checkBroadcastCooldown } from './lib/ratelimit.js';
import {
  clearedCookieHeader,
  createSession,
  destroySession,
  getSession,
  sessionCookieHeader,
} from './lib/session.js';
import { issueToken, purgeExpiredTokens, redeemToken } from './lib/tokens.js';

const VALID_CHOICES = new Set(['for', 'against', 'abstain']);
const MAX_COMMENT_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function json(request, body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
      ...headers,
    },
  });
}

async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

/** The deadline, as a required environment value. Never hardcoded. */
function voteDeadline(env) {
  const iso = env.VOTE_DEADLINE;
  const ts = Date.parse(iso);
  if (!iso || Number.isNaN(ts)) {
    throw new Error('VOTE_DEADLINE is missing or not a valid ISO 8601 timestamp');
  }
  return { iso: new Date(ts).toISOString(), closed: Date.now() >= ts };
}

function siteOrigin(env) {
  return env.SITE_ORIGIN || 'https://www.cologrowers.com';
}

/** Base URL the magic link points at — this Worker's own public origin. */
function apiOrigin(env, request) {
  return env.API_ORIGIN || new URL(request.url).origin;
}

// ---------------------------------------------------------------------------
// POST /auth/request
// ---------------------------------------------------------------------------

async function handleAuthRequest(request, env) {
  const ip = clientIp(request);
  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);

  // Identical response in every branch below. Whether the address is on the
  // roster, inactive, rate-limited, or malformed must not be distinguishable
  // from the outside.
  const genericResponse = () =>
    json(request, {
      ok: true,
      message:
        'If that address belongs to an active CCGA board member, a sign-in link is on its way.',
    });

  if (!email || !email.includes('@')) {
    await audit(env, { actorEmail: email || null, action: 'auth.request.invalid', ip });
    return genericResponse();
  }

  const limits = await checkAuthRequestLimits(env, { email, ip });
  if (!limits.allowed) {
    await audit(env, {
      actorEmail: email,
      action: 'auth.request.rate_limited',
      detail: limits.reason,
      ip,
    });
    return genericResponse();
  }

  const member = await findActiveMemberByEmail(env, email);
  if (!member) {
    await audit(env, { actorEmail: email, action: 'auth.request.unknown_email', ip });
    return genericResponse();
  }

  const { iso: deadlineIso } = voteDeadline(env);
  const { token } = await issueToken(env, { email, ip });
  const link = `${apiOrigin(env, request)}/auth/verify?token=${encodeURIComponent(token)}`;

  const sent = await sendSignInEmail(env, {
    to: member.email,
    fullName: member.full_name,
    link,
    deadlineIso,
  });

  await audit(env, {
    actorEmail: email,
    action: sent.ok ? 'auth.request.sent' : 'auth.request.send_failed',
    detail: sent.ok ? sent.id : sent.error,
    ip,
  });

  return genericResponse();
}

// ---------------------------------------------------------------------------
// GET /auth/verify
// ---------------------------------------------------------------------------

function redirectToSite(env, path) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${siteOrigin(env)}${path}`, 'Cache-Control': 'no-store' },
  });
}

async function handleAuthVerify(request, env, ctx) {
  const ip = clientIp(request);
  const token = new URL(request.url).searchParams.get('token');

  if (!token) {
    await audit(env, { action: 'auth.verify.missing_token', ip });
    return redirectToSite(env, '/board/index.html?error=invalid_link');
  }

  const result = await redeemToken(env, token);
  if (!result.ok) {
    await audit(env, { action: 'auth.verify.failed', detail: result.reason, ip });
    const error = result.reason === 'expired' ? 'expired_link' : 'invalid_link';
    return redirectToSite(env, `/board/index.html?error=${error}`);
  }

  const member = await findActiveMemberByEmail(env, result.email);
  if (!member) {
    // The roster changed between the link being sent and clicked.
    await audit(env, {
      actorEmail: result.email,
      action: 'auth.verify.member_inactive',
      ip,
    });
    return redirectToSite(env, '/board/index.html?error=not_authorized');
  }

  const session = await createSession(env, member.id);
  await audit(env, { actorEmail: member.email, action: 'auth.verify.success', ip });

  ctx.waitUntil(purgeExpiredTokens(env).catch(() => {}));

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${siteOrigin(env)}/board/portal.html`,
      'Set-Cookie': sessionCookieHeader(session.cookieValue),
      'Cache-Control': 'no-store',
    },
  });
}

// ---------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------

async function handleMe(request, env) {
  const session = await getSession(env, request);
  if (!session) return json(request, { error: 'unauthenticated' }, { status: 401 });

  const { member } = session;
  const { iso: deadlineIso, closed } = voteDeadline(env);

  const vote = await env.DB.prepare(
    'SELECT choice, comment, created_at, updated_at FROM votes WHERE member_id = ?',
  )
    .bind(member.id)
    .first();

  return json(request, {
    member: {
      full_name: member.full_name,
      email: member.email,
      role: member.role,
      is_admin: Boolean(member.is_admin),
    },
    motion_title: MOTION_TITLE,
    deadline: deadlineIso,
    voting_closed: closed,
    vote: vote
      ? {
          choice: vote.choice,
          comment: vote.comment ?? '',
          recorded_at: vote.updated_at || vote.created_at,
        }
      : null,
  });
}

// ---------------------------------------------------------------------------
// POST /vote
// ---------------------------------------------------------------------------

async function handleVote(request, env) {
  const ip = clientIp(request);
  const session = await getSession(env, request);
  if (!session) return json(request, { error: 'unauthenticated' }, { status: 401 });

  const { member } = session;
  const { iso: deadlineIso, closed } = voteDeadline(env);

  if (closed) {
    await audit(env, {
      actorEmail: member.email,
      action: 'vote.rejected_after_deadline',
      ip,
    });
    return json(
      request,
      { error: 'voting_closed', deadline: deadlineIso },
      { status: 403 },
    );
  }

  const body = await readJsonBody(request);
  const choice = String(body.choice ?? '').trim().toLowerCase();
  const comment = String(body.comment ?? '').trim();

  if (!VALID_CHOICES.has(choice)) {
    return json(request, { error: 'invalid_choice' }, { status: 400 });
  }
  if (comment.length > MAX_COMMENT_LENGTH) {
    return json(
      request,
      { error: 'comment_too_long', max: MAX_COMMENT_LENGTH },
      { status: 400 },
    );
  }

  const timestamp = nowIso();

  // One row per member, enforced by the UNIQUE constraint on member_id; a
  // second vote updates the first rather than adding to the tally.
  await env.DB.prepare(
    `INSERT INTO votes (id, member_id, choice, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(member_id) DO UPDATE SET
       choice     = excluded.choice,
       comment    = excluded.comment,
       updated_at = excluded.updated_at`,
  )
    .bind(uuid(), member.id, choice, comment || null, timestamp, timestamp)
    .run();

  await audit(env, {
    actorEmail: member.email,
    action: 'vote.recorded',
    detail: `choice=${choice}; comment_chars=${comment.length}`,
    ip,
  });

  return json(request, {
    ok: true,
    vote: { choice, comment, recorded_at: timestamp },
  });
}

// ---------------------------------------------------------------------------
// GET /results
// ---------------------------------------------------------------------------

async function handleResults(request, env) {
  const session = await getSession(env, request);
  if (!session) return json(request, { error: 'unauthenticated' }, { status: 401 });

  const { member } = session;
  const { iso: deadlineIso, closed } = voteDeadline(env);
  const isAdmin = Boolean(member.is_admin);

  // Members see the tally only once voting has closed. Admins see it any time.
  if (!closed && !isAdmin) {
    return json(
      request,
      { error: 'results_not_available', deadline: deadlineIso, voting_closed: false },
      { status: 403 },
    );
  }

  const { results } = await env.DB.prepare(
    'SELECT choice, COUNT(*) AS n FROM votes GROUP BY choice',
  ).all();

  const tally = { for: 0, against: 0, abstain: 0 };
  for (const row of results ?? []) {
    if (row.choice in tally) tally[row.choice] = row.n;
  }

  const eligible = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM members WHERE is_active = 1',
  ).first();

  const cast = tally.for + tally.against + tally.abstain;

  return json(request, {
    motion_title: MOTION_TITLE,
    deadline: deadlineIso,
    voting_closed: closed,
    viewed_as_admin: isAdmin && !closed,
    tally,
    votes_cast: cast,
    eligible_members: eligible?.n ?? 0,
    not_yet_voted: Math.max(0, (eligible?.n ?? 0) - cast),
  });
}

// ---------------------------------------------------------------------------
// POST /admin/send-all
// ---------------------------------------------------------------------------

async function handleAdminSendAll(request, env) {
  const ip = clientIp(request);
  const session = await getSession(env, request);
  if (!session) return json(request, { error: 'unauthenticated' }, { status: 401 });

  const { member } = session;
  if (!member.is_admin) {
    await audit(env, { actorEmail: member.email, action: 'admin.send_all.forbidden', ip });
    return json(request, { error: 'forbidden' }, { status: 403 });
  }

  const cooldown = await checkBroadcastCooldown(env);
  if (!cooldown.allowed) {
    await audit(env, {
      actorEmail: member.email,
      action: 'admin.send_all.rate_limited',
      detail: `retry_after_seconds=${cooldown.retryAfterSeconds}`,
      ip,
    });
    return json(
      request,
      { error: 'rate_limited', retry_after_seconds: cooldown.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(cooldown.retryAfterSeconds) } },
    );
  }

  const { iso: deadlineIso } = voteDeadline(env);
  const recipients = await listActiveMembers(env);

  // Record the broadcast before sending so a slow or partly-failed run still
  // consumes the 15-minute cooldown and cannot be replayed by a double click.
  await audit(env, {
    actorEmail: member.email,
    action: 'admin.send_all',
    detail: `recipients=${recipients.length}`,
    ip,
  });

  const sends = [];
  for (const recipient of recipients) {
    const { token } = await issueToken(env, { email: recipient.email, ip });
    const link = `${apiOrigin(env, request)}/auth/verify?token=${encodeURIComponent(token)}`;

    const sent = await sendSignInEmail(env, {
      to: recipient.email,
      fullName: recipient.full_name,
      link,
      deadlineIso,
    });

    sends.push({
      email: recipient.email,
      full_name: recipient.full_name,
      status: sent.ok ? 'sent' : 'failed',
      error: sent.ok ? null : sent.error,
    });

    await audit(env, {
      actorEmail: member.email,
      action: sent.ok ? 'admin.send_all.sent' : 'admin.send_all.failed',
      detail: `to=${recipient.email}; ${sent.ok ? sent.id : sent.error}`,
      ip,
    });
  }

  const sentCount = sends.filter((s) => s.status === 'sent').length;

  return json(request, {
    ok: true,
    total: sends.length,
    sent: sentCount,
    failed: sends.length - sentCount,
    results: sends,
  });
}

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

async function handleLogout(request, env) {
  const ip = clientIp(request);
  const session = await getSession(env, request);

  if (session) {
    await destroySession(env, session.sessionId);
    await audit(env, { actorEmail: session.member.email, action: 'auth.logout', ip });
  }

  return json(request, { ok: true }, { headers: { 'Set-Cookie': clearedCookieHeader() } });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const ROUTES = [
  ['POST', '/auth/request', handleAuthRequest],
  ['GET', '/auth/verify', handleAuthVerify],
  ['POST', '/auth/logout', handleLogout],
  ['GET', '/me', handleMe],
  ['POST', '/vote', handleVote],
  ['GET', '/results', handleResults],
  ['POST', '/admin/send-all', handleAdminSendAll],
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return preflight(request);

    if (path === '/' || path === '/health') {
      return json(request, { ok: true, service: 'ccga-board-vote', time: nowIso() });
    }

    const route = ROUTES.find(([method, routePath]) => routePath === path && method === request.method);

    if (!route) {
      const pathExists = ROUTES.some(([, routePath]) => routePath === path);
      return json(
        request,
        { error: pathExists ? 'method_not_allowed' : 'not_found' },
        { status: pathExists ? 405 : 404 },
      );
    }

    try {
      return await route[2](request, env, ctx);
    } catch (err) {
      console.error(`${request.method} ${path} failed`, err);
      return json(request, { error: 'server_error' }, { status: 500 });
    }
  },
};
