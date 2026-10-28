/* Visit counting.
 *
 * Ours, not a third party's. The Worker and D1 were already here, so a
 * pageview is one small POST to our own API and the numbers stay in our own
 * database. No cookies, no third-party script, nothing loaded from anyone
 * else's domain, and nothing to put in a consent banner.
 *
 * How a visitor is counted without cookies: the Worker hashes the date, the
 * IP and the browser string together with a secret. The same person on the
 * same day lands on the same hash and counts once; the same person tomorrow is
 * a different hash, because the date is inside it. We never store the IP.
 *
 * This records nothing until the Worker is deployed. Until then it fails
 * quietly, which is the right behaviour -- a counter must never be the reason
 * a page misbehaves.
 *
 * Numbers are read at /staff/stats.html with a board sign-in.
 */
(function () {
    'use strict';

    var API_BASE = 'https://board-api.cologrowers.com';   /* keep in step with board/config.js */

    /* Our own page loads are not traffic. Skip local previews and the
       github.io staging hostname, which matter when the real numbers are
       small -- and they will be, to start with. */
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.github.io')) return;

    /* Honour the browser's do-not-track setting. It costs us a little accuracy
       and it is the correct thing to do when we are counting people who did
       not ask to be counted. */
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

    function send() {
        var payload = JSON.stringify({
            path: window.location.pathname,
            referrer: document.referrer || null
        });

        /* sendBeacon survives the page being closed mid-request, which a
           plain fetch does not. Fall back where it is unavailable. */
        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon(API_BASE + '/pv', new Blob([payload], { type: 'application/json' }));
                return;
            }
        } catch (e) { /* fall through */ }

        try {
            fetch(API_BASE + '/pv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true
            }).catch(function () { /* counting must never surface an error */ });
        } catch (e) { /* ignore */ }
    }

    if (document.readyState === 'complete') send();
    else window.addEventListener('load', send);
})();
