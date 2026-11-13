// Transactional email via Resend. Single-use sign-in links to a closed roster —
// never a marketing platform (which would wrap the link in tracking redirects).
//
// Dev fallback: with no RESEND_API_KEY set, the link is logged to the console so
// the flow can be tested without sending real mail.
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function sendSignInLink(env, { to, fullName, link }) {
  const greeting = fullName ? `${fullName},` : 'Board member,';
  const text = [
    greeting, '',
    'Here is your sign-in link for the CCGA board portal:', '',
    link, '',
    'It signs you in as yourself, can be used once, and expires 24 hours after it was sent. Do not forward it.', '',
    'If you did not request this, you can ignore this message — no action will be taken.', '',
    'Colorado Corn Growers Association',
  ].join('\n');

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f3ee;font-family:'Segoe UI',Arial,sans-serif;color:#37342f;line-height:1.6;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;background:#fff;border:1px solid #e0dbd1;border-radius:8px;">
    <tr><td style="padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#334539;font-weight:700;">Colorado Corn Growers Association</p>
      <h1 style="margin:0 0 18px;font-size:20px;font-weight:600;color:#334539;">Board portal &mdash; sign-in link</h1>
      <p style="margin:0 0 20px;">${esc(greeting)}</p>
      <p style="margin:0 0 24px;">Use the button below to sign in to the board portal.</p>
      <p style="margin:0 0 24px;"><a href="${esc(link)}" style="display:inline-block;background:#334539;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">Sign in</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b564f;">Or paste this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${esc(link)}" style="color:#8a6a22;">${esc(link)}</a></p>
      <p style="margin:0;font-size:13px;color:#5b564f;">It can be used once and expires 24 hours after it was sent. Do not forward it. If you did not request it, ignore this message.</p>
    </td></tr>
  </table></body></html>`;

  if (!env.RESEND_API_KEY) {
    console.log('\n[dev] No RESEND_API_KEY set — sign-in link for ' + to + ':\n' + link + '\n');
    return { ok: true, dev: true };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM || 'CCGA Board <board@cologrowers.com>',
      to: [to],
      reply_to: env.MAIL_REPLY_TO || undefined,
      subject: 'Your CCGA board portal sign-in link',
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, status: res.status, body };
  }
  return { ok: true };
}
