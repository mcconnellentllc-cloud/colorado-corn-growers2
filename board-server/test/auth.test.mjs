// Auth unit tests — run with: npm test  (node --experimental-sqlite --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, upsertMember, findMemberByEmail } from '../src/db.js';
import {
  issueToken, redeemToken, tooManyRequests, createSession, getSession, destroySession,
} from '../src/auth.js';

const SECRET = 'test-secret-at-least-16-chars-long';

function freshDb() {
  const db = openDb(':memory:');
  upsertMember(db, { email: 'Dir@Example.com', full_name: 'A Director', is_active: 1 });
  return db;
}

test('email is normalized on the roster', () => {
  const db = freshDb();
  assert.ok(findMemberByEmail(db, 'dir@example.com'));
  assert.ok(findMemberByEmail(db, 'DIR@EXAMPLE.COM'));
});

test('a token redeems exactly once', () => {
  const db = freshDb();
  const { token } = issueToken(db, { email: 'dir@example.com', ip: '1.1.1.1' });
  const first = redeemToken(db, token);
  assert.equal(first.ok, true);
  assert.equal(first.email, 'dir@example.com');
  const second = redeemToken(db, token);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already_used');
});

test('a tampered token secret is rejected', () => {
  const db = freshDb();
  const { token } = issueToken(db, { email: 'dir@example.com', ip: '1.1.1.1' });
  const [id] = token.split('.');
  assert.equal(redeemToken(db, `${id}.not-the-real-secret`).ok, false);
});

test('a session round-trips and a forged cookie is rejected', () => {
  const db = freshDb();
  const member = findMemberByEmail(db, 'dir@example.com');
  const session = createSession(db, SECRET, member.id);
  const ok = getSession(db, SECRET, session.cookieValue);
  assert.ok(ok);
  assert.equal(ok.member.email, 'dir@example.com');
  // wrong signature
  assert.equal(getSession(db, SECRET, `${session.id}.deadbeef`), null);
  // wrong secret
  assert.equal(getSession(db, 'a-different-secret-16chars', session.cookieValue), null);
});

test('destroying a session revokes access', () => {
  const db = freshDb();
  const member = findMemberByEmail(db, 'dir@example.com');
  const session = createSession(db, SECRET, member.id);
  destroySession(db, session.sessionId ?? session.id);
  assert.equal(getSession(db, SECRET, session.cookieValue), null);
});

test('an inactive member cannot hold a session', () => {
  const db = freshDb();
  const member = findMemberByEmail(db, 'dir@example.com');
  const session = createSession(db, SECRET, member.id);
  upsertMember(db, { email: 'dir@example.com', full_name: 'A Director', is_active: 0 });
  assert.equal(getSession(db, SECRET, session.cookieValue), null);
});

test('rate limit trips after 3 requests for one email in the window', () => {
  const db = freshDb();
  for (let i = 0; i < 3; i++) {
    assert.equal(tooManyRequests(db, { email: 'dir@example.com', ip: '1.1.1.1' }), false);
    issueToken(db, { email: 'dir@example.com', ip: '1.1.1.1' });
  }
  assert.equal(tooManyRequests(db, { email: 'dir@example.com', ip: '1.1.1.1' }), true);
});
