// CCGA private board portal — a small, dependency-free Node server for Render.
//
// The public website stays on GitHub Pages. This server owns the PRIVATE board
// area: it authenticates a board member (magic link against the roster) and
// serves confidential pages only to an active session. Nothing private is ever
// in a static file a browser can fetch without signing in.
import { createServer } from 'node:http';
import {
  openDb, normalizeEmail, findMemberByEmail, findMemberById, upsertMember, memberCount, audit,
  listDocuments, getDocument, upsertDocument, setMemberPassword, clearMemberPassword, listMembers,
  addNote, listNotes, deleteNote,
  addDecision, listDecisions, deleteDecision,
  addMember, listMembership, updateMemberStage, deleteMember,
  addSurveyResponse, listSurveyResponses, deleteSurveyResponse, surveyStats,
} from './src/db.js';
import { officeByKey, OFFICIALS } from './src/officials.js';
import {
  COOKIE_NAME, SESSION_TTL_SECONDS, tooManyRequests, issueToken, redeemToken,
  purgeExpiredTokens, createSession, getSession, destroySession, cookieHeader, readCookie,
} from './src/auth.js';
import { hashPassword, verifyPassword } from './src/crypto.js';
import { sendSignInLink } from './src/email.js';
import { loadBoardDocuments } from './src/content.js';
import { parseNcgaMembers } from './src/member-import.js';
import {
  loginPage, checkEmailPage, noticePage, documentPage, adminPage,
  setupPage, accountPage, membersPage,
  homePage, boardRoomPage, decisionsPage, issuesPage, handoverPage,
  officialsPage, publicSurveyPage, surveyThanksPage,
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

    // PUBLIC: the "trusted source" survey for elected officials and their staff.
    // No board session — this is sent out to offices. ?office=<key> pre-selects.
    if (req.method === 'GET' && path === '/survey') {
      return send(res, 200, publicSurveyPage({ selectedOffice: url.searchParams.get('office') || '' }));
    }
    if (req.method === 'GET' && path === '/survey/thanks') {
      return send(res, 200, surveyThanksPage());
    }
    if (req.method === 'POST' && path === '/survey') {
      const f = await readBody(req);
      // Honeypot: a real person leaves the hidden "website" field empty.
      if ((formField(f, 'website') || '').trim()) return redirect(res, '/survey/thanks');
      const clip = (name, n) => (formField(f, name) || '').trim().slice(0, n);
      const officeKey = clip('office', 60);
      const office = officeKey ? officeByKey(officeKey) : null;
      const answerRaw = clip('answer', 20);
      const answer = ['Yes', 'Maybe', 'Not now'].includes(answerRaw) ? answerRaw : 'Maybe';
      addSurveyResponse(db, {
        officeKey: office ? office.key : null,
        officeLabel: office ? `${office.name}${office.district ? ' — ' + office.district : ''}` : null,
        respondent: clip('respondent', 160) || null,
        role: clip('role', 160) || null,
        email: clip('email', 200) || null,
        phone: clip('phone', 60) || null,
        answer,
        interests: clip('interests', 400) || null,
        comments: clip('comments', 2000) || null,
        ip: clientIp(req),
      });
      audit(db, { action: 'survey.response', detail: office ? office.key : 'unspecified', ip: clientIp(req) });
      return redirect(res, '/survey/thanks');
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
      if (member.password_hash) {
        // Already has a password — do not let this page overwrite it (anyone could
        // otherwise reset a known roster email). Reset goes through sign-in, an
        // email link, or an admin.
        return send(res, 200, noticePage('You already have a password',
          '<p>This account already has a password. <a class="link" href="/">Sign in</a> with it, or use ' +
          '&ldquo;Email me a link instead&rdquo; on the sign-in page to get back in and change it under Account. ' +
          'Locked out? Ask a board admin to reset your password.</p>'));
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

    // The headquarters home — what's new (latest comments + decisions) + links.
    if (req.method === 'GET' && path === '/portal') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      return send(res, 200, homePage(s.member, { notes: listNotes(db), decisions: listDecisions(db) }));
    }
    // Board Room — the member comment / discussion feed.
    if (req.method === 'GET' && path === '/portal/room') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      return send(res, 200, boardRoomPage(s.member, listNotes(db)));
    }
    // Decisions — the official record.
    if (req.method === 'GET' && path === '/portal/decisions') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      return send(res, 200, decisionsPage(s.member, listDecisions(db)));
    }
    // Issues — the board's initiatives and open matters.
    if (req.method === 'GET' && path === '/portal/issues') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      return send(res, 200, issuesPage(s.member, listDocuments(db)));
    }
    // Handover — everything needed to run CCGA.
    if (req.method === 'GET' && path === '/portal/handover') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      return send(res, 200, handoverPage(s.member, listDocuments(db)));
    }
    // Officials — the Colorado delegation directory + the trusted-source survey.
    if (req.method === 'GET' && path === '/portal/officials') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      return send(res, 200, officialsPage(s.member, {
        responses: listSurveyResponses(db),
        stats: surveyStats(db),
        surveyUrl: `${PUBLIC_ORIGIN}/survey`,
      }));
    }
    // Officials — download the directory as CSV (for a Constant Contact list / mail merge).
    if (req.method === 'GET' && path === '/portal/officials/export') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const q = (v) => { const x = String(v == null ? '' : v).replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’').replace(/&amp;/g, '&'); return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
      const header = ['Office', 'Name', 'Title', 'Party', 'Status', 'Email', 'Phone', 'Address', 'Contact URL', 'Website'];
      const lines = [header.join(',')];
      for (const o of OFFICIALS) {
        const email = o.campaign_email || '';
        const link = o.contact_url || o.campaign_url || '';
        const statusLabel = o.status === 'new' ? 'Elected — office opens Jan 2027' : o.status === 'returning' ? 'In office' : 'Office';
        lines.push([o.group, o.name, o.title, o.party, statusLabel, email, o.phone || '', o.dc_address || '', link, o.website || ''].map(q).join(','));
      }
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ccga-officials.csv"',
      });
      res.end(lines.join('\r\n'));
      return;
    }
    // Officials — delete a survey response. Admins only.
    if (req.method === 'POST' && path === '/portal/officials/response/delete') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      if (!s.member.is_admin) return send(res, 403, noticePage('Not allowed', '<p>Admins only.</p>'));
      deleteSurveyResponse(db, formField(await readBody(req), 'id'));
      audit(db, { actorEmail: s.member.email, action: 'survey.delete', ip: clientIp(req) });
      return redirect(res, '/portal/officials');
    }

    // The Board Room: post a thought. Any signed-in member.
    if (req.method === 'POST' && path === '/portal/room') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const body = (formField(await readBody(req), 'body') || '').trim();
      if (body) {
        addNote(db, { authorEmail: s.member.email, authorName: s.member.full_name || s.member.email, body: body.slice(0, 8000) });
        audit(db, { actorEmail: s.member.email, action: 'note.add', ip: clientIp(req) });
      }
      return redirect(res, '/portal/room');
    }

    // The Board Room: delete a thought. Author or admin only.
    if (req.method === 'POST' && path === '/portal/room/delete') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const id = formField(await readBody(req), 'id');
      const note = (listNotes(db, 500) || []).find((n) => n.id === id);
      if (note && (s.member.is_admin || note.author_email === s.member.email)) {
        deleteNote(db, id);
        audit(db, { actorEmail: s.member.email, action: 'note.delete', detail: id, ip: clientIp(req) });
      }
      return redirect(res, '/portal/room');
    }

    // Decisions log: record a decision. Any signed-in member.
    if (req.method === 'POST' && path === '/portal/decisions') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const form = await readBody(req);
      const title = (formField(form, 'title') || '').trim();
      const detail = (formField(form, 'detail') || '').trim();
      const outcomeRaw = (formField(form, 'outcome') || '').trim();
      const outcome = ['Passed', 'Failed', 'Tabled', 'In progress'].includes(outcomeRaw) ? outcomeRaw : 'Passed';
      const decidedOn = /^\d{4}-\d{2}-\d{2}$/.test((formField(form, 'decided_on') || '').trim())
        ? formField(form, 'decided_on').trim() : null;
      if (title) {
        addDecision(db, {
          title: title.slice(0, 300), detail: detail.slice(0, 8000) || null, outcome,
          decidedOn, recordedBy: s.member.full_name || s.member.email, recordedEmail: s.member.email,
        });
        audit(db, { actorEmail: s.member.email, action: 'decision.add', ip: clientIp(req) });
      }
      return redirect(res, '/portal/decisions');
    }

    // Decisions log: delete an entry. Recorder or admin only.
    if (req.method === 'POST' && path === '/portal/decisions/delete') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const id = formField(await readBody(req), 'id');
      const d = (listDecisions(db, 1000) || []).find((x) => x.id === id);
      if (d && (s.member.is_admin || d.recorded_email === s.member.email)) {
        deleteDecision(db, id);
        audit(db, { actorEmail: s.member.email, action: 'decision.delete', detail: id, ip: clientIp(req) });
      }
      return redirect(res, '/portal/decisions');
    }

    // Members list (sponsorship targets).
    if (req.method === 'GET' && path === '/portal/members') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const imported = url.searchParams.get('imported');
      const message = imported != null
        ? `Imported ${imported} member(s)${url.searchParams.get('skipped') > 0 ? `, skipped ${url.searchParams.get('skipped')} already on the list` : ''}.`
        : null;
      return send(res, 200, membersPage(s.member, listMembership(db), { message }));
    }
    if (req.method === 'POST' && path === '/portal/members') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const f = await readBody(req);
      const name = (formField(f, 'name') || '').trim();
      if (name) {
        const STAGES = ['New', 'Contacted', 'Interested', 'Committed', 'Declined'];
        const STATUSES = ['Expired', 'Lapsed', 'Active', 'Prospect'];
        const pick = (v, list, dflt) => (list.includes((v || '').trim()) ? v.trim() : dflt);
        addMember(db, {
          name: name.slice(0, 200),
          farm: (formField(f, 'farm') || '').trim().slice(0, 200) || null,
          email: (formField(f, 'email') || '').trim().slice(0, 200) || null,
          phone: (formField(f, 'phone') || '').trim().slice(0, 60) || null,
          town: (formField(f, 'town') || '').trim().slice(0, 120) || null,
          status: pick(formField(f, 'status'), STATUSES, 'Expired'),
          stage: pick(formField(f, 'stage'), STAGES, 'New'),
          notes: (formField(f, 'notes') || '').trim().slice(0, 2000) || null,
          addedBy: s.member.email,
        });
        audit(db, { actorEmail: s.member.email, action: 'membership.add', ip: clientIp(req) });
      }
      return redirect(res, '/portal/members');
    }
    if (req.method === 'POST' && path === '/portal/members/stage') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const f = await readBody(req);
      const stage = (formField(f, 'stage') || '').trim();
      if (['New', 'Contacted', 'Interested', 'Committed', 'Declined'].includes(stage)) {
        updateMemberStage(db, formField(f, 'id'), stage);
      }
      return redirect(res, '/portal/members');
    }
    if (req.method === 'POST' && path === '/portal/members/delete') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      deleteMember(db, formField(await readBody(req), 'id'));
      audit(db, { actorEmail: s.member.email, action: 'membership.delete', ip: clientIp(req) });
      return redirect(res, '/portal/members');
    }
    // Bulk import from a pasted NCGA / Nimble member export. Admins only.
    if (req.method === 'POST' && path === '/portal/members/import') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      if (!s.member.is_admin) return send(res, 403, noticePage('Not allowed', '<p>Admins only.</p>'));
      const parsed = parseNcgaMembers(formField(await readBody(req), 'data') || '');
      const existing = listMembership(db, 100000);
      const emails = new Set(existing.map((m) => (m.email || '').toLowerCase()).filter(Boolean));
      const names = new Set(existing.map((m) => (m.name || '').toLowerCase()));
      let added = 0, skipped = 0;
      for (const m of parsed) {
        const key = (m.email || '').toLowerCase();
        if ((key && emails.has(key)) || (!key && names.has(m.name.toLowerCase()))) { skipped++; continue; }
        addMember(db, { ...m, addedBy: s.member.email });
        if (key) emails.add(key);
        names.add(m.name.toLowerCase());
        added++;
      }
      audit(db, { actorEmail: s.member.email, action: 'membership.import', detail: `+${added}/-${skipped}`, ip: clientIp(req) });
      return redirect(res, `/portal/members?imported=${added}&skipped=${skipped}`);
    }
    // Export the membership list as CSV, formatted for Constant Contact import.
    if (req.method === 'GET' && path === '/portal/members/export') {
      const s = currentSession(req);
      if (!s) return redirect(res, '/');
      const want = (url.searchParams.get('status') || 'all').toLowerCase();
      let rows = listMembership(db, 100000);
      if (want !== 'all') rows = rows.filter((m) => (m.status || '').toLowerCase() === want);
      rows = rows.filter((m) => (m.email || '').includes('@')); // a blast needs an address
      const q = (v) => { const x = String(v == null ? '' : v); return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
      const COMPANY = /\b(LLC|LLP|Inc\.?|Incorporated|Company|Co\.?|Farms?|Bank|Land|Seed|Bros|Brothers)\b|&/i;
      const header = ['First Name', 'Last Name', 'Company Name', 'Email Address', 'Phone', 'City', 'Membership Status', 'Sponsorship Stage', 'Notes'];
      const lines = [header.join(',')];
      for (const m of rows) {
        let first = '', last = '', company = '';
        const name = (m.name || '').trim();
        if (COMPANY.test(name)) company = name;
        else { const p = name.split(/\s+/); first = p.shift() || ''; last = p.join(' '); }
        lines.push([first, last, company, m.email, m.phone, m.town, m.status, m.stage, m.notes].map(q).join(','));
      }
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ccga-members-${want}.csv"`,
      });
      res.end(lines.join('\r\n'));
      return;
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
      else if (url.searchParams.get('msg') === 'reset') message = 'Password reset. The member sets a new one at "Set up your password" (or via a sign-in link).';
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
        if (action === 'reset_password') {
          // Clear the member's password so they set a fresh one (via Set up your
          // password, or a sign-in link). Does not lock them out of link sign-in.
          clearMemberPassword(db, target.id);
          audit(db, { actorEmail: s.member.email, action: 'roster.reset_password', detail: target.email, ip: clientIp(req) });
          return redirect(res, '/portal/admin?msg=reset');
        }
        if (action === 'signin_link') {
          // Generate a one-time sign-in link the admin can copy and send to the
          // member directly (text / their own email). Works without a mail service.
          if (!target.is_active) return redirect(res, '/portal/admin');
          // Non-expiring but still single-use: the member can click it whenever,
          // and once used a forwarded copy is dead.
          const { token } = issueToken(db, { email: target.email, ip: clientIp(req), ttlSeconds: 10 * 365 * 24 * 60 * 60 });
          const link = `${PUBLIC_ORIGIN}/auth/verify?token=${encodeURIComponent(token)}`;
          audit(db, { actorEmail: s.member.email, action: 'roster.signin_link', detail: target.email, ip: clientIp(req) });
          return send(res, 200, adminPage(s.member, { members: listMembers(db), linkInfo: { email: target.email, link } }));
        }
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
        upsertDocument(db, {
          slug: d.slug, title: d.title, body_html: d.body_html,
          category: d.category || null, status: d.status || null, summary: d.summary || null,
          sort: d.sort || 0,
        });
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
