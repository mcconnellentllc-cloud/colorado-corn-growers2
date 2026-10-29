/* Visit counting.
 *
 * Two beacons, on purpose, and either can be switched off independently.
 *
 *   1. OURS. A small POST to the Worker. The numbers land in our own D1 and
 *      nobody else sees them. This is the one we want long term. It records
 *      nothing until the Worker is deployed, and fails quietly until then.
 *
 *   2. A BRIDGE. Cloudflare Web Analytics, free, so the board has a rough
 *      usage figure to take into sponsor calls now rather than after the
 *      Worker lands. Delete the token below once ours is live and you would
 *      rather not have a third party in the path.
 *
 * Neither uses cookies and neither follows anyone between sites, so there is
 * nothing here that needs a consent banner.
 *
 * -------------------------------------------------------------------------
 * TO TURN ON THE BRIDGE (about two minutes):
 *
 *   1. dash.cloudflare.com -> Analytics & Logs -> Web Analytics -> Add a site
 *   2. Enter cologrowers.com. You do NOT need the domain on Cloudflare DNS;
 *      this works on GitHub Pages as it stands.
 *   3. Cloudflare shows a snippet containing a token. Copy just the token --
 *      the long hex string after "token": -- and paste it below.
 *   4. Commit and push. Numbers start appearing within a few minutes.
 *
 * Expect it to UNDERCOUNT. Privacy blockers block cloudflareinsights.com, so
 * some real readers never register. That is the right direction to be wrong
 * in when you are quoting a number to a sponsor.
 * ------------------------------------------------------------------------- */
(function () {
    'use strict';

    var API_BASE = 'https://board-api.cologrowers.com';   /* keep in step with board/config.js */
    var CF_TOKEN = '';                                     /* paste the Cloudflare token here */

    /* Our own page loads are not traffic. Skip local previews and the
       github.io staging hostname -- this matters while the real numbers are
       small, and they will be, to start with. */
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.github.io')) return;

    /* Honour the browser's do-not-track setting. It costs a little accuracy
       and it is the right thing to do when counting people who did not ask
       to be counted. */
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

    /* ---- 1. Ours ------------------------------------------------------- */
    function sendOurs() {
        var payload = JSON.stringify({
            path: window.location.pathname,
            referrer: document.referrer || null
        });

        /* sendBeacon survives the page being closed mid-request; a plain
           fetch does not. Fall back where it is unavailable. */
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

    /* ---- 2. The bridge ------------------------------------------------- */
    function sendBridge() {
        if (!CF_TOKEN) return;
        try {
            var s = document.createElement('script');
            s.defer = true;
            s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
            s.setAttribute('data-cf-beacon', JSON.stringify({ token: CF_TOKEN }));
            document.head.appendChild(s);
        } catch (e) { /* ignore */ }
    }

    function go() { sendOurs(); sendBridge(); }

    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go);
})();
