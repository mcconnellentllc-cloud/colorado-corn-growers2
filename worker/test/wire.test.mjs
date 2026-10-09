// Wire ingest tests. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

import { extractText, htmlToText, parseHeaders, splitMessage } from '../src/lib/mime.js';
import { cleanSubject, createLead, extractUrls, isPrimary, originalSender, storeEmail, stripForwardChrome } from '../src/lib/wire.js';

// --- a minimal D1 shim over node:sqlite -----------------------------------
function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  for (const stmt of schema.split(/;\s*\n/)) {
    // Strip leading comment lines rather than skipping the whole chunk -- every
    // table here is preceded by a comment block, so skipping on a leading "--"
    // silently created an empty database.
    const s = stmt.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').trim();
    if (!s) continue;
    db.exec(s);
  }
  return {
    DB: {
      prepare(sql) {
        let params = [];
        return {
          bind(...args) { params = args.map((v) => (v === undefined ? null : v)); return this; },
          async first() { return db.prepare(sql).get(...params) ?? null; },
          async all() { return { results: db.prepare(sql).all(...params) }; },
          async run() { return db.prepare(sql).run(...params); },
        };
      },
    },
  };
}

// A forwarded Wiesemeyer-shaped message, multipart with a quoted-printable part.
const RAW = [
  'Message-ID: <abc123@mail.example>',
  'From: Dave Cure <dave@example.com>',
  'To: wire@cologrowers.com',
  'Subject: Fwd: EPA Sends Biofuel Reallocation Plan to OMB',
  'Date: Tue, 6 Oct 2026 07:23:00 -0600',
  'Content-Type: multipart/alternative; boundary="XX"',
  '',
  '--XX',
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '---------- Forwarded message ---------',
  'From: Jim Wiesemeyer <wiesemeyer-gmail.com@shared1.ccsend.com>',
  'Date: Tue, Oct 6, 2026',
  'Subject: EPA Sends Biofuel Reallocation Plan to OMB',
  '',
  'EPA has sent the plan to OMB. Details at',
  'https://www.epa.gov/renewable-fuel-standard-program/notice =',
  'and some tracking junk https://r20.rs6.net/tn.jsp?utm_source=3Dx',
  '',
  '--XX--',
  '',
].join('\r\n');

test('splitMessage separates headers from body', () => {
  const { headers, body } = splitMessage(RAW);
  assert.equal(headers.subject, 'Fwd: EPA Sends Biofuel Reallocation Plan to OMB');
  assert.match(body, /Forwarded message/);
});

test('parseHeaders unfolds continuation lines', () => {
  const h = parseHeaders('Subject: a very\r\n  long subject\r\nFrom: x@y.z');
  assert.equal(h.subject, 'a very long subject');
  assert.equal(h.from, 'x@y.z');
});

test('extractText decodes the quoted-printable text part', () => {
  const text = extractText(RAW);
  assert.match(text, /EPA has sent the plan to OMB/);
  // The soft line break "=\r\n" must not survive as a literal "="
  assert.match(text, /epa\.gov\/renewable-fuel-standard-program\/notice\s/);
  assert.doesNotMatch(text, /notice =/);
});

test('cleanSubject drops the forward prefix', () => {
  assert.equal(cleanSubject('Fwd: Corn Stocks Shock'), 'Corn Stocks Shock');
  assert.equal(cleanSubject('RE: FW: thing'), 'thing', 'stacked prefixes should all come off');
  assert.equal(cleanSubject('Fwd: Re: Fwd: Corn Stocks'), 'Corn Stocks');
});

test('originalSender finds who actually wrote it', () => {
  const who = originalSender(extractText(RAW));
  assert.match(who, /Jim Wiesemeyer/);
});

test('extractUrls keeps real links and drops tracking junk', () => {
  const urls = extractUrls(extractText(RAW));
  assert.ok(urls.some((u) => u.includes('epa.gov')), 'should keep the EPA link');
  assert.ok(!urls.some((u) => u.includes('rs6.net')), 'should drop the tracker');
  assert.ok(!urls.some((u) => u.includes('utm_')), 'should drop utm links');
});

test('isPrimary recognises agencies and rejects newsletters', () => {
  assert.equal(isPrimary('https://www.epa.gov/x'), true);
  assert.equal(isPrimary('https://fsa.usda.gov/y'), true);
  assert.equal(isPrimary('https://leg.colorado.gov/bills/SB26-065'), true);
  assert.equal(isPrimary('https://www.profarmer.com/analysis'), false);
  assert.equal(isPrimary('not a url'), false);
});

test('stripForwardChrome removes the header block', () => {
  const out = stripForwardChrome(extractText(RAW));
  assert.doesNotMatch(out, /^From:/m);
  assert.match(out, /EPA has sent the plan/);
});

test('storeEmail records the original sender and dedupes by Message-ID', async () => {
  const env = makeEnv();
  const first = await storeEmail(env, { raw: RAW, from: 'dave@example.com', to: 'wire@cologrowers.com' });
  assert.equal(first.duplicate, false);

  const again = await storeEmail(env, { raw: RAW, from: 'dave@example.com', to: 'wire@cologrowers.com' });
  assert.equal(again.duplicate, true, 'the same Message-ID must not create a second row');
  assert.equal(again.id, first.id);

  const row = await env.DB.prepare('SELECT * FROM wire_emails WHERE id = ?').bind(first.id).first();
  assert.match(row.original_from, /Wiesemeyer/);
  assert.equal(row.status, 'new');
});

test('createLead attaches the primary source and starts as a candidate', async () => {
  const env = makeEnv();
  const stored = await storeEmail(env, { raw: RAW, from: 'dave@example.com', to: 'wire@cologrowers.com' });
  const lead = await createLead(env, { emailId: stored.id, subject: stored.subject, text: stored.text });

  assert.equal(lead.primary.length, 1);
  const row = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(lead.id).first();
  assert.equal(row.status, 'candidate');
  assert.match(row.source_url, /epa\.gov/);
  assert.equal(row.source_domain, 'epa.gov');
  assert.equal(row.source_fetched_at, null);
});

test('a lead cannot be marked ready without a fetched source', async () => {
  const env = makeEnv();
  const stored = await storeEmail(env, { raw: RAW, from: 'dave@example.com', to: 'wire@cologrowers.com' });
  const lead = await createLead(env, { emailId: stored.id, subject: stored.subject, text: stored.text });

  // This is the structural half of the no-plagiarism rule. The shim's run() is
  // async, so this has to be a rejection assertion, not a throw assertion.
  await assert.rejects(
    env.DB.prepare("UPDATE leads SET status = 'ready' WHERE id = ?").bind(lead.id).run(),
    /CHECK|constraint/i,
    'the CHECK constraint must refuse a ready lead with no fetched source',
  );

  // And it must allow it once the source has actually been fetched.
  await env.DB.prepare("UPDATE leads SET source_fetched_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), lead.id).run();
  await env.DB.prepare("UPDATE leads SET status = 'ready' WHERE id = ?").bind(lead.id).run();
  const row = await env.DB.prepare('SELECT status FROM leads WHERE id = ?').bind(lead.id).first();
  assert.equal(row.status, 'ready');
});

test('htmlToText keeps hrefs so links survive', () => {
  const out = htmlToText('<p>See <a href="https://www.fsa.usda.gov/x">the notice</a>.</p>');
  assert.match(out, /fsa\.usda\.gov\/x/);
});

test('an HTML email body flattens to text with its links intact', () => {
  const html = '<html><body><p>EPA sent the plan to OMB.</p>'
    + '<p>See <a href="https://www.epa.gov/rfs/notice">the notice</a>.</p></body></html>';
  const out = htmlToText(html);
  assert.match(out, /EPA sent the plan to OMB/);
  assert.match(out, /epa\.gov\/rfs\/notice/, 'the href must survive flattening');
  assert.doesNotMatch(out, /<p>|<a /, 'no markup should remain');
  assert.ok(extractUrls(out).some((u) => u.includes('epa.gov')), 'the URL must still be extractable');
});
