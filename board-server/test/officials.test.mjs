// Tests for the officials directory + the trusted-source survey storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, addSurveyResponse, listSurveyResponses, deleteSurveyResponse, surveyStats } from '../src/db.js';
import { OFFICIALS, OFFICIAL_GROUPS, officeByKey } from '../src/officials.js';
import { officialsPage, publicSurveyPage } from '../src/pages.js';

test('survey responses store, list newest-first, and tally', () => {
  const db = openDb(':memory:');
  addSurveyResponse(db, { officeKey: 'co-04', officeLabel: 'Laubacher — 4th', respondent: 'Aide A', answer: 'Yes' });
  addSurveyResponse(db, { officeKey: 'sen-bennet', officeLabel: 'Bennet', respondent: 'Aide B', answer: 'Maybe' });
  addSurveyResponse(db, { officeKey: 'co-08', officeLabel: 'Rutinel', respondent: 'Aide C', answer: 'Not now' });
  const rows = listSurveyResponses(db);
  assert.equal(rows.length, 3);
  const s = surveyStats(db);
  assert.equal(s.total, 3);
  assert.equal(s.yes, 1);
  assert.equal(s.maybe, 1);
  deleteSurveyResponse(db, rows[0].id);
  assert.equal(listSurveyResponses(db).length, 2);
});

test('officials data is well-formed: unique keys, known groups, no unverified placeholders', () => {
  const keys = new Set();
  for (const o of OFFICIALS) {
    assert.ok(o.key && !keys.has(o.key), `duplicate/missing key: ${o.key}`);
    keys.add(o.key);
    assert.ok(OFFICIAL_GROUPS.includes(o.group), `unknown group: ${o.group}`);
    assert.ok(o.name && o.title, `name/title required for ${o.key}`);
    // A newly-elected member must not carry a fabricated DC office.
    if (o.status === 'new') assert.ok(!o.dc_address && !o.phone, `new member ${o.key} should have no DC office yet`);
  }
  assert.ok(officeByKey('co-04'));
  assert.equal(officeByKey('nope'), null);
});

test('officials page renders the directory and survey card; no endorsement language', () => {
  const member = { full_name: 'Admin', email: 'a@b.com', is_admin: true, role: 'Admin' };
  const html = officialsPage(member, { responses: [], stats: {}, surveyUrl: '/survey' });
  assert.ok(html.includes('The Trusted-Source Survey'));
  assert.ok(html.includes('Michael Bennet') && html.includes('Manny Rutinel'));
  assert.ok(html.includes('1641 Longworth')); // verified Hurd address
  assert.ok(!/endors/i.test(html), 'no endorsement language in the hub');
});

test('public survey preselects an office from its key and hides a honeypot', () => {
  const html = publicSurveyPage({ selectedOffice: 'co-05' });
  assert.ok(/<option value="co-05" selected>/.test(html));
  assert.ok(html.includes('name="website"')); // honeypot present
  assert.ok(html.includes('administers no'));  // disclosure present
});
