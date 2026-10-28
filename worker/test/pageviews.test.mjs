// Pageview tests. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

import {
  cleanPath, dayOf, isBot, recordView, referrerHost, stats, visitorHash,
} from '../src/lib/pageviews.js';

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

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';

test('obvious non-readers are treated as bots', () => {
  for (const ua of ['Googlebot/2.1', 'curl/8.4.0', 'python-requests/2.31',
                    'facebookexternalhit/1.1', 'HeadlessChrome/120', 'Slackbot-LinkExpanding']) {
    assert.equal(isBot(ua), true, ua);
  }
  // No user agent at all is a script, not a grower.
  assert.equal(isBot(''), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot(CHROME), false);
});

test('query strings are stripped so tracking junk cannot shatter page totals', () => {
  assert.equal(cleanPath('/Pages/tools.html?fbclid=abc123'), '/Pages/tools.html');
  assert.equal(cleanPath('/index.html#section'), '/index.html');
  assert.equal(cleanPath('/board/'), '/board');
  assert.equal(cleanPath('tools.html'), '/tools.html');
  assert.equal(cleanPath('/'), '/');
  assert.equal(cleanPath(''), null);
  assert.equal(cleanPath(null), null);
});

test('only the referring host is kept, and our own pages are not referrers', () => {
  assert.equal(referrerHost('https://www.facebook.com/some/post?q=1', 'cologrowers.com'), 'facebook.com');
  assert.equal(referrerHost('https://www.cologrowers.com/index.html', 'cologrowers.com'), null);
  assert.equal(referrerHost('not a url', 'cologrowers.com'), null);
  assert.equal(referrerHost(null, 'cologrowers.com'), null);
});

test('the visitor hash is stable within a day and unrelated across days', async () => {
  const a = await visitorHash('2026-10-28', '198.51.100.7', CHROME, 'secret');
  const b = await visitorHash('2026-10-28', '198.51.100.7', CHROME, 'secret');
  const nextDay = await visitorHash('2026-10-29', '198.51.100.7', CHROME, 'secret');
  const other = await visitorHash('2026-10-28', '198.51.100.8', CHROME, 'secret');
  assert.equal(a, b);                 // same person, same day, counted once
  assert.notEqual(a, nextDay);        // cannot be followed across days
  assert.notEqual(a, other);
  // The raw address must not be recoverable from the stored value.
  assert.equal(a.includes('198.51.100.7'), false);
});

test('a bot view is not recorded at all', async () => {
  const env = makeEnv();
  const r = await recordView(env, { path: '/index.html', ip: '1.1.1.1', userAgent: 'Googlebot/2.1', secret: 's' });
  assert.equal(r.recorded, false);
  assert.equal(r.reason, 'bot');
  const s = await stats(env, 30);
  assert.equal(s.views, 0);
});

test('views and daily uniques are counted separately', async () => {
  const env = makeEnv();
  // One person reading three pages is three views and one visitor.
  for (const p of ['/index.html', '/Pages/tools.html', '/Pages/the-record.html']) {
    await recordView(env, { path: p, ip: '198.51.100.7', userAgent: CHROME, secret: 's' });
  }
  // A second person reading one page.
  await recordView(env, { path: '/index.html', ip: '198.51.100.8', userAgent: CHROME, secret: 's' });

  const s = await stats(env, 30);
  assert.equal(s.views, 4);
  assert.equal(s.visitors, 2);
  assert.equal(s.pages[0].path, '/index.html');
  assert.equal(s.pages[0].views, 2);
  assert.equal(s.pages[0].visitors, 2);
});

test('referrers are tallied and internal clicks excluded', async () => {
  const env = makeEnv();
  await recordView(env, { path: '/a', referrer: 'https://facebook.com/x', ip: '1.2.3.4', userAgent: CHROME, selfHost: 'cologrowers.com', secret: 's' });
  await recordView(env, { path: '/b', referrer: 'https://facebook.com/y', ip: '1.2.3.5', userAgent: CHROME, selfHost: 'cologrowers.com', secret: 's' });
  await recordView(env, { path: '/c', referrer: 'https://www.cologrowers.com/a', ip: '1.2.3.6', userAgent: CHROME, selfHost: 'cologrowers.com', secret: 's' });

  const s = await stats(env, 30);
  assert.equal(s.referrers.length, 1);
  assert.equal(s.referrers[0].referrer, 'facebook.com');
  assert.equal(s.referrers[0].views, 2);
});

test('the window is clamped to something sane', async () => {
  const env = makeEnv();
  assert.equal((await stats(env, 0)).days, 30);
  assert.equal((await stats(env, 99999)).days, 365);
  assert.equal((await stats(env, 'nonsense')).days, 30);
  assert.equal((await stats(env, 7)).days, 7);
});

test('the day series covers what was recorded', async () => {
  const env = makeEnv();
  await recordView(env, { path: '/index.html', ip: '1.1.1.2', userAgent: CHROME, secret: 's' });
  const s = await stats(env, 30);
  assert.equal(s.series.length, 1);
  assert.equal(s.series[0].day, dayOf());
  assert.equal(s.series[0].views, 1);
});
