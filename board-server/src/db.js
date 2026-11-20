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
  // Migration: add password_hash to an existing members table that predates it.
  try { db.exec('ALTER TABLE members ADD COLUMN password_hash TEXT'); } catch (e) { /* already present */ }
  // Migration: dashboard fields on documents (added after the first release).
  try { db.exec('ALTER TABLE documents ADD COLUMN category TEXT'); } catch (e) { /* already present */ }
  try { db.exec('ALTER TABLE documents ADD COLUMN status TEXT'); } catch (e) { /* already present */ }
  try { db.exec('ALTER TABLE documents ADD COLUMN summary TEXT'); } catch (e) { /* already present */ }
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

/* ---- the board room (notes / midnight thoughts) ---- */

export function addNote(db, { authorEmail, authorName, body }) {
  const id = uuid();
  db.prepare('INSERT INTO notes (id, author_email, author_name, body) VALUES (?, ?, ?, ?)')
    .run(id, authorEmail, authorName, body);
  return id;
}

export function listNotes(db, limit = 200) {
  return db.prepare('SELECT id, author_email, author_name, body, created_at FROM notes ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
}

export function deleteNote(db, id) {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
}

/* ---- the decisions log ---- */

export function addDecision(db, { title, detail = null, outcome, decidedOn = null, recordedBy, recordedEmail }) {
  const id = uuid();
  db.prepare('INSERT INTO decisions (id, title, detail, outcome, decided_on, recorded_by, recorded_email) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, title, detail, outcome, decidedOn, recordedBy, recordedEmail);
  return id;
}

export function listDecisions(db, limit = 300) {
  return db.prepare('SELECT id, title, detail, outcome, decided_on, recorded_by, recorded_email, created_at FROM decisions ORDER BY COALESCE(decided_on, created_at) DESC, created_at DESC LIMIT ?').all(limit);
}

export function deleteDecision(db, id) {
  db.prepare('DELETE FROM decisions WHERE id = ?').run(id);
}

/* ---- membership list (sponsorship targets) ---- */

export function addMember(db, { name, farm = null, email = null, phone = null, town = null, status = null, stage = null, notes = null, addedBy = null }) {
  const id = uuid();
  db.prepare('INSERT INTO membership (id, name, farm, email, phone, town, status, stage, notes, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, farm, email, phone, town, status, stage, notes, addedBy);
  return id;
}

export function listMembership(db, limit = 2000) {
  return db.prepare('SELECT * FROM membership ORDER BY name COLLATE NOCASE LIMIT ?').all(limit);
}

export function updateMemberStage(db, id, stage) {
  db.prepare('UPDATE membership SET stage = ? WHERE id = ?').run(stage, id);
}

export function deleteMember(db, id) {
  db.prepare('DELETE FROM membership WHERE id = ?').run(id);
}

export function membershipStats(db) {
  return db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN stage='Committed' THEN 1 ELSE 0 END) AS committed, SUM(CASE WHEN stage='Interested' THEN 1 ELSE 0 END) AS interested FROM membership").get();
}

/* ---- officials survey (public "trusted source" responses) ---- */

export function addSurveyResponse(db, { officeKey = null, officeLabel = null, respondent = null, role = null, email = null, phone = null, answer = null, interests = null, comments = null, ip = null }) {
  const id = uuid();
  db.prepare('INSERT INTO survey_responses (id, office_key, office_label, respondent, role, email, phone, answer, interests, comments, created_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, officeKey, officeLabel, respondent, role, email, phone, answer, interests, comments, ip);
  return id;
}

export function listSurveyResponses(db, limit = 2000) {
  return db.prepare('SELECT * FROM survey_responses ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
}

export function deleteSurveyResponse(db, id) {
  db.prepare('DELETE FROM survey_responses WHERE id = ?').run(id);
}

export function surveyStats(db) {
  return db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN answer='Yes' THEN 1 ELSE 0 END) AS yes, SUM(CASE WHEN answer='Maybe' THEN 1 ELSE 0 END) AS maybe FROM survey_responses").get();
}

/* ---- audit ---- */

export function audit(db, { actorEmail = null, action, detail = null, ip = null }) {
  db.prepare('INSERT INTO audit_log (id, actor_email, action, detail, ip) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), actorEmail, action, detail, ip);
}

/* ---- documents (private board content, stored in the DB, never in the repo) ---- */

export function listDocuments(db) {
  return db.prepare('SELECT slug, title, category, status, summary, sort, updated_at FROM documents ORDER BY sort, title').all();
}

export function getDocument(db, slug) {
  return db.prepare('SELECT * FROM documents WHERE slug = ?').get(slug) ?? null;
}

export function upsertDocument(db, { slug, title, body_html, category = null, status = null, summary = null, sort = 0 }) {
  const existing = db.prepare('SELECT id FROM documents WHERE slug = ?').get(slug);
  if (existing) {
    db.prepare('UPDATE documents SET title = ?, body_html = ?, category = ?, status = ?, summary = ?, sort = ?, updated_at = ? WHERE id = ?')
      .run(title, body_html, category, status, summary, sort, nowIso(), existing.id);
    return;
  }
  db.prepare('INSERT INTO documents (id, slug, title, body_html, category, status, summary, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uuid(), slug, title, body_html, category, status, summary, sort, nowIso());
}

/* ---- passwords ---- */

export function setMemberPassword(db, memberId, passwordHash) {
  db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(passwordHash, memberId);
}

export function clearMemberPassword(db, memberId) {
  db.prepare('UPDATE members SET password_hash = NULL WHERE id = ?').run(memberId);
}

export function listMembers(db) {
  return db.prepare('SELECT id, email, full_name, role, is_admin, is_active, password_hash FROM members ORDER BY full_name').all();
}
