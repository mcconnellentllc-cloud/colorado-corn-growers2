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
</style></head><body>`;

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

// The private index. Served only to a signed-in board member.
export function portalPage(member, documents) {
  const note = `<div class="note"><b>This area is genuinely private.</b> Everything here is served
    from the board server only after you sign in &mdash; it is never part of the public website,
    and the text is stored in the server's database, not in the code repository.</div>`;

  let list;
  if (!documents.length) {
    list = `<div class="card"><h2>Board documents</h2><p style="color:#494540;">No documents yet.
      ${member.is_admin ? 'Use <a class="link" href="/portal/admin">Manage board</a>.'
        : 'The office loads confidential material here &mdash; it lives behind this sign-in, not on the public site.'}</p></div>`;
  } else {
    list = `<div class="card"><h2>Board documents</h2>` + documents.map((d) =>
      `<p style="margin:.5rem 0;"><a class="link" href="/portal/d/${encodeURIComponent(d.slug)}">${d.title}</a>
       <span style="color:#8c867b;font-size:.85rem;"> &middot; updated ${d.updated_at.slice(0, 10)}</span></p>`
    ).join('') + `</div>`;
  }
  const adminLink = member.is_admin
    ? `<p style="margin-top:.4rem;"><a class="link" href="/portal/admin">Manage board (members &amp; documents) &rarr;</a></p>` : '';
  return portalChrome(member, note + list + adminLink);
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
        ${m.is_active ? act('deactivate', 'Deactivate') : act('activate', 'Reactivate')}</td></tr>`;
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
