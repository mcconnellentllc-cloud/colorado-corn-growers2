// The wire: turning a forwarded policy newsletter into assignments.
//
// The rule this file exists to enforce, stated once so nobody has to infer it:
//
//   The email tells us WHAT HAPPENED. It is never the thing we publish.
//
// Inbound newsletters are paid third-party analysis forwarded to us. We store
// them so a human can read them, we pull out the primary sources they point at,
// and then we go and read those sources ourselves. A lead cannot reach 'ready'
// without a fetched primary source, and the schema has a CHECK constraint
// saying so, because a rule that lives only in a comment is a rule that gets
// forgotten at 2am by whoever is on deadline.

import { uuid } from './crypto.js';
import { nowIso, normalizeEmail } from './db.js';
import { extractText, parseHeaders, splitMessage } from './mime.js';

// Primary sources worth chasing. A URL on one of these is something we can
// read, verify and quote; anything else is a pointer back into somebody's
// newsletter or a paywall.
export const PRIMARY_DOMAINS = [
  'usda.gov', 'fsa.usda.gov', 'rma.usda.gov', 'ers.usda.gov', 'nass.usda.gov',
  'aphis.usda.gov', 'epa.gov', 'federalregister.gov', 'congress.gov',
  'agriculture.house.gov', 'agriculture.senate.gov', 'gao.gov', 'cbo.gov',
  'whitehouse.gov', 'treasury.gov', 'irs.gov', 'colorado.gov', 'leg.colorado.gov',
  'tax.colorado.gov', 'cda.state.co.us',
];

// Tracking wrappers and list plumbing. A link through one of these tells us
// nothing about where the story actually lives.
const JUNK_URL = /(ccsend|constantcontact|list-manage|mailchi|utm_|unsubscribe|\.gif|\.png|\.jpg)/i;

export function isPrimary(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return PRIMARY_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

export function extractUrls(text) {
  const found = new Set();
  for (const m of String(text ?? '').matchAll(/https?:\/\/[^\s<>()"'\]]+/gi)) {
    const url = m[0].replace(/[.,;:)]+$/, '');
    if (!JUNK_URL.test(url)) found.add(url);
  }
  return [...found];
}

/**
 * Pull the original sender out of a forwarded block.
 *
 * Outlook and Gmail both write some variant of:
 *   ---------- Forwarded message ---------
 *   From: Jim Wiesemeyer <someone@example.com>
 *
 * Attribution matters here, so we record who actually wrote the thing rather
 * than only who forwarded it to us.
 */
export function originalSender(text) {
  const block = String(text ?? '').slice(0, 4000);
  const m = block.match(/Forwarded message[\s\S]{0,200}?From:\s*([^\n\r]+)/i)
    || block.match(/^\s*From:\s*([^\n\r]+)/im);
  return m ? m[1].trim().slice(0, 200) : null;
}

/**
 * Strip the forwarding chrome so stored text starts at the actual content.
 * Cosmetic only -- it does not make the body any more publishable.
 */
export function stripForwardChrome(text) {
  let out = String(text ?? '');
  const marker = out.search(/-{2,}\s*Forwarded message\s*-{2,}/i);
  if (marker !== -1) out = out.slice(marker);
  return out
    .replace(/-{2,}\s*Forwarded message\s*-{2,}/i, '')
    .replace(/^\s*(From|Date|Subject|To|Cc|Reply-To):[^\n]*\n/gim, '')
    .trim();
}

/** The subject line, with forwarding prefixes removed. */
export function cleanSubject(subject) {
  return String(subject ?? '')
    // Strip repeated prefixes: real forwards arrive as "Fwd: Re: Fwd: ...".
    .replace(/^(\s*(re|fw|fwd)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * Store an inbound message. Returns { id, duplicate }.
 *
 * Message-ID is the dedupe key: a newsletter that reaches us twice because two
 * directors forwarded it should produce one row, not two assignments.
 */
export async function storeEmail(env, { raw, from, to }) {
  const { headers } = splitMessage(raw);
  const text = extractText(raw);
  const messageId = (headers['message-id'] || '').trim() || null;

  if (messageId) {
    const existing = await env.DB.prepare('SELECT id FROM wire_emails WHERE message_id = ?')
      .bind(messageId).first();
    if (existing) return { id: existing.id, duplicate: true };
  }

  const id = uuid();
  const subject = cleanSubject(headers.subject);
  const sentAt = headers.date ? new Date(headers.date).toISOString() : null;

  await env.DB.prepare(
    `INSERT INTO wire_emails
       (id, message_id, from_address, to_address, subject, sent_at, received_at,
        original_from, body_text, raw_size, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
  )
    .bind(
      id,
      messageId,
      normalizeEmail(from),
      normalizeEmail(to),
      subject,
      Number.isNaN(Date.parse(sentAt)) ? null : sentAt,
      nowIso(),
      originalSender(text),
      stripForwardChrome(text).slice(0, 60000),
      String(raw ?? '').length,
    )
    .run();

  return { id, duplicate: false, subject, text };
}

/**
 * Derive one assignment from a stored email.
 *
 * The topic is the subject line, which is a factual description of what
 * happened and the one piece of the email we repeat -- and even that is a
 * starting point for a human, not copy for the site. Everything publishable
 * comes later, from the primary source.
 */
export async function createLead(env, { emailId, subject, text }) {
  const urls = extractUrls(text);
  const primary = urls.filter(isPrimary);
  const id = uuid();
  const now = nowIso();

  await env.DB.prepare(
    `INSERT INTO leads
       (id, email_id, topic, source_url, source_domain, source_fetched_at,
        source_title, colorado_angle, status, created_at, updated_at, notes)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 'candidate', ?, ?, ?)`,
  )
    .bind(
      id,
      emailId,
      subject || '(no subject)',
      primary[0] || null,
      primary[0] ? new URL(primary[0]).hostname.replace(/^www\./, '') : null,
      now,
      now,
      urls.length ? `links found: ${urls.length}, primary: ${primary.length}` : 'no links found',
    )
    .run();

  return { id, urls, primary };
}

export async function recentLeads(env, limit = 50) {
  const { results } = await env.DB.prepare(
    `SELECT l.*, e.subject AS email_subject, e.original_from, e.received_at
       FROM leads l LEFT JOIN wire_emails e ON e.id = l.email_id
      ORDER BY l.created_at DESC LIMIT ?`,
  ).bind(limit).all();
  return results ?? [];
}
