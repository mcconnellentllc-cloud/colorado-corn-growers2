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
//
// Mailing list (public, no session):
//   POST /list/subscribe        start a sign-up, send one confirmation email
//   GET  /list/confirm          complete a double opt-in sign-up
//   GET  /list/unsubscribe      one-click unsubscribe from a signed link
//   POST /list/unsubscribe      same, for List-Unsubscribe-Post one-click
//
// Mailing list (admin session required):
//   GET  /admin/list/stats      counts by status
//   GET  /admin/mailings        every draft and sent mailing
//   GET  /admin/mailings/get    one mailing, including its bodies
//   POST /admin/mailings        create a draft
//   POST /admin/mailings/save   edit a draft that has not been sent
//   POST /admin/mailings/test   send one copy to the signed-in admin
//   POST /admin/mailings/send   send a draft to the active list
//   POST /admin/mailings/resend retry only the addresses that failed

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
import { sendSignInEmail, sendConfirmEmail, sendCampaignEmail, MOTION_TITLE } from './lib/email.js';
import {
  activeSubscribers,
  checkSignupLimit,
  confirmSignup,
  listStats,
  looksLikeEmail,
  startSignup,
  unsubscribe,
  unsubscribeLink,
} from './lib/subscribers.js';
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

// ---------------------------------------------------------------------------
// Mailing list — public
// ---------------------------------------------------------------------------

/** A short HTML page, for the links people click from an email client. */
function page(title, heading, body) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - Colorado Corn Growers</title>
<style>body{margin:0;padding:48px 20px;background:#f5f3ee;color:#37342f;
font-family:Georgia,'Times New Roman',serif;line-height:1.6}
.card{max-width:540px;margin:0 auto;background:#fff;border:1px solid #e3ded4;
border-radius:8px;padding:36px}h1{margin:0 0 16px;font-weight:400;color:#334539;font-size:1.6rem}
p{margin:0 0 14px}a{color:#8a6a22}
.foot{max-width:540px;margin:18px auto 0;font-family:Arial,sans-serif;font-size:12px;color:#5b564f}
</style></head><body><div class="card"><h1>${heading}</h1>${body}</div>
<div class="foot">Colorado Corn Growers Association &middot; PO Box 340, Burlington, CO 80807</div>
</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

async function handleListSubscribe(request, env, ctx) {
  const ip = clientIp(request);
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const fullName = String(body.full_name ?? '').trim().slice(0, 120) || null;
  const source = String(body.source ?? '').trim().slice(0, 60) || null;

  if (!looksLikeEmail(email)) {
    return json(request, { error: 'invalid_email' }, { status: 400 });
  }

  // Everything below returns the same body. A sign-up form must never become a
  // way to ask whether an address is already on the list.
  const ok = json(request, { ok: true });

  if (!(await checkSignupLimit(env, ip))) return ok;

  const { confirmToken } = await startSignup(env, { email, fullName, source, ip });
  if (!confirmToken) return ok;

  const link = `${env.API_ORIGIN}/list/confirm?token=${encodeURIComponent(confirmToken)}`;
  const send = sendConfirmEmail(env, { to: email, fullName, link });
  if (ctx?.waitUntil) ctx.waitUntil(send);
  else await send;

  await audit(env, { actorEmail: email, action: 'list.signup', ip });
  return ok;
}

async function handleListConfirm(request, env) {
  const url = new URL(request.url);
  const result = await confirmSignup(env, url.searchParams.get('token'));

  if (!result.ok) {
    return page(
      'Link not valid',
      'That link did not work',
      `<p>It may have expired, or already been replaced by a newer one.</p>
       <p><a href="${env.SITE_ORIGIN}/Pages/announcements.html">Sign up again</a> and we will send a fresh confirmation.</p>`,
    );
  }

  await audit(env, { actorEmail: result.email, action: 'list.confirm' });
  return page(
    'Confirmed',
    result.already ? 'You are already on the list' : 'You are on the list',
    `<p>We will send deadlines, program changes and what we are working on. Not often, and never
        anything we would not want to read ourselves.</p>
     <p>Every message carries an unsubscribe link, and it works.</p>
     <p><a href="${env.SITE_ORIGIN}/index.html">Back to cologrowers.com</a></p>`,
  );
}

async function handleListUnsubscribe(request, env) {
  const url = new URL(request.url);
  let id = url.searchParams.get('id');
  let sig = url.searchParams.get('sig');

  // One-click unsubscribe posts an empty body to the same URL.
  if (request.method === 'POST' && (!id || !sig)) {
    const form = await request.formData().catch(() => null);
    id = id || form?.get('id');
    sig = sig || form?.get('sig');
  }

  const result = await unsubscribe(env, { id, sig });

  if (!result.ok) {
    return page(
      'Link not valid',
      'That link did not work',
      `<p>If you are still receiving mail you do not want, reply to any message or write to
        <a href="mailto:office@cologrowers.com">office@cologrowers.com</a> and we will take you off by hand.</p>`,
    );
  }

  await audit(env, { actorEmail: result.email, action: 'list.unsubscribe' });
  return page(
    'Unsubscribed',
    'You are off the list',
    `<p>No further mailings will go to that address. Nothing else is required of you.</p>
     <p>If this was a mistake you can <a href="${env.SITE_ORIGIN}/Pages/announcements.html">sign up again</a>.</p>`,
  );
}

// ---------------------------------------------------------------------------
// Mailing list — admin
// ---------------------------------------------------------------------------

/** Every admin route starts here. Returns { member } or a Response to return. */
async function requireAdmin(request, env) {
  const session = await getSession(env, request);
  if (!session) return { error: json(request, { error: 'unauthenticated' }, { status: 401 }) };
  if (!session.member.is_admin) {
    await audit(env, {
      actorEmail: session.member.email,
      action: 'admin.forbidden',
      detail: new URL(request.url).pathname,
      ip: clientIp(request),
    });
    return { error: json(request, { error: 'forbidden' }, { status: 403 }) };
  }
  return { member: session.member };
}

async function handleAdminListStats(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  return json(request, { ok: true, subscribers: await listStats(env) });
}

async function handleAdminMailingsList(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const { results } = await env.DB.prepare(
    `SELECT id, subject, created_at, created_by, sent_at, sent_count, failed_count
       FROM mailings ORDER BY created_at DESC`,
  ).all();

  return json(request, { ok: true, mailings: results ?? [] });
}

async function handleAdminMailingGet(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const id = new URL(request.url).searchParams.get('id');
  const row = await env.DB.prepare('SELECT * FROM mailings WHERE id = ?').bind(String(id ?? '')).first();
  if (!row) return json(request, { error: 'not_found' }, { status: 404 });

  return json(request, { ok: true, mailing: row });
}

async function handleAdminMailingCreate(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const subject = String(body.subject ?? '').trim();
  const bodyHtml = String(body.body_html ?? '').trim();
  const bodyText = String(body.body_text ?? '').trim();

  if (!subject || !bodyHtml || !bodyText) {
    return json(request, { error: 'subject_and_body_required' }, { status: 400 });
  }

  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO mailings (id, subject, body_html, body_text, created_at, created_by, sent_at, sent_count, failed_count)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0)`,
  )
    .bind(id, subject, bodyHtml, bodyText, nowIso(), auth.member.email)
    .run();

  await audit(env, { actorEmail: auth.member.email, action: 'mailing.create', detail: id, ip: clientIp(request) });
  return json(request, { ok: true, id });
}

async function handleAdminMailingSave(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? '');
  const row = await env.DB.prepare('SELECT * FROM mailings WHERE id = ?').bind(id).first();
  if (!row) return json(request, { error: 'not_found' }, { status: 404 });

  // A sent mailing is a record of what went out. Editing it would make the
  // record a lie, so it is frozen.
  if (row.sent_at) return json(request, { error: 'already_sent' }, { status: 409 });

  await env.DB.prepare(
    'UPDATE mailings SET subject = ?, body_html = ?, body_text = ? WHERE id = ?',
  )
    .bind(
      String(body.subject ?? row.subject).trim(),
      String(body.body_html ?? row.body_html).trim(),
      String(body.body_text ?? row.body_text).trim(),
      id,
    )
    .run();

  await audit(env, { actorEmail: auth.member.email, action: 'mailing.save', detail: id, ip: clientIp(request) });
  return json(request, { ok: true });
}

async function handleAdminMailingTest(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const row = await env.DB.prepare('SELECT * FROM mailings WHERE id = ?').bind(String(body.id ?? '')).first();
  if (!row) return json(request, { error: 'not_found' }, { status: 404 });

  const result = await sendCampaignEmail(env, {
    to: auth.member.email,
    subject: `[TEST] ${row.subject}`,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    unsubscribeUrl: `${env.API_ORIGIN}/list/unsubscribe?id=test&sig=test`,
  });

  await audit(env, { actorEmail: auth.member.email, action: 'mailing.test', detail: row.id, ip: clientIp(request) });
  return json(request, { ok: result.ok, error: result.error });
}

/**
 * Send a draft to the active list.
 *
 * `mailing_deliveries` has a primary key of (mailing_id, subscriber_id), and
 * every recipient is recorded before the next one is attempted. A resend
 * therefore skips anyone already marked sent, which is what makes "send" safe
 * to press twice.
 */
async function deliverMailing(env, { mailing, admin, onlyFailed }) {
  const subscribers = await activeSubscribers(env);
  const { results: already } = await env.DB.prepare(
    'SELECT subscriber_id, status FROM mailing_deliveries WHERE mailing_id = ?',
  )
    .bind(mailing.id)
    .all();

  const seen = new Map((already ?? []).map((r) => [r.subscriber_id, r.status]));
  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const prior = seen.get(sub.id);
    if (prior === 'sent') continue;
    if (onlyFailed && prior !== 'failed') continue;

    const result = await sendCampaignEmail(env, {
      to: sub.email,
      subject: mailing.subject,
      bodyHtml: mailing.body_html,
      bodyText: mailing.body_text,
      unsubscribeUrl: await unsubscribeLink(env, sub),
    });

    await env.DB.prepare(
      `INSERT INTO mailing_deliveries (mailing_id, subscriber_id, email, status, error, attempted_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (mailing_id, subscriber_id)
       DO UPDATE SET status = excluded.status, error = excluded.error, attempted_at = excluded.attempted_at`,
    )
      .bind(mailing.id, sub.id, sub.email, result.ok ? 'sent' : 'failed', result.error ?? null, nowIso())
      .run();

    if (result.ok) sent += 1;
    else failed += 1;
  }

  const totals = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM mailing_deliveries WHERE mailing_id = ?`,
  )
    .bind(mailing.id)
    .first();

  await env.DB.prepare(
    'UPDATE mailings SET sent_at = COALESCE(sent_at, ?), sent_count = ?, failed_count = ? WHERE id = ?',
  )
    .bind(nowIso(), totals?.sent ?? 0, totals?.failed ?? 0, mailing.id)
    .run();

  await audit(env, {
    actorEmail: admin.email,
    action: onlyFailed ? 'mailing.resend' : 'mailing.send',
    detail: `${mailing.id} sent=${sent} failed=${failed}`,
  });

  return { sent, failed, total: totals?.sent ?? 0, totalFailed: totals?.failed ?? 0 };
}

async function handleAdminMailingSend(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const row = await env.DB.prepare('SELECT * FROM mailings WHERE id = ?').bind(String(body.id ?? '')).first();
  if (!row) return json(request, { error: 'not_found' }, { status: 404 });

  const result = await deliverMailing(env, { mailing: row, admin: auth.member, onlyFailed: false });
  return json(request, { ok: true, ...result });
}

async function handleAdminMailingResend(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const row = await env.DB.prepare('SELECT * FROM mailings WHERE id = ?').bind(String(body.id ?? '')).first();
  if (!row) return json(request, { error: 'not_found' }, { status: 404 });

  const result = await deliverMailing(env, { mailing: row, admin: auth.member, onlyFailed: true });
  return json(request, { ok: true, ...result });
}

const ROUTES = [
  ['POST', '/auth/request', handleAuthRequest],
  ['GET', '/auth/verify', handleAuthVerify],
  ['POST', '/auth/logout', handleLogout],
  ['GET', '/me', handleMe],
  ['POST', '/vote', handleVote],
  ['GET', '/results', handleResults],
  ['POST', '/admin/send-all', handleAdminSendAll],

  ['POST', '/list/subscribe', handleListSubscribe],
  ['GET', '/list/confirm', handleListConfirm],
  ['GET', '/list/unsubscribe', handleListUnsubscribe],
  ['POST', '/list/unsubscribe', handleListUnsubscribe],

  ['GET', '/admin/list/stats', handleAdminListStats],
  ['GET', '/admin/mailings', handleAdminMailingsList],
  ['GET', '/admin/mailings/get', handleAdminMailingGet],
  ['POST', '/admin/mailings', handleAdminMailingCreate],
  ['POST', '/admin/mailings/save', handleAdminMailingSave],
  ['POST', '/admin/mailings/test', handleAdminMailingTest],
  ['POST', '/admin/mailings/send', handleAdminMailingSend],
  ['POST', '/admin/mailings/resend', handleAdminMailingResend],
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
