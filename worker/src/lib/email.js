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

// ---------------------------------------------------------------------------
// Mailing list email.
//
// These go to a public list rather than the board roster, which changes two
// things. They are sent from LIST_MAIL_FROM — a separate sending identity, so
// a newsletter's bounces and complaints can never damage the reputation that
// carries board sign-in links. And every one carries List-Unsubscribe headers,
// which Gmail and Yahoo require of bulk senders and which put a one-click
// unsubscribe in the mail client's own chrome.
// ---------------------------------------------------------------------------

function listFrom(env) {
  return env.LIST_MAIL_FROM || env.MAIL_FROM;
}

async function sendListEmail(env, { to, subject, text, html, unsubscribeUrl }) {
  const headers = unsubscribeUrl
    ? {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }
    : undefined;

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: listFrom(env),
        reply_to: env.MAIL_REPLY_TO || undefined,
        to: [to],
        subject,
        text,
        html,
        headers,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: payload?.message || `resend_http_${response.status}` };
    }
    return { ok: true, id: payload?.id };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function shell(bodyHtml, footerHtml) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f3ee;
    font-family:Georgia,'Times New Roman',serif;color:#37342f;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3ded4;
       border-radius:8px;padding:32px;">
    ${bodyHtml}
  </div>
  <div style="max-width:560px;margin:16px auto 0;font-family:Arial,sans-serif;font-size:12px;
       color:#5b564f;line-height:1.5;">
    ${footerHtml}
  </div>
</body></html>`;
}

/** The one message a sign-up produces. Nothing else goes out until it is clicked. */
export async function sendConfirmEmail(env, { to, fullName, link }) {
  const greeting = fullName ? `${escapeHtml(fullName)},` : 'Hello,';
  const text = [
    fullName ? `${fullName},` : 'Hello,',
    '',
    'Please confirm you want updates from the Colorado Corn Growers Association.',
    '',
    link,
    '',
    'If you did not ask for this, ignore this message. Nothing will be sent to this',
    'address unless the link above is clicked.',
    '',
    'Colorado Corn Growers Association',
    'PO Box 340, Burlington, CO 80807',
  ].join('\n');

  const html = shell(
    `<p style="margin:0 0 16px;font-size:17px;">${greeting}</p>
     <p style="margin:0 0 20px;font-size:16px;line-height:1.55;">Please confirm you want updates
       from the Colorado Corn Growers Association &mdash; deadlines, program changes and what we
       are working on in Denver and Washington.</p>
     <p style="margin:0 0 24px;">
       <a href="${escapeHtml(link)}" style="display:inline-block;background:#334539;color:#ffffff;
          text-decoration:none;padding:12px 22px;border-radius:6px;font-family:Arial,sans-serif;
          font-size:15px;">Confirm my email</a></p>
     <p style="margin:0;font-size:14px;color:#5b564f;line-height:1.5;">If you did not ask for this,
       ignore this message. Nothing will be sent to this address unless that link is clicked.</p>`,
    'Colorado Corn Growers Association &middot; PO Box 340, Burlington, CO 80807',
  );

  return sendListEmail(env, {
    to,
    subject: 'Confirm your email - Colorado Corn Growers',
    text,
    html,
  });
}

/** One campaign to one subscriber. */
export async function sendCampaignEmail(env, { to, subject, bodyHtml, bodyText, unsubscribeUrl }) {
  const text = `${bodyText}\n\n---\nColorado Corn Growers Association\nPO Box 340, Burlington, CO 80807\n\nUnsubscribe: ${unsubscribeUrl}`;

  const html = shell(
    bodyHtml,
    `Colorado Corn Growers Association &middot; PO Box 340, Burlington, CO 80807<br>
     You are receiving this because you confirmed your email address.
     <a href="${escapeHtml(unsubscribeUrl)}" style="color:#5b564f;">Unsubscribe</a>.`,
  );

  return sendListEmail(env, { to, subject, text, html, unsubscribeUrl });
}
