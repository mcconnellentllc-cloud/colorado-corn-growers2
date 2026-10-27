// Grower survey tests. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

import { storeResponse, surveyConfig, surveyResults, tooManyFromIp } from '../src/lib/survey.js';

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  for (const stmt of schema.split(/;\s*\n/)) {
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

const SURVEY = 'annual-meeting-2027';

test('a known survey has config and an unknown one does not', () => {
  assert.ok(surveyConfig(SURVEY));
  assert.equal(surveyConfig('no-such-survey'), null);
  // Prototype keys must not read as valid surveys.
  assert.equal(surveyConfig('constructor'), null);
});

test('a response is stored and tallied', async () => {
  const env = makeEnv();
  await storeResponse(env, SURVEY, {
    location: 'yuma',
    topics: ['fsa-programs', 'banking'],
    comment: 'Burlington is a long haul in February.',
    name: 'A Grower',
    county: 'Yuma',
  }, '198.51.100.7');

  const r = await surveyResults(env, SURVEY);
  assert.equal(r.total, 1);
  assert.equal(r.locations.yuma, 1);
  assert.equal(r.locations.sterling, 0);
  assert.equal(r.topics['fsa-programs'], 1);
  assert.equal(r.topics['marketing-ai'], 0);
  assert.equal(r.comments.length, 1);
  assert.match(r.comments[0].comment, /long haul/);
});

test('an invented location is dropped rather than stored', async () => {
  const env = makeEnv();
  await storeResponse(env, SURVEY, { location: 'denver', topics: [] }, null);
  const r = await surveyResults(env, SURVEY);
  assert.equal(r.total, 1);
  assert.equal(Object.values(r.locations).reduce((a, b) => a + b, 0), 0);
});

test('an invented topic cannot invent a results category', async () => {
  const env = makeEnv();
  await storeResponse(env, SURVEY, { topics: ['fsa-programs', 'free-beer'] }, null);
  const r = await surveyResults(env, SURVEY);
  assert.equal(r.topics['fsa-programs'], 1);
  assert.equal(r.topics['free-beer'], undefined);
});

test('duplicate topics count once', async () => {
  const env = makeEnv();
  await storeResponse(env, SURVEY, { topics: ['banking', 'banking', 'banking'] }, null);
  const r = await surveyResults(env, SURVEY);
  assert.equal(r.topics.banking, 1);
});

test('a write-in is kept only when the location is "other"', async () => {
  const env = makeEnv();
  await storeResponse(env, SURVEY, { location: 'other', location_other: 'Akron' }, null);
  await storeResponse(env, SURVEY, { location: 'sterling', location_other: 'Akron' }, null);
  const r = await surveyResults(env, SURVEY);
  assert.deepEqual(r.writeIns, ['Akron']);
});

test('an unknown survey is refused rather than stored somewhere odd', async () => {
  const env = makeEnv();
  await assert.rejects(() => storeResponse(env, 'nope', { location: 'yuma' }, null));
});

test('the IP limit trips only after repeated submissions', async () => {
  const env = makeEnv();
  const ip = '203.0.113.9';
  assert.equal(await tooManyFromIp(env, SURVEY, ip), false);
  for (let i = 0; i < 6; i++) {
    await storeResponse(env, SURVEY, { location: 'sterling' }, ip);
  }
  assert.equal(await tooManyFromIp(env, SURVEY, ip), true);
  // A different address is unaffected.
  assert.equal(await tooManyFromIp(env, SURVEY, '203.0.113.10'), false);
  // No address at all is not rate limited into oblivion.
  assert.equal(await tooManyFromIp(env, SURVEY, null), false);
});

test('an anonymous response is allowed to be anonymous', async () => {
  const env = makeEnv();
  await storeResponse(env, SURVEY, { location: 'burlington' }, null);
  const r = await surveyResults(env, SURVEY);
  assert.equal(r.total, 1);
  assert.equal(r.responses[0].name, null);
  assert.equal(r.responses[0].email, null);
});

test('email is lowercased and overlong text is truncated', async () => {
  const env = makeEnv();
  await storeResponse(env, SURVEY, {
    location: 'yuma',
    email: '  Grower@Example.COM ',
    comment: 'x'.repeat(5000),
  }, null);
  const r = await surveyResults(env, SURVEY);
  assert.equal(r.responses[0].email, 'grower@example.com');
  assert.equal(r.responses[0].comment.length, 4000);
});
