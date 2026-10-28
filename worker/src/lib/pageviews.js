/* Pageview counting.
 *
 * Built rather than bought because the Worker and D1 are already here, the
 * numbers stay ours, and a board-only dashboard uses the same admin session as
 * everything else.
 *
 * What it does not do, and what you should know before quoting a number to a
 * sponsor: bot filtering here is a user-agent blocklist plus the fact that the
 * beacon needs JavaScript. That catches crawlers and the obvious scripts. It
 * will not catch a headless browser pretending to be Chrome. A paid analytics
 * service spends real effort on this and we do not, so treat these as honest
 * numbers with a margin, not audited ones.
 */

import { sha256Hex, uuid } from './crypto.js';

/* Anything matching this is not a reader. Deliberately broad -- over-counting
 * is the failure that embarrasses you in front of a sponsor; under-counting
 * only makes us look smaller than we are. */
const BOT = /bot|crawl|spider|slurp|bing|baidu|yandex|duckduck|facebookexternalhit|embedly|quora|pinterest|slackbot|vkshare|whatsapp|flipboard|tumblr|headless|lighthouse|pagespeed|gtmetrix|curl|wget|python-requests|go-http|java\/|okhttp|axios|postman|monitor|uptime|pingdom|probe|scan/i;

const MAX_PATH = 300;

export function isBot(userAgent) {
  if (!userAgent) return true;          // no UA at all is a script, not a grower
  return BOT.test(userAgent);
}

/* Only the host, never the full referring URL -- the path somebody came from
 * can carry a search query or a private link and we have no use for it. */
export function referrerHost(referrer, selfHost) {
  if (!referrer || typeof referrer !== 'string') return null;
  let host;
  try { host = new URL(referrer).hostname.replace(/^www\./, ''); } catch { return null; }
  if (!host) return null;
  if (selfHost && host === String(selfHost).replace(/^www\./, '')) return null;  // internal click
  return host.slice(0, 120);
}

/* Keep the path, drop everything after it. Query strings on this site are
 * tracking junk (fbclid and friends) and would shatter the page totals. */
export function cleanPath(value) {
  if (typeof value !== 'string') return null;
  let p = value.split('?')[0].split('#')[0].trim();
  if (!p) return null;
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p.slice(0, MAX_PATH) || '/';
}

export function dayOf(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/* The date is inside the hash on purpose: the same person on two days produces
 * two unrelated values, so this counts daily uniques and cannot build a trail. */
export async function visitorHash(day, ip, userAgent, secret) {
  return (await sha256Hex([day, ip || '', userAgent || '', secret || ''].join('|'))).slice(0, 32);
}

export async function recordView(env, { path, referrer, ip, userAgent, selfHost, secret }) {
  if (isBot(userAgent)) return { recorded: false, reason: 'bot' };

  const p = cleanPath(path);
  if (!p) return { recorded: false, reason: 'no_path' };

  const day = dayOf();
  const visitor = await visitorHash(day, ip, userAgent, secret);

  await env.DB.prepare(
    `INSERT INTO pageviews (id, day, path, referrer, visitor) VALUES (?, ?, ?, ?, ?)`
  ).bind(uuid(), day, p, referrerHost(referrer, selfHost), visitor).run();

  return { recorded: true };
}

/* Board-only. Returns totals, a day-by-day series, top pages and top referrers
 * over the window. */
export async function stats(env, days = 30) {
  const n = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
  const since = dayOf(new Date(Date.now() - (n - 1) * 86400000));

  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
       FROM pageviews WHERE day >= ?`
  ).bind(since).first();

  const { results: series } = await env.DB.prepare(
    `SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
       FROM pageviews WHERE day >= ? GROUP BY day ORDER BY day`
  ).bind(since).all();

  const { results: pages } = await env.DB.prepare(
    `SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
       FROM pageviews WHERE day >= ? GROUP BY path ORDER BY views DESC LIMIT 25`
  ).bind(since).all();

  const { results: referrers } = await env.DB.prepare(
    `SELECT referrer, COUNT(*) AS views FROM pageviews
       WHERE day >= ? AND referrer IS NOT NULL
       GROUP BY referrer ORDER BY views DESC LIMIT 15`
  ).bind(since).all();

  return {
    days: n,
    since,
    views: totals?.views ?? 0,
    visitors: totals?.visitors ?? 0,
    series,
    pages,
    referrers,
  };
}
