// CCGA private board portal — a small, dependency-free Node server for Render.
//
// The public website stays on GitHub Pages. This server owns the PRIVATE board
// area: it authenticates a board member (magic link against the roster) and
// serves confidential pages only to an active session. Nothing private is ever
// in a static file a browser can fetch without signing in.
import { createServer } from 'node:http';
import {
  openDb, normalizeEmail, findMemberByEmail, upsertMember, memberCount, audit,
} from './src/db.js';
import {
  COOKIE_NAME, SESSION_TTL_SECONDS, tooManyRequests, issueToken, redeemToken,
  purgeExpiredTokens, createSession, getSession, destroySession, cookieHeader, readCookie,
} from './src/auth.js';
import { sendSignInLink } from './src/email.js';
import { loginPage, checkEmailPage, noticePage, portalPage } from './src/pages.js';

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`).replace(/\/$/, '');
// Secure cookies require HTTPS. Render serves HTTPS, so default on; a local
// http test sets COOKIE_SECURE=false so the browser will actually send it back.
const COOKIE_SECURE = (process.env.COOKIE_SECURE ?? 'true') !== 'false';

if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: SESSION_SECRET must be set (>=16 chars) in production.');
    process.exit(1);
  }
  console.warn('[dev] SESSION_SECRET is weak/unset — using a throwaway dev secret.');
}
const SECRET = SESSION_SECRET || 'dev-insecure-secret-change-me';

const db = openDb();

// Optional one-time bootstrap so the first admin can sign in on a fresh Render
// deploy without touching the database by hand.
if (memberCount(db) === 0 && process.env.BOOTSTRAP_ADMIN_EMAIL) {
  upsertMember(db, {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    full_name: process.env.BOOTSTRAP_ADMIN_NAME || 'Board Admin',
    role: 'Admin',
    is_admin: 1,
    is_active: 1,
  });
  console.log('[bootstrap] seeded admin: ' + normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL));
}

/* ---- helpers ---- */

function send(res, status, html, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(html);
}
function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, ...headers });
  res.end();
}
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket.remoteAddress || null;
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}
function formField(body, name) {
  for (const pair of String(body).split('&')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    if (decodeURIComponent(pair.slice(0, idx)) === name) {
      return decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '));
    }
  }
  return '';
}
function currentSession(req) {
  const cookie = readCookie(req.headers.cookie, COOKIE_NAME);
  if (!cookie) return null;
  return getSession(db, SECRET, cookie);
}

/* ---- routes ---- */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_ORIGIN);
  const path = url.pathname;

  try {
    if (req.method === 'GET' && path === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }

    // Landing / login. If already signed in, go straight to the portal.
    if (req.method === 'GET' && path === '/') {
      if (currentSession(req)) return redirect(res, '/portal');
      return send(res, 200, loginPage());
    }

    // Request a magic link. Always responds the same way (no account enumeration).
    if (req.method === 'POST' && path === '/auth/request') {
      const body = await readBody(req);
      const email = normalizeEmail(formField(body, 'email'));
      const ip = clientIp(req);
      if (!email || !email.includes('@')) {
        return send(res, 200, loginPage({ error: 'Enter a valid email address.' }));
      }
      if (!tooManyRequests(db, { email, ip })) {
        const member = findMemberByEmail(db, email);
        if (member && member.is_active) {
          const { token } = issueToken(db, { email, ip });
          const link = `${PUBLIC_ORIGIN}/auth/verify?token=${encodeURIComponent(token)}`;
          const r = await sendSignInLink({
            RESEND_API_KEY: process.env.RESEND_API_KEY,
            MAIL_FROM: process.env.MAIL_FROM,
            MAIL_REPLY_TO: process.env.MAIL_REPLY_TO,
          }, { to: email, fullName: member.full_name, link });
          if (!r.ok) console.error('[email] send failed:', r.status, r.body);
          audit(db, { actorEmail: email, action: 'auth.request', ip });
        }
      }
      purgeExpiredTokens(db);
      return send(res, 200, checkEmailPage(email));
    }

    // Redeem the link, open a session, land in the portal.
    if (req.method === 'GET' && path === '/auth/verify') {
      const result = redeemToken(db, url.searchParams.get('token'));
      if (!result.ok) {
        return send(res, 200, noticePage('That link did not work',
          '<p>It may have already been used, or expired. Sign-in links work once and last 24 hours.</p>' +
          '<p style="margin-top:12px;"><a class="link" href="/">Request a new link</a></p>'));
      }
      const member = findMemberByEmail(db, result.email);
      if (!member || !member.is_active) {
        return send(res, 200, noticePage('No active account', '<p>That address is not on the active board roster. Ask the office.</p>'));
      }
      const session = createSession(db, SECRET, member.id);
      audit(db, { actorEmail: member.email, action: 'auth.signin', ip: clientIp(req) });
      return redirect(res, '/portal', {
        'Set-Cookie': cookieHeader(session.cookieValue, SESSION_TTL_SECONDS, COOKIE_SECURE),
      });
    }

    // The private area.
    if (req.method === 'GET' && path === '/portal') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      return send(res, 200, portalPage(s.member));
    }

    if (req.method === 'POST' && path === '/logout') {
      const s = currentSession(req);
      if (s) destroySession(db, s.sessionId);
      return redirect(res, '/', { 'Set-Cookie': cookieHeader('', 0, COOKIE_SECURE) });
    }

    return send(res, 404, noticePage('Not found', '<p><a class="link" href="/">Go to the board portal</a></p>'));
  } catch (err) {
    console.error('request error:', err);
    return send(res, 500, noticePage('Something went wrong', '<p>Please try again.</p>'));
  }
});

server.listen(PORT, () => console.log(`CCGA board portal listening on :${PORT}`));

export { server };
