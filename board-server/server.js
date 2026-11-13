// CCGA private board portal — a small, dependency-free Node server for Render.
//
// The public website stays on GitHub Pages. This server owns the PRIVATE board
// area: it authenticates a board member (magic link against the roster) and
// serves confidential pages only to an active session. Nothing private is ever
// in a static file a browser can fetch without signing in.
import { createServer } from 'node:http';
import {
  openDb, normalizeEmail, findMemberByEmail, findMemberById, upsertMember, memberCount, audit,
  listDocuments, getDocument, upsertDocument, setMemberPassword, listMembers,
} from './src/db.js';
import {
  COOKIE_NAME, SESSION_TTL_SECONDS, tooManyRequests, issueToken, redeemToken,
  purgeExpiredTokens, createSession, getSession, destroySession, cookieHeader, readCookie,
} from './src/auth.js';
import { hashPassword, verifyPassword } from './src/crypto.js';
import { sendSignInLink } from './src/email.js';
import { loadBoardDocuments } from './src/content.js';
import {
  loginPage, checkEmailPage, noticePage, portalPage, documentPage, adminPage,
  setupPage, accountPage,
} from './src/pages.js';

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

// Load the board documents that ship with the code (encrypted bundle).
loadBoardDocuments(db);

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

    // Password sign-in.
    if (req.method === 'POST' && path === '/auth/login') {
      const body = await readBody(req);
      const email = normalizeEmail(formField(body, 'email'));
      const password = formField(body, 'password');
      if (!password) {
        // No password typed — treat "Sign in" as a nudge toward the link option.
        return send(res, 200, loginPage({ error: 'Enter your password, or use "Email me a link instead".' }));
      }
      const member = findMemberByEmail(db, email);
      // One generic failure message whether the email, the password, or the
      // account's active state is the problem — no account enumeration.
      if (!member || !member.is_active || !verifyPassword(password, member.password_hash)) {
        return send(res, 200, loginPage({ error: 'That email and password did not match. If you have not set a password, use the link option or Set up your password.' }));
      }
      const session = createSession(db, SECRET, member.id);
      audit(db, { actorEmail: member.email, action: 'auth.login', ip: clientIp(req) });
      return redirect(res, '/portal', { 'Set-Cookie': cookieHeader(session.cookieValue, SESSION_TTL_SECONDS, COOKIE_SECURE) });
    }

    // Set-up / reset a password — open to a roster email.
    if (req.method === 'GET' && path === '/setup') {
      if (currentSession(req)) return redirect(res, '/account');
      return send(res, 200, setupPage());
    }
    if (req.method === 'POST' && path === '/auth/setup') {
      const body = await readBody(req);
      const email = normalizeEmail(formField(body, 'email'));
      const password = formField(body, 'password');
      const confirm = formField(body, 'confirm');
      if (!password || password.length < 8) return send(res, 200, setupPage({ email, error: 'Password must be at least 8 characters.' }));
      if (password !== confirm) return send(res, 200, setupPage({ email, error: 'The two passwords do not match.' }));
      const member = findMemberByEmail(db, email);
      if (!member || !member.is_active) {
        // Don't reveal roster membership; send them to the link path.
        return send(res, 200, noticePage('Check with the office',
          '<p>If that address is on the board roster, you can set a password. If it is not working, ask the office to add you, or ' +
          '<a class="link" href="/">use an email link</a>.</p>'));
      }
      setMemberPassword(db, member.id, hashPassword(password));
      audit(db, { actorEmail: member.email, action: 'auth.setup_password', ip: clientIp(req) });
      const session = createSession(db, SECRET, member.id);
      return redirect(res, '/portal', { 'Set-Cookie': cookieHeader(session.cookieValue, SESSION_TTL_SECONDS, COOKIE_SECURE) });
    }

    // Account: change your own password (signed in).
    if (req.method === 'GET' && path === '/account') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      return send(res, 200, accountPage(s.member));
    }
    if (req.method === 'POST' && path === '/account/password') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const body = await readBody(req);
      const password = formField(body, 'password');
      const confirm = formField(body, 'confirm');
      if (!password || password.length < 8) return send(res, 200, accountPage(s.member, { error: 'Password must be at least 8 characters.' }));
      if (password !== confirm) return send(res, 200, accountPage(s.member, { error: 'The two passwords do not match.' }));
      setMemberPassword(db, s.member.id, hashPassword(password));
      audit(db, { actorEmail: s.member.email, action: 'auth.change_password', ip: clientIp(req) });
      return send(res, 200, accountPage({ ...s.member, password_hash: 'set' }, { message: 'Password updated.' }));
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

    // The private area — document index.
    if (req.method === 'GET' && path === '/portal') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      return send(res, 200, portalPage(s.member, listDocuments(db)));
    }

    // A single private document.
    if (req.method === 'GET' && path.startsWith('/portal/d/')) {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const slug = decodeURIComponent(path.slice('/portal/d/'.length));
      const doc = getDocument(db, slug);
      if (!doc) return send(res, 404, noticePage('Not found', '<p><a class="link" href="/portal">Back to documents</a></p>'));
      return send(res, 200, documentPage(s.member, doc));
    }

    // Admin-only: document loader.
    if (req.method === 'GET' && path === '/portal/admin') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      if (!s.member.is_admin) return send(res, 403, noticePage('Not allowed', '<p>Admins only. <a class="link" href="/portal">Back</a></p>'));
      const loaded = url.searchParams.get('loaded');
      const added = url.searchParams.get('added');
      let message = null;
      if (loaded) message = `Loaded ${loaded} document(s).`;
      else if (added) message = `Added ${added} member(s) to the roster.`;
      return send(res, 200, adminPage(s.member, { message, members: listMembers(db) }));
    }
    // Admin: add members to the roster (one per line: email, or "email, Name").
    if (req.method === 'POST' && path === '/portal/admin/members') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      if (!s.member.is_admin) return send(res, 403, noticePage('Not allowed', '<p>Admins only.</p>'));
      const body = await readBody(req);
      let n = 0;
      for (const line of formField(body, 'emails').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const comma = trimmed.indexOf(',');
        const email = normalizeEmail(comma === -1 ? trimmed : trimmed.slice(0, comma));
        const name = comma === -1 ? '' : trimmed.slice(comma + 1).trim();
        if (!email.includes('@')) continue;
        const existing = findMemberByEmail(db, email);
        upsertMember(db, {
          email,
          full_name: name || (existing && existing.full_name) || email.split('@')[0],
          role: existing ? existing.role : 'Board Member',
          is_admin: existing ? existing.is_admin : 0,
          is_active: 1,
        });
        n++;
      }
      audit(db, { actorEmail: s.member.email, action: 'roster.add', detail: String(n), ip: clientIp(req) });
      return redirect(res, '/portal/admin?added=' + n);
    }
    // Admin: promote/demote/activate/deactivate one member.
    if (req.method === 'POST' && path === '/portal/admin/member') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      if (!s.member.is_admin) return send(res, 403, noticePage('Not allowed', '<p>Admins only.</p>'));
      const body = await readBody(req);
      const target = findMemberById(db, formField(body, 'id'));
      const action = formField(body, 'action');
      if (target) {
        const flags = { is_admin: target.is_admin, is_active: target.is_active };
        if (action === 'promote') flags.is_admin = 1;
        else if (action === 'demote') flags.is_admin = 0;
        else if (action === 'activate') flags.is_active = 1;
        else if (action === 'deactivate') flags.is_active = 0;
        upsertMember(db, { email: target.email, full_name: target.full_name, role: target.role, ...flags });
        audit(db, { actorEmail: s.member.email, action: 'roster.' + action, detail: target.email, ip: clientIp(req) });
      }
      return redirect(res, '/portal/admin');
    }
    if (req.method === 'POST' && path === '/portal/admin/load') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      if (!s.member.is_admin) return send(res, 403, noticePage('Not allowed', '<p>Admins only.</p>'));
      const body = await readBody(req);
      let docs;
      try {
        docs = JSON.parse(formField(body, 'docs'));
        if (!Array.isArray(docs)) throw new Error('not an array');
      } catch (e) {
        return send(res, 200, adminPage(s.member, { message: 'That did not parse as a JSON array. Copy the whole file, including the opening [ and closing ].' }));
      }
      let n = 0;
      for (const d of docs) {
        if (!d || !d.slug || !d.title || !d.body_html) continue;
        upsertDocument(db, { slug: d.slug, title: d.title, body_html: d.body_html, sort: d.sort || 0 });
        n++;
      }
      audit(db, { actorEmail: s.member.email, action: 'docs.load', detail: String(n), ip: clientIp(req) });
      return redirect(res, '/portal/admin?loaded=' + n);
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
