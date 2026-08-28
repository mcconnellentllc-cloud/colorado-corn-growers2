# /board/ — CCGA board vote portal (static pages)

Served by GitHub Pages as part of this repo. The API these pages call lives in
`/worker/` and deploys separately to Cloudflare; nothing in `/worker/` is
served from here.

| File | Purpose |
|------|---------|
| `index.html` | Sign-in. Email field, sends a magic link. Shows the same confirmation for every address. |
| `portal.html` | Authenticated view: member name, motion, documents, ballot, tally, admin controls. |
| `memo.html` | The decision memo. **Currently a placeholder — see below.** |
| `board.css` | Shared styles, matching the site's palette and typography. |
| `board.js` | Shared helpers: API calls with credentials, HTML escaping, date formatting. |
| `config.js` | The only file to edit for configuration: API origin and the optional background link. |

## Still to be supplied

1. **`memo.html` body.** The page shell, PDF embed, and motion text are in
   place. Replace the block marked `PLACEHOLDER` … `END PLACEHOLDER` with the
   memo, and keep the rest of the page (the `board.css` link, nav, court-order
   section, and footer).

2. **`Order_on_Petitioners_Motion_for_Immediate_Possession.pdf`.** Drop it in
   this directory under exactly that filename. Both `memo.html` (which embeds
   it) and `portal.html` (which links it) reference it by that relative path.

3. **`API_BASE` in `config.js`.** Point it at the deployed Worker. It must be a
   `cologrowers.com` subdomain — see `worker/README.md`.

4. **`MEDIA_LINK.url` in `config.js`** (optional). The Michael Brown Show
   segment. While the URL is empty the item does not render, so there is never
   a dead link.

## No build step

Plain HTML, CSS, and JavaScript. No bundler, no npm, no framework, no Jekyll.
Edit and push; GitHub Pages serves the files as they are.
