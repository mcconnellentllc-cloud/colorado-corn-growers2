// Transactional email via Resend.
//
// These are one-to-one, action-triggered messages to a closed roster, not
// marketing. They must not go through Constant Contact or any other bulk list
// tool: a sign-in link routed through a marketing platform picks up tracking
// redirects, unsubscribe handling, and list-scrubbing behaviour that are all
// wrong for a single-use credential.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export const MOTION_TITLE =
  'Authorize CCGA participation as amicus curiae in Public Service Company of Colorado v. Dryland Partners, LLC';

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "Monday, September 15, 2026 at 5:00 PM MDT" for a deadline ISO string. */
export function formatDeadline(iso, timeZone = 'America/Denver') {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(date);
}

function signInEmailBodies({ fullName, link, deadlineText }) {
  const greeting = fullName ? `${fullName},` : 'Board member,';

  const text = [
    greeting,
    '',
    'You have a board vote open on the following motion:',
    '',
    MOTION_TITLE,
    '',
    `Voting closes ${deadlineText}.`,
    '',
    'Use the link below to sign in, read the decision memo and the court order, and cast your vote:',
    '',
    link,
    '',
    'This link signs in as you. It can be used once, it expires 24 hours after it was sent, and it should not be forwarded to anyone.',
    '',
    'If you did not expect this message, you can ignore it and no action will be taken.',
    '',
    'Colorado Corn Growers Association',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f2;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#222;line-height:1.6;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e2df;border-radius:6px;">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4a7c59;font-weight:700;">Colorado Corn Growers Association</p>
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#1a1a1a;">Board vote &mdash; sign-in link</h1>

          <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>

          <p style="margin:0 0 8px;">You have a board vote open on the following motion:</p>
          <p style="margin:0 0 16px;padding:12px 16px;background:#f7f7f5;border-left:3px solid #4a7c59;font-size:15px;">${escapeHtml(MOTION_TITLE)}</p>

          <p style="margin:0 0 20px;">Voting closes <strong>${escapeHtml(deadlineText)}</strong>.</p>

          <p style="margin:0 0 20px;">
            <a href="${escapeHtml(link)}" style="display:inline-block;background:#2c5530;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;font-weight:600;">Sign in and vote</a>
          </p>

          <p style="margin:0 0 20px;font-size:13px;color:#666;">If the button does not work, paste this address into your browser:<br>
            <span style="word-break:break-all;color:#2c5530;">${escapeHtml(link)}</span>
          </p>

          <p style="margin:0 0 16px;padding-top:16px;border-top:1px solid #eeeeec;font-size:13px;color:#666;">
            This link signs in as you. It can be used <strong>once</strong>, it <strong>expires 24 hours</strong> after it was sent, and it <strong>should not be forwarded</strong> to anyone.
          </p>

          <p style="margin:0;font-size:13px;color:#666;">If you did not expect this message, you can ignore it and no action will be taken.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
}

/**
 * Send one sign-in link. Returns { ok, id } or { ok: false, error } — never
 * throws, so a broadcast can report per-recipient status instead of aborting
 * partway through the roster.
 */
export async function sendSignInEmail(env, { to, fullName, link, deadlineIso }) {
  const deadlineText = formatDeadline(deadlineIso, env.VOTE_TIMEZONE || 'America/Denver');
  const { text, html } = signInEmailBodies({ fullName, link, deadlineText });

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        reply_to: env.MAIL_REPLY_TO || undefined,
        to: [to],
        subject: 'CCGA board vote - sign-in link',
        text,
        html,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        error: payload?.message || `resend_http_${response.status}`,
      };
    }

    return { ok: true, id: payload?.id ?? null };
  } catch (err) {
    return { ok: false, error: err?.message || 'network_error' };
  }
}
