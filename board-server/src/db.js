// SQLite storage on Node's built-in node:sqlite (synchronous).
//
// The database is a single file. On Render it must live on a persistent disk
// (see render.yaml / README) so it survives restarts and redeploys.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uuid } from './crypto.js';

const here = dirname(fileURLToPath(import.meta.url));

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function isoFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Open (and if needed create) the database, applying the schema. */
export function openDb(dbPath) {
  const path = dbPath || process.env.DB_PATH || join(here, '..', 'data', 'board.db');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(join(here, '..', 'schema.sql'), 'utf8'));
  return db;
}

/* ---- members (the roster) ---- */

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function findMemberByEmail(db, email) {
  return db.prepare('SELECT * FROM members WHERE email = ?').get(normalizeEmail(email)) ?? null;
}

export function findMemberById(db, id) {
  return db.prepare('SELECT * FROM members WHERE id = ?').get(id) ?? null;
}

export function upsertMember(db, { email, full_name, role = null, is_admin = 0, is_active = 1 }) {
  const e = normalizeEmail(email);
  const existing = findMemberByEmail(db, e);
  if (existing) {
    db.prepare('UPDATE members SET full_name = ?, role = ?, is_admin = ?, is_active = ? WHERE id = ?')
      .run(full_name, role, is_admin ? 1 : 0, is_active ? 1 : 0, existing.id);
    return findMemberById(db, existing.id);
  }
  const id = uuid();
  db.prepare('INSERT INTO members (id, email, full_name, role, is_admin, is_active) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, e, full_name, role, is_admin ? 1 : 0, is_active ? 1 : 0);
  return findMemberById(db, id);
}

export function memberCount(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM members').get().n;
}

/* ---- audit ---- */

export function audit(db, { actorEmail = null, action, detail = null, ip = null }) {
  db.prepare('INSERT INTO audit_log (id, actor_email, action, detail, ip) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), actorEmail, action, detail, ip);
}

/* ---- documents (private board content, stored in the DB, never in the repo) ---- */

export function listDocuments(db) {
  return db.prepare('SELECT slug, title, updated_at FROM documents ORDER BY sort, title').all();
}

export function getDocument(db, slug) {
  return db.prepare('SELECT * FROM documents WHERE slug = ?').get(slug) ?? null;
}

export function upsertDocument(db, { slug, title, body_html, sort = 0 }) {
  const existing = db.prepare('SELECT id FROM documents WHERE slug = ?').get(slug);
  if (existing) {
    db.prepare('UPDATE documents SET title = ?, body_html = ?, sort = ?, updated_at = ? WHERE id = ?')
      .run(title, body_html, sort, nowIso(), existing.id);
    return;
  }
  db.prepare('INSERT INTO documents (id, slug, title, body_html, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuid(), slug, title, body_html, sort, nowIso());
}
