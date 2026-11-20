// Server-rendered pages. Inline CSS, site palette (cream / deep green / gold).
// The portal page is served ONLY to an authenticated session — its contents
// never reach a browser that has not signed in.

const HEAD = (title) => `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${title} — CCGA Board Portal</title>
<style>
  :root{--page:#f5f3ee;--surface:#fff;--ink:#37342f;--muted:#5b564f;--green:#334539;
        --green-d:#28362c;--gold-d:#8a6a22;--line:#e0dbd1;--err:#a3301f;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:var(--page);color:var(--ink);line-height:1.6;}
  .bar{background:rgba(27,26,23,.97);padding:1rem 0;}
  .bar-in,.wrap{max-width:820px;margin:0 auto;padding:0 1.4rem;}
  .bar-in{display:flex;justify-content:space-between;align-items:center;}
  .bar .logo{color:#fff;font-weight:600;}
  .bar a{color:#d3ae5c;text-decoration:none;font-size:.9rem;}
  .wrap{padding:2.4rem 1.4rem 4rem;}
  h1{font-family:Georgia,serif;font-weight:400;color:var(--green);font-size:1.9rem;margin-bottom:.4rem;}
  .sub{color:var(--muted);margin-bottom:1.6rem;}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:1.6rem;margin-bottom:1.3rem;}
  label{display:block;font-size:.82rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.4rem;}
  input{width:100%;padding:.75rem .85rem;border:1px solid #c7c0b4;border-radius:6px;font:inherit;font-size:1rem;}
  input:focus{outline:2px solid var(--green);border-color:var(--green);}
  .btn{display:inline-block;background:var(--green);color:#fff;border:none;padding:.8rem 1.5rem;border-radius:6px;
       font:inherit;font-weight:600;cursor:pointer;text-decoration:none;}
  .btn:hover{background:var(--green-d);}
  .hint{font-size:.9rem;color:var(--muted);margin-top:.9rem;}
  .err{color:var(--err);font-size:.92rem;margin-top:.8rem;}
  .note{border-left:3px solid var(--gold-d);background:#f7f1e3;padding:.9rem 1.1rem;border-radius:0 6px 6px 0;font-size:.92rem;margin-bottom:1.3rem;}
  .note b{color:var(--green);}
  h2{color:var(--green);font-size:1.15rem;margin-bottom:.5rem;}
  .pill{display:inline-block;background:#eef1ec;color:var(--green);font-size:.78rem;font-weight:700;
        padding:.2rem .6rem;border-radius:20px;text-transform:uppercase;letter-spacing:.05em;}
  a.link{color:var(--gold-d);font-weight:600;}
  .doc{color:#37342f;}
  .doc h3{color:var(--green);font-size:1.1rem;margin:1.4rem 0 .5rem;}
  .doc p{margin:0 0 .8rem;}
  .doc ul,.doc ol{margin:0 0 .9rem 1.2rem;}
  .doc li{margin:.25rem 0;}
  .doc table{width:100%;border-collapse:collapse;margin:.6rem 0 1.1rem;font-size:.95rem;}
  .doc th,.doc td{text-align:left;padding:.5rem .6rem;border-bottom:1px solid var(--line);vertical-align:top;}
  .doc th{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;}
  .doc .step{font-weight:700;color:var(--green);}
  .doc em{color:#5b564f;}
  .doc .lead{font-size:1.02rem;color:#494540;}
  /* --- dashboard --- */
  .sec-label{font-size:.72rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#6a8971;margin:1.9rem 0 .7rem;}
  .hero{background:var(--green);color:#fff;border-radius:10px;padding:1.7rem 1.7rem 1.4rem;margin-bottom:.4rem;}
  .hero .sec-label{color:#d3ae5c;margin-top:0;}
  .hero h2{color:#fff;font-size:1.45rem;margin-bottom:.4rem;}
  .hero p{color:#e3dfd6;font-size:.96rem;margin-bottom:0;}
  .issue-grid{display:grid;grid-template-columns:1fr 1fr;gap:.85rem;margin-bottom:.4rem;}
  @media(max-width:620px){.issue-grid{grid-template-columns:1fr;}}
  .issue{display:block;background:var(--surface);border:1px solid var(--line);border-radius:9px;
         padding:1rem 1.1rem;text-decoration:none;color:var(--ink);transition:border-color .15s,box-shadow .15s;}
  .issue:hover{border-color:#6a8971;box-shadow:0 4px 14px rgba(0,0,0,.07);}
  .issue .top{display:flex;justify-content:space-between;align-items:flex-start;gap:.6rem;margin-bottom:.35rem;}
  .issue h3{font-family:Georgia,serif;font-weight:600;color:var(--green);font-size:1.04rem;line-height:1.25;margin:0;}
  .issue .sum{font-size:.88rem;color:#5b564f;line-height:1.45;}
  .issue.on-hero{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);}
  .issue.on-hero h3{color:#fff;}
  .issue.on-hero .sum{color:#cfd8cf;}
  .issue.on-hero:hover{border-color:#d3ae5c;box-shadow:none;}
  .badge{display:inline-block;font-size:.66rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
         padding:.22rem .5rem;border-radius:5px;white-space:nowrap;}
  .b-active{background:#dcebe0;color:#2b5338;}
  .b-blocked{background:#f0dede;color:#8a2f2f;}
  .b-progress{background:#f3e8cf;color:#6b5214;}
  .b-action{background:#f3e3cb;color:#7a4e12;}
  .b-ref{background:#e7e4dd;color:#4a4740;}
  .b-done{background:#e4e2de;color:#5b564f;}
  .hero .badge{box-shadow:0 0 0 1px rgba(255,255,255,.15);}
  /* --- the board room --- */
  textarea{width:100%;padding:.75rem .85rem;border:1px solid #c7c0b4;border-radius:6px;font:inherit;font-size:1rem;resize:vertical;}
  textarea:focus{outline:2px solid var(--green);border-color:var(--green);}
  .note-item{padding:.85rem 0;border-bottom:1px solid var(--line);}
  .note-item:last-child{border-bottom:none;padding-bottom:0;}
  .note-meta{font-size:.82rem;color:#8c867b;margin-bottom:.3rem;display:flex;gap:.45rem;align-items:center;}
  .note-meta b{color:var(--green);}
  .note-body{color:#37342f;white-space:pre-wrap;line-height:1.5;}
  .note-del{margin-left:auto;background:none;border:none;color:#a3301f;cursor:pointer;font:inherit;font-size:.78rem;padding:0;text-decoration:underline;}
  .room-empty{color:#8c867b;font-size:.92rem;padding:.6rem 0;}
  .decision-title{font-family:Georgia,serif;font-weight:600;color:var(--green);font-size:1.05rem;line-height:1.3;}
  select:focus{outline:2px solid var(--green);border-color:var(--green);}
  /* --- section nav (sticky tabs) --- */
  .hqnav{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid var(--line);box-shadow:0 1px 4px rgba(0,0,0,.04);}
  .hqnav-in{max-width:820px;margin:0 auto;padding:0 1.4rem;display:flex;gap:1.3rem;overflow-x:auto;}
  .hqnav a{display:inline-block;padding:.8rem .1rem;color:var(--muted);text-decoration:none;font-size:.88rem;
           font-weight:600;white-space:nowrap;border-bottom:2px solid transparent;}
  .hqnav a:hover{color:var(--green);border-bottom-color:var(--green);}
  [id]{scroll-margin-top:3.6rem;}
  /* collapsible compose */
  details.compose{border:1px solid var(--line);border-radius:8px;padding:0;margin-bottom:1.3rem;background:#fbfaf7;}
  details.compose>summary{list-style:none;cursor:pointer;padding:.8rem 1rem;font-weight:600;color:var(--green);font-size:.95rem;}
  details.compose>summary::-webkit-details-marker{display:none;}
  details.compose>summary::before{content:'+ ';font-weight:700;}
  details.compose[open]>summary::before{content:'\\2212 ';}
  details.compose>.compose-body{padding:0 1rem 1rem;}
</style></head><body>`;

// Escape text entered by a person before it is placed in HTML.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Format a YYYY-MM-DD (or ISO) date as "Nov 18, 2026". Returns '' if unparseable.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd ?? ''));
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : '';
};

// Map a decision outcome to its badge class.
const OUTCOME_BADGE = { 'Passed': 'b-active', 'Failed': 'b-blocked', 'In progress': 'b-progress', 'Tabled': 'b-ref' };

const FOOT = `</body></html>`;

export function loginPage({ error } = {}) {
  return HEAD('Sign in') + `
  <div class="bar"><div class="bar-in"><span class="logo">CCGA Board Portal</span>
    <a href="https://www.cologrowers.com">cologrowers.com</a></div></div>
  <div class="wrap">
    <h1>Board Portal</h1>
    <p class="sub">Private to the CCGA board. Sign in with your password, or have a one-time link emailed to you.</p>
    <div class="card">
      <form method="POST">
        <label for="email">Board email</label>
        <input id="email" name="email" type="email" required autocomplete="email" placeholder="you@cologrowers.com" autofocus>
        <div style="margin-top:.9rem;"><label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Your password (leave blank to use an email link)"></div>
        ${error ? `<div class="err">${error}</div>` : ''}
        <div class="row" style="margin-top:1.1rem;">
          <button class="btn" type="submit" formaction="/auth/login">Sign in</button>
          <button class="btn ghost" type="submit" formaction="/auth/request">Email me a link instead</button>
        </div>
      </form>
      <p class="hint">Only board roster addresses can sign in. New here, or want to set a password?
        <a class="link" href="/setup">Set up your password</a>. The email link works with no password
        &mdash; it signs you in once and expires in 24 hours.</p>
    </div>
  </div>` + FOOT;
}

// Set or reset a password. Open to a roster email; the link option is always
// there as the fallback if someone isn't sure.
export function setupPage({ error, email } = {}) {
  return HEAD('Set up your password') + `
  <div class="bar"><div class="bar-in"><span class="logo">CCGA Board Portal</span>
    <a href="https://www.cologrowers.com">cologrowers.com</a></div></div>
  <div class="wrap">
    <h1>Set up your password</h1>
    <p class="sub">For board members. Set a password for your own account, then sign in with it.</p>
    <div class="card">
      <form method="POST" action="/auth/setup">
        <label for="email">Board email</label>
        <input id="email" name="email" type="email" required autocomplete="email" value="${email || ''}" placeholder="you@cologrowers.com" autofocus>
        <div style="margin-top:.9rem;"><label for="password">Choose a password</label>
          <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></div>
        <div style="margin-top:.9rem;"><label for="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" required autocomplete="new-password"></div>
        ${error ? `<div class="err">${error}</div>` : ''}
        <div style="margin-top:1.1rem;"><button class="btn" type="submit">Set my password</button></div>
      </form>
      <p class="hint">Your email must already be on the board roster &mdash; ask the office if you are
        not sure. Prefer not to use a password? <a class="link" href="/">Use an email link instead</a>.</p>
    </div>
  </div>` + FOOT;
}

export function checkEmailPage(email) {
  return HEAD('Check your email') + `
  <div class="bar"><div class="bar-in"><span class="logo">CCGA Board Portal</span>
    <a href="https://www.cologrowers.com">cologrowers.com</a></div></div>
  <div class="wrap">
    <h1>Check your email</h1>
    <div class="card">
      <p>If <b>${email}</b> is on the board roster, a sign-in link is on its way. Open it on this
        device, and it will bring you straight into the portal.</p>
      <p class="hint">The link works once and expires in 24 hours. Didn't get it? Check spam, or
        <a class="link" href="/">try again</a> &mdash; and make sure the office has you on the roster.</p>
    </div>
  </div>` + FOOT;
}

export function noticePage(title, body) {
  return HEAD(title) + `
  <div class="bar"><div class="bar-in"><span class="logo">CCGA Board Portal</span>
    <a href="https://www.cologrowers.com">cologrowers.com</a></div></div>
  <div class="wrap"><h1>${title}</h1><div class="card">${body}</div></div>` + FOOT;
}

function portalChrome(member, inner) {
  const admin = member.is_admin ? ' <span class="pill">Admin</span>' : '';
  return HEAD('Portal') + `
  <div class="bar"><div class="bar-in"><a href="/portal" style="color:#fff;text-decoration:none;font-weight:600;">CCGA Board Portal</a>
    <span style="display:flex;gap:.8rem;align-items:center;">
      <a href="/account" style="color:#d3ae5c;text-decoration:none;font-size:.85rem;">Account</a>
      <form method="POST" action="/logout" style="margin:0;"><button class="btn" style="padding:.4rem .9rem;font-size:.85rem;">Sign out</button></form></span></div></div>
  <nav class="hqnav"><div class="hqnav-in">
    <a href="/portal#board-room">Board Room</a>
    <a href="/portal#decisions">Decisions</a>
    <a href="/portal#issues">Issues</a>
    <a href="/portal#handover">Handover</a>
    ${member.is_admin ? '<a href="/portal/admin">Manage</a>' : ''}
  </div></nav>
  <div class="wrap">
    <h1>Welcome, ${member.full_name}${admin}</h1>
    <p class="sub">${member.role ? member.role + ' &middot; ' : ''}Signed in as ${member.email}</p>
    ${inner}
  </div>` + FOOT;
}

// Account page: set or change your own password while signed in.
export function accountPage(member, { message, error } = {}) {
  const has = !!member.password_hash;
  const inner = `<p style="margin-bottom:1.2rem;"><a class="link" href="/portal">&larr; Back</a></p>
    <div class="card">
      <h2>${has ? 'Change your password' : 'Set a password'}</h2>
      <p style="color:#494540;margin-bottom:1rem;">${has
        ? 'You can sign in with this password or with an email link &mdash; your choice.'
        : 'You do not have a password yet. Set one and you can sign in with it, or keep using email links.'}</p>
      ${message ? `<p style="color:#334539;font-weight:600;margin-bottom:1rem;">${message}</p>` : ''}
      <form method="POST" action="/account/password">
        <label for="password">New password</label>
        <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters">
        <div style="margin-top:.9rem;"><label for="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" required autocomplete="new-password"></div>
        ${error ? `<div class="err">${error}</div>` : ''}
        <div style="margin-top:1.1rem;"><button class="btn" type="submit">${has ? 'Update password' : 'Set password'}</button></div>
      </form>
    </div>`;
  return portalChrome(member, inner);
}

// The Board Room: compose box + the running feed of board thoughts.
function boardRoom(member, notes) {
  const feed = notes.length
    ? notes.map((n) => {
        const canDelete = member.is_admin || n.author_email === member.email;
        const del = canDelete
          ? `<form method="POST" action="/portal/room/delete" class="note-del-form" style="margin:0 0 0 auto;"
               onsubmit="return confirm('Delete this thought?');">
               <input type="hidden" name="id" value="${esc(n.id)}">
               <button class="note-del" type="submit">delete</button></form>` : '';
        return `<div class="note-item">
          <div class="note-meta"><b>${esc(n.author_name)}</b>
            <time class="ts" datetime="${esc(n.created_at)}">${esc(n.created_at)}</time>${del}</div>
          <div class="note-body">${esc(n.body)}</div></div>`;
      }).join('')
    : `<div class="room-empty">No thoughts yet &mdash; be the first. Anything the board should see goes here.</div>`;

  return `<div class="card" id="board-room">
    <h2>The Board Room</h2>
    <p style="color:#5b564f;font-size:.9rem;margin-bottom:.9rem;">Midnight thoughts, questions, anything
      the board should see. Signed and kept &mdash; this is the board&rsquo;s shared table.</p>
    <form method="POST" action="/portal/room">
      <textarea name="body" rows="2" required placeholder="Share a thought with the board&hellip;"></textarea>
      <div style="margin-top:.6rem;"><button class="btn" type="submit">Post to the board</button></div>
    </form>
    <div style="margin-top:1.3rem;">${feed}</div>
    <script>document.querySelectorAll('time.ts').forEach(function(t){var d=new Date(t.getAttribute('datetime'));
      if(!isNaN(d))t.textContent=d.toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});});</script>
  </div>`;
}

// The Decisions log: record a motion/outcome, and the running record below.
function decisionsLog(member, decisions) {
  const feed = decisions.length
    ? decisions.map((d) => {
        const canDelete = member.is_admin || d.recorded_email === member.email;
        const del = canDelete
          ? `<form method="POST" action="/portal/decisions/delete" style="margin:0 0 0 auto;"
               onsubmit="return confirm('Delete this decision record?');">
               <input type="hidden" name="id" value="${esc(d.id)}">
               <button class="note-del" type="submit">delete</button></form>` : '';
        const when = fmtDate(d.decided_on) || fmtDate(d.created_at);
        const badgeClass = OUTCOME_BADGE[d.outcome] || 'b-ref';
        return `<div class="note-item">
          <div class="note-meta"><span class="badge ${badgeClass}">${esc(d.outcome)}</span>
            ${when ? `<span>${esc(when)}</span>` : ''}${del}</div>
          <div class="decision-title">${esc(d.title)}</div>
          ${d.detail ? `<div class="note-body" style="margin-top:.3rem;">${esc(d.detail)}</div>` : ''}
          <div style="font-size:.8rem;color:#8c867b;margin-top:.35rem;">Recorded by ${esc(d.recorded_by)}</div>
        </div>`;
      }).join('')
    : `<div class="room-empty">No decisions recorded yet. The board&rsquo;s official record of what it chose, and when.</div>`;

  return `<div class="card" id="decisions">
    <h2>Decisions</h2>
    <p style="color:#5b564f;font-size:.9rem;margin-bottom:.9rem;">The board&rsquo;s official record &mdash;
      motions, outcomes, and the date. Kept forever.</p>
    <details class="compose"><summary>Record a decision</summary><div class="compose-body">
    <form method="POST" action="/portal/decisions">
      <label for="d-title">The decision / motion</label>
      <input id="d-title" name="title" required maxlength="300" placeholder="e.g. Send the CORA request for checkoff financials">
      <div style="display:flex;gap:.8rem;flex-wrap:wrap;margin-top:.7rem;">
        <div style="flex:1;min-width:150px;"><label for="d-outcome">Outcome</label>
          <select id="d-outcome" name="outcome" style="width:100%;padding:.75rem .85rem;border:1px solid #c7c0b4;border-radius:6px;font:inherit;font-size:1rem;">
            <option>Passed</option><option>Failed</option><option>Tabled</option><option>In progress</option></select></div>
        <div style="flex:1;min-width:150px;"><label for="d-date">Date decided</label>
          <input id="d-date" name="decided_on" type="date" style="width:100%;"></div>
      </div>
      <div style="margin-top:.7rem;"><label for="d-detail">Detail (optional)</label>
        <textarea id="d-detail" name="detail" rows="2" placeholder="Context, vote count, who moved and seconded&hellip;"></textarea></div>
      <div style="margin-top:.7rem;"><button class="btn" type="submit">Record decision</button></div>
    </form></div></details>
    <div style="margin-top:1.3rem;">${feed}</div>
  </div>`;
}

// The private index — the board's headquarters: the Board Room and Decisions on
// top, then a dashboard of the board's open issues. Signed-in members only.
export function portalPage(member, documents, notes = [], decisions = []) {
  const STATUS = {
    active:    ['b-active',   'Active'],
    blocked:   ['b-blocked',  'Blocked'],
    progress:  ['b-progress', 'In Progress'],
    action:    ['b-action',   'Action Needed'],
    reference: ['b-ref',      'Reference'],
    done:      ['b-done',     'Closed'],
  };
  const badge = (s) => (STATUS[s] ? `<span class="badge ${STATUS[s][0]}">${STATUS[s][1]}</span>` : '');

  // Section order and headings. Any document whose category is unknown falls
  // under Reference, so nothing is ever dropped from the dashboard.
  const CATS = [
    ['checkoff',   'The Checkoff Reallocation Initiative'],
    ['operations', 'Operations & Access'],
    ['asks',       'Asks of the Board'],
    ['reference',  'Reference'],
    ['archive',    'Archive'],
  ];
  const known = new Set(CATS.map(([k]) => k));

  const adminLink = member.is_admin
    ? `<p style="margin-top:1.4rem;"><a class="link" href="/portal/admin">Manage board (members &amp; documents) &rarr;</a></p>` : '';

  const note = `<div class="note"><b>Your headquarters.</b> This lives in the cloud, not in any office &mdash;
    reachable from anywhere, private to the board, and never part of the public website.</div>`;

  const room = boardRoom(member, notes);
  const decisionsBlock = decisionsLog(member, decisions);

  if (!documents.length) {
    const empty = `<div class="card"><h2>No board issues loaded yet</h2>
      <p style="color:#494540;">${member.is_admin
        ? 'Load the board content from <a class="link" href="/portal/admin">Manage board</a> and this dashboard fills in automatically.'
        : 'The office is loading the board&rsquo;s material &mdash; check back shortly.'}</p></div>`;
    return portalChrome(member, note + room + decisionsBlock + empty + adminLink);
  }

  // Handover-kit documents render in their own section, not in the issue dashboard.
  const handoverDocs = documents.filter((d) => d.category === 'handover');
  const byCat = {};
  for (const d of documents) {
    if (d.category === 'handover') continue;
    const c = known.has(d.category) ? d.category : 'reference';
    (byCat[c] ||= []).push(d);
  }

  const tile = (d, onHero = false) =>
    `<a class="issue${onHero ? ' on-hero' : ''}" href="/portal/d/${encodeURIComponent(d.slug)}">
       <div class="top"><h3>${d.title}</h3>${badge(d.status)}</div>
       ${d.summary ? `<div class="sum">${d.summary}</div>` : ''}</a>`;

  let sections = '';
  for (const [key, label] of CATS) {
    const docs = byCat[key];
    if (!docs || !docs.length) continue;
    if (key === 'checkoff') {
      sections += `<div class="hero"><div class="sec-label">Top Priority</div>
        <h2>${label}</h2>
        <p>Moving half or more of the Colorado corn checkoff toward grower-directed priorities &mdash;
           the North Dakota precedent, the parallel plan for Colorado, the numbers, and the records request.</p>
        <div class="issue-grid" style="margin-top:1.1rem;">${docs.map((d) => tile(d, true)).join('')}</div></div>`;
    } else {
      sections += `<div class="sec-label">${label}</div>
        <div class="issue-grid">${docs.map((d) => tile(d)).join('')}</div>`;
    }
  }

  const dashLabel = `<div class="sec-label" id="issues" style="margin-top:2.2rem;">Board Issues &amp; Initiatives</div>`;

  // The Handover Kit — everything needed to run CCGA, for anyone taking the keys.
  const handover = `<div class="sec-label" id="handover" style="margin-top:2.4rem;">Running CCGA &mdash; The Handover Kit</div>
    <p style="color:#5b564f;font-size:.92rem;margin:-.3rem 0 .9rem;">Everything needed to operate the
      association. Hand this to anyone taking the keys.</p>`
    + (handoverDocs.length
      ? `<div class="issue-grid">${handoverDocs.map((d) => tile(d)).join('')}</div>`
      : `<div class="card"><p style="color:#8c867b;">The handover kit isn&rsquo;t loaded yet.${member.is_admin
          ? ' Load it from <a class="link" href="/portal/admin">Manage board</a>.' : ''}</p></div>`);

  return portalChrome(member, note + room + decisionsBlock + dashLabel + sections + handover + adminLink);
}

// Admin-only: manage the board roster and load documents.
export function adminPage(member, { message, members = [] } = {}) {
  const row = (m) => {
    const badges = (m.is_admin ? '<span class="pill">Admin</span> ' : '')
      + (m.password_hash ? '<span style="color:#6a8971;font-size:.8rem;">has password</span>' : '<span style="color:#8c867b;font-size:.8rem;">link only</span>')
      + (m.is_active ? '' : ' <span style="color:#a3301f;font-size:.8rem;">inactive</span>');
    const act = (a, label) => `<form method="POST" action="/portal/admin/member" style="display:inline;margin:0;">
      <input type="hidden" name="id" value="${m.id}"><input type="hidden" name="action" value="${a}">
      <button class="btn ghost sm" style="padding:.25rem .55rem;font-size:.78rem;">${label}</button></form>`;
    return `<tr><td style="padding:.4rem .5rem;border-bottom:1px solid #e0dbd1;">
        <b>${m.full_name || '(no name)'}</b><br><span style="color:#5b564f;font-size:.88rem;">${m.email}</span></td>
      <td style="padding:.4rem .5rem;border-bottom:1px solid #e0dbd1;">${badges}</td>
      <td style="padding:.4rem .5rem;border-bottom:1px solid #e0dbd1;white-space:nowrap;">
        ${m.is_admin ? act('demote', 'Remove admin') : act('promote', 'Make admin')}
        ${m.is_active ? act('deactivate', 'Deactivate') : act('activate', 'Reactivate')}
        ${m.password_hash ? `<form method="POST" action="/portal/admin/member" style="display:inline;margin:0;" onsubmit="return confirm('Reset this member&apos;s password? They will set a new one next time they sign in.');"><input type="hidden" name="id" value="${m.id}"><input type="hidden" name="action" value="reset_password"><button class="btn ghost sm" style="padding:.25rem .55rem;font-size:.78rem;">Reset password</button></form>` : ''}</td></tr>`;
  };
  const list = members.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:.92rem;">
        <tr><th style="text-align:left;padding:.3rem .5rem;color:#5b564f;">Member</th>
        <th style="text-align:left;padding:.3rem .5rem;color:#5b564f;">Access</th>
        <th style="text-align:left;padding:.3rem .5rem;color:#5b564f;"></th></tr>${members.map(row).join('')}</table>`
    : '<p style="color:#494540;">No members yet.</p>';

  const inner = `<p style="margin-bottom:1.2rem;"><a class="link" href="/portal">&larr; Back</a></p>
    ${message ? `<p style="color:#334539;font-weight:600;margin-bottom:1rem;">${message}</p>` : ''}
    <div class="card">
      <h2>Board members</h2>
      <p style="color:#494540;margin-bottom:1rem;">The roster &mdash; only these addresses can sign in.
        Add one per line: just an email, or <code>email, Full Name</code>.</p>
      <form method="POST" action="/portal/admin/members">
        <label for="emails">Add members</label>
        <textarea id="emails" name="emails" rows="5" placeholder="director@example.com, Jane Director&#10;another@example.com"></textarea>
        <div style="margin-top:.9rem;"><button class="btn" type="submit">Add to roster</button></div>
      </form>
      <div style="margin-top:1.4rem;">${list}</div>
    </div>
    <div class="card">
      <h2>Load documents</h2>
      <p style="color:#494540;margin-bottom:1rem;">Documents load automatically on deploy. To load or
        update them by hand, paste the documents JSON below.</p>
      <form method="POST" action="/portal/admin/load">
        <label for="docs">Documents JSON</label>
        <textarea id="docs" name="docs" rows="6" placeholder='[ { "slug": "...", "title": "...", "body_html": "...", "sort": 1 } ]'
          style="font-family:monospace;font-size:.85rem;"></textarea>
        <div style="margin-top:1rem;"><button class="btn" type="submit">Load documents</button></div>
      </form>
    </div>`;
  return portalChrome(member, inner);
}

// A single document. Body is trusted, board-authored HTML from the database.
export function documentPage(member, doc) {
  const inner = `<p style="margin-bottom:1.2rem;"><a class="link" href="/portal">&larr; All documents</a></p>
    <div class="card"><h2 style="font-size:1.5rem;margin-bottom:1rem;">${doc.title}</h2>
    <div class="doc">${doc.body_html}</div></div>`;
  return portalChrome(member, inner);
}
