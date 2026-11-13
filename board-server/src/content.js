// Auto-load board documents from an encrypted bundle committed with the code.
//
// The bundle (content/documents.enc) is AES-256-GCM ciphertext — meaningless
// without the key, so it is safe in a public repository. The key lives only in
// the CONTENT_KEY environment variable on the server, never in the repo. On
// every boot the server decrypts the bundle and upserts the documents, so the
// canonical board content ships with the code and loads itself — no manual step.
import { readFileSync, existsSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { upsertDocument } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));

export function loadEncryptedDocuments(db, keyHex) {
  const file = join(here, '..', 'content', 'documents.enc');
  if (!keyHex) { console.log('[content] CONTENT_KEY not set — skipping encrypted bundle.'); return; }
  if (!existsSync(file)) { console.log('[content] no documents.enc bundle found — skipping.'); return; }
  try {
    const key = Buffer.from(keyHex.trim(), 'hex');
    if (key.length !== 32) throw new Error('CONTENT_KEY must be 32 bytes (64 hex chars)');
    const [v, ivB64, tagB64, ctB64] = readFileSync(file, 'utf8').trim().split('.');
    if (v !== 'v1') throw new Error('unexpected bundle format');
    const dec = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    dec.setAuthTag(Buffer.from(tagB64, 'base64'));
    const json = Buffer.concat([dec.update(Buffer.from(ctB64, 'base64')), dec.final()]).toString('utf8');
    const docs = JSON.parse(json);
    let n = 0;
    for (const d of docs) {
      if (d && d.slug && d.title && d.body_html) {
        upsertDocument(db, { slug: d.slug, title: d.title, body_html: d.body_html, sort: d.sort || 0 });
        n++;
      }
    }
    console.log('[content] loaded ' + n + ' document(s) from the encrypted bundle');
  } catch (e) {
    console.error('[content] could not load documents.enc:', e.message);
  }
}
