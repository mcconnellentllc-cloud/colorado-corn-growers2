/* CCGA Board Portal — front-end configuration.
 *
 * The single place the static pages learn where the API lives and what
 * background material to link. Update this and push; there is no build step.
 */
window.CCGA_BOARD = {
    /* API origin. Set after the Worker is deployed (worker/README.md, step 9).
     *
     * IMPORTANT: this must be a cologrowers.com subdomain, not a *.workers.dev
     * hostname. The session cookie is SameSite=Lax, so the browser will only
     * send it to a host that is same-site with these pages. Pointing at
     * workers.dev makes sign-in appear to succeed and then fail on every
     * subsequent request. */
    API_BASE: 'https://board-api.cologrowers.com',

    /* Optional background listening for board members. Paste the episode URL
     * into `url` and the item appears in the portal's reading list; leave it
     * empty and the item stays hidden, so there is never a dead link. */
    MEDIA_LINK: {
        url: '',
        kind: 'Radio · Background',
        label: 'Xcel and Eminent Domain',
        detail: 'The Michael Brown Show, August 21, 2026'
    }
};
