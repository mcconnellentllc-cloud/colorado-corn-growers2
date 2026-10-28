/* Site analytics.
 *
 * Why this file exists rather than a snippet pasted into every page: the tag
 * goes on 23 pages, and this way changing provider, fixing the script URL or
 * switching it off is one edit instead of a sweep.
 *
 * What it is: Plausible. Cookieless, no personal data, no cross-site tracking,
 * and no consent banner required on that basis. The point is a visitor number
 * we can put in front of a sponsor, not a profile of anybody who reads the
 * site. Board and staff pages under /board/ and /staff/ deliberately do not
 * load this -- there is no reason to measure our own directors.
 *
 * ---------------------------------------------------------------------------
 * SETUP, and it is not done until somebody does this:
 *
 *   1. Create the account at https://plausible.io and add cologrowers.com
 *      as a site. Nothing below records anything until that exists.
 *   2. Plausible shows you a snippet. Check SRC against it. The script URL has
 *      changed between versions and the value below is the common default, not
 *      something verified against your dashboard.
 *   3. To show sponsors the numbers, turn on the public dashboard in
 *      Plausible's site settings and share that link. That is the whole reason
 *      we picked a tool with one.
 *
 * To switch it off entirely, set DOMAIN to an empty string.
 * ------------------------------------------------------------------------ */
(function () {
    'use strict';

    var DOMAIN = 'cologrowers.com';
    var SRC = 'https://plausible.io/js/script.js';

    if (!DOMAIN || !SRC) return;

    /* Don't count local previews or the GitHub Pages staging hostname -- a
       handful of our own page loads is noise when the numbers are small, and
       small is exactly what they will be at the start. */
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.github.io')) return;

    var s = document.createElement('script');
    s.defer = true;
    s.setAttribute('data-domain', DOMAIN);
    s.src = SRC;
    document.head.appendChild(s);
})();
