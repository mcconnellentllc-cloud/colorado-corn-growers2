# cologrowers.com

Static site for the Colorado Corn Growers Association, served by GitHub
Pages from `main`. The Cloudflare Worker in `/worker/` deploys separately and
is not served from here.

## Hard constraints

- **Static HTML, CSS and vanilla JS only.** No Jekyll, no framework, no build
  step, no bundler, no npm on the site side. Edit and push.
- Styles are inlined per page. There is no shared stylesheet outside `/board/`,
  so a change to shared furniture (nav, footer) has to be applied to each page
  that carries it.

## Writing about places

**Speak for Colorado as a whole.** The association represents growers
statewide, and naming a town or a handful of counties in general copy reads as
one corner of the state talking for the rest. Burlington is the worst offender
to reach for, because it is the mailing address.

**Name counties only when the facts are county-specific**, for example:

- A program that genuinely applies to some counties and not others. SDRP
  eligibility moving from 24 drought counties to statewide coverage is the
  point of that sentence, so the number belongs in it.
- A case, a filing or a ruling. Cheyenne County District Court is where
  *Public Service Company of Colorado v. Dryland Partners* sits.
- A specific event or decision. Elbert County denied the Power Pathway
  permits; the round table was at the Cow Palace in Lamar.
- Board members' own towns and the counties a director represents.

If the county is decoration rather than a fact, cut it and say Colorado.

## Accuracy

- **Verify dates and dollar figures against a primary source before
  publishing**, and corroborate across independent outlets when the primary
  source cannot be reached. Deadlines and payment rates move.
- **Do not publish a date that cannot be sourced.** Saying "we could not
  confirm a date" is better than repeating one that turns out to be somebody's
  guess, and it invites members to tell you where they heard it.
- Attribute figures on the page to USDA, FSA, or the economists who produced
  them, and carry a disclosure that CCGA administers no USDA program.
- **Do not publish internal material** — SWCA board minutes, staff work
  product, board packets, panel questions. Use the public underlying data
  instead.
- **Issue advocacy only.** Ask legislators to act on pending legislation. Never
  take a position on candidates or elections; several of the officials named on
  this site appear on ballots.

## Palette and contrast

Warm light theme sitewide. Dark navbar and footer over a cream page.

| Token | Value | Use |
|---|---|---|
| Page | `#f5f3ee` | Body background |
| Surface | `#ffffff` | Cards |
| Ink | `#37342f` | Body text |
| Muted | `#5b564f` | Secondary text |
| Deep green | `#334539` | Headings, dark bands |
| Sage | `#6a8971` | Borders and rules, **not text on white** |
| Gold | `#d3ae5c` | Decorative, and text **on dark** only |
| Gold, dark | `#8a6a22` | Link text **on cream** |

**The gold trap.** `#d3ae5c` is 1.90:1 on the cream page — decorative only.
Text links on light backgrounds use `#8a6a22`. The same gold is correct on the
dark green bands, so the right value depends on what is behind it.

Run the contrast audit before publishing anything; it catches this and it has
caught real regressions. Every page passes WCAG AA today, and that is worth
keeping.

## Nav

Eight items with a Board Portal link at the end. Between 768px and roughly
1360px the wordmark used to collide with the first link; two intermediate
breakpoints tighten spacing through that band. **If you add a ninth item,
re-measure across widths** rather than assuming it fits.

## The board vote portal

`/board/` is static and inert until the Worker answers. The sign-in form hides
itself behind a `/health` check and shows a "voting has not opened yet" notice,
which clears automatically once the Worker is live.

**The Worker must be published at a `cologrowers.com` subdomain**, not
`*.workers.dev`. The session cookie is `SameSite=Lax`, so on workers.dev the
browser silently drops it and every `/me` returns 401. Deploy steps are in
`worker/README.md`.

## Known issues

- `Pages/meet-our-board.html` gates the board portal behind a password checked
  in client-side JavaScript. **This is deliberate. Leave it.** The board wants
  a quiet way in and it is theirs to keep.

  Understand what it is, though, so nothing sensitive gets put behind it on the
  assumption that it is a lock. The password sits in the page source in plain
  text, and `board-portal.html` opens by direct URL without it, so the gate
  keeps out casual browsing and nothing more. Everything on that page is
  readable by anyone who has the URL. The page is `noindex, nofollow` so it
  stays out of search results, which is the part that actually does work.

  Genuinely private board material belongs behind the magic-link portal in
  `/board/`, which authenticates against a roster. The two can coexist: the
  hub stays as the quiet front door, and anything confidential moves behind the
  session.
- `Pages/board-portal.html` still uses emoji headings, which the rest of the
  site has moved away from.
