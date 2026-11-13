// Seed or update the board roster from a JSON file.
//   node --experimental-sqlite scripts/seed.js roster.json
// roster.json: [{ "email": "...", "full_name": "...", "role": "...", "is_admin": true }]
import { readFileSync } from 'node:fs';
import { openDb, upsertMember, normalizeEmail } from '../src/db.js';

const path = process.argv[2];
if (!path) { console.error('usage: node --experimental-sqlite scripts/seed.js <roster.json>'); process.exit(1); }

const rows = JSON.parse(readFileSync(path, 'utf8'));
if (!Array.isArray(rows)) { console.error('roster file must be a JSON array'); process.exit(1); }

const db = openDb();
let n = 0;
for (const r of rows) {
  if (!r.email || !r.full_name) { console.warn('skipping row without email/full_name:', JSON.stringify(r)); continue; }
  upsertMember(db, {
    email: r.email, full_name: r.full_name, role: r.role ?? null,
    is_admin: r.is_admin ? 1 : 0, is_active: r.is_active === false ? 0 : 1,
  });
  console.log('  upserted ' + normalizeEmail(r.email) + (r.is_admin ? ' (admin)' : ''));
  n++;
}
console.log(`Done. ${n} member(s) in the roster.`);
