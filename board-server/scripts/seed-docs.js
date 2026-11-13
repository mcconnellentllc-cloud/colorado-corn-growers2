// Load private board documents into the database from a JSON file.
//   node --experimental-sqlite scripts/seed-docs.js content/strategy-timelines.json
// File format: [{ "slug": "...", "title": "...", "body_html": "...", "sort": 1 }]
//
// The JSON files live under content/, which is gitignored: confidential board
// content goes into the server's database, never into the repository.
import { readFileSync } from 'node:fs';
import { openDb, upsertDocument } from '../src/db.js';

const path = process.argv[2];
if (!path) { console.error('usage: node --experimental-sqlite scripts/seed-docs.js <docs.json>'); process.exit(1); }

const docs = JSON.parse(readFileSync(path, 'utf8'));
if (!Array.isArray(docs)) { console.error('file must be a JSON array of documents'); process.exit(1); }

const db = openDb();
for (const d of docs) {
  if (!d.slug || !d.title || !d.body_html) { console.warn('skipping incomplete doc:', d.slug); continue; }
  upsertDocument(db, d);
  console.log('  loaded ' + d.slug);
}
console.log('Done.');
