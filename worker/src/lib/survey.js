/* Grower survey storage and tallying.
 *
 * The rule this module exists to enforce: responses go in from anyone, and
 * come out only to the board. There is deliberately no function here that
 * returns a response to an unauthenticated caller, not even a running count.
 * A public tally invites exactly the behaviour a small poll cannot survive.
 */

import { uuid } from './crypto.js';

/* Surveys the API will accept. An unknown survey id is rejected rather than
 * silently stored, so a typo in the page shows up immediately instead of
 * scattering responses nobody reads. */
export const SURVEYS = {
  'annual-meeting-2027': {
    locations: ['sterling', 'yuma', 'burlington', 'other'],
    topics: ['fsa-programs', 'marketing-ai', 'banking'],
  },
};

const MAX_COMMENT = 4000;
const MAX_SHORT = 200;

/* One response per IP per hour per survey. Not real identity control -- it is
 * not meant to be. It stops a bored person from clicking submit forty times
 * without stopping a household where two growers share a connection from
 * answering on the same evening. */
const IP_LIMIT = 6;
const IP_WINDOW_HOURS = 1;

function clean(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/* Keep only topic keys this survey declares. Anything else is dropped rather
 * than stored, so a tampered form cannot invent categories in the results. */
function cleanTopics(value, allowed) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const t of value) {
    if (typeof t === 'string' && allowed.includes(t)) seen.add(t);
  }
  return [...seen];
}

export function surveyConfig(id) {
  return Object.prototype.hasOwnProperty.call(SURVEYS, id) ? SURVEYS[id] : null;
}

export async function tooManyFromIp(env, survey, ip) {
  if (!ip) return false;
  const since = new Date(Date.now() - IP_WINDOW_HOURS * 3600 * 1000)
    .toISOString().replace(/\.\d{3}Z$/, 'Z');
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM survey_responses
      WHERE survey = ? AND created_ip = ? AND created_at >= ?`
  ).bind(survey, ip, since).first();
  return (row?.n ?? 0) >= IP_LIMIT;
}

export async function storeResponse(env, survey, body, ip) {
  const cfg = surveyConfig(survey);
  if (!cfg) throw new Error('unknown survey');

  let location = clean(body.location, 40);
  if (location && !cfg.locations.includes(location)) location = null;

  const other = location === 'other' ? clean(body.location_other, MAX_SHORT) : null;
  const topics = cleanTopics(body.topics, cfg.topics);

  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO survey_responses
       (id, survey, location, location_other, topics, comment, name, county, email, sponsor_lead, created_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, survey, location, other, JSON.stringify(topics),
    clean(body.comment, MAX_COMMENT),
    clean(body.name, MAX_SHORT),
    clean(body.county, MAX_SHORT),
    clean(body.email, MAX_SHORT)?.toLowerCase() ?? null,
    clean(body.sponsor_lead, MAX_COMMENT),
    ip || null
  ).run();

  return id;
}

/* Board-only. Returns the tally plus every comment, because the comments are
 * the point -- a count of three towns tells the board less than one grower
 * explaining why Burlington is a four-hour round trip in February. */
export async function surveyResults(env, survey) {
  const cfg = surveyConfig(survey);
  if (!cfg) throw new Error('unknown survey');

  const { results: rows } = await env.DB.prepare(
    `SELECT id, location, location_other, topics, comment, name, county, email, sponsor_lead, created_at
       FROM survey_responses WHERE survey = ? ORDER BY created_at DESC`
  ).bind(survey).all();

  const locations = Object.fromEntries(cfg.locations.map((l) => [l, 0]));
  const topics = Object.fromEntries(cfg.topics.map((t) => [t, 0]));
  const writeIns = [];
  const comments = [];
  const sponsorLeads = [];

  for (const r of rows) {
    if (r.location && locations[r.location] !== undefined) locations[r.location] += 1;
    if (r.location_other) writeIns.push(r.location_other);
    let list = [];
    try { list = JSON.parse(r.topics || '[]'); } catch { list = []; }
    for (const t of list) if (topics[t] !== undefined) topics[t] += 1;
    if (r.sponsor_lead) {
      sponsorLeads.push({
        lead: r.sponsor_lead,
        name: r.name,
        county: r.county,
        email: r.email,
        created_at: r.created_at,
      });
    }
    if (r.comment) {
      comments.push({
        comment: r.comment,
        name: r.name,
        county: r.county,
        created_at: r.created_at,
      });
    }
  }

  return {
    survey,
    total: rows.length,
    locations,
    writeIns,
    topics,
    sponsorLeads,
    comments,
    responses: rows,
  };
}
