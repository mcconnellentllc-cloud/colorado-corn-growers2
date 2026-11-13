// Auto-load board documents from a private file the server is given at deploy —
// a Render "Secret File" (mounted at /etc/secrets/documents.json by default).
//
// The documents live in that private file on the server, NEVER in the
// repository. The repo carries only this loader. On every boot the server reads
// the file and upserts the documents, so the board content is part of every
// deploy automatically — no manual loading, and nothing confidential in the
// public repo.
import { readFileSync, existsSync } from 'node:fs';
import { upsertDocument } from './db.js';

export function loadBoardDocuments(db) {
  const path = process.env.CONTENT_FILE || '/etc/secrets/documents.json';
  if (!existsSync(path)) {
    console.log('[content] no documents file at ' + path + ' — skipping (add it as a Render Secret File).');
    return;
  }
  try {
    const docs = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(docs)) throw new Error('documents file is not a JSON array');
    let n = 0;
    for (const d of docs) {
      if (d && d.slug && d.title && d.body_html) {
        upsertDocument(db, { slug: d.slug, title: d.title, body_html: d.body_html, sort: d.sort || 0 });
        n++;
      }
    }
    console.log('[content] loaded ' + n + ' document(s) from ' + path);
  } catch (e) {
    console.error('[content] could not load documents from ' + path + ':', e.message);
  }
}
