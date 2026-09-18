# CCGA Board Vote Portal — Worker API

Cloudflare Worker + D1 backing the static pages in `/board/` on
cologrowers.com. Nothing in this directory is served by GitHub Pages; it
deploys separately to Cloudflare.

- **Runtime:** Cloudflare Workers (plain ES modules, no bundler config needed)
- **Database:** Cloudflare D1 (SQLite)
- **Email:** Resend, transactional only

---

## The one non-obvious constraint: the API needs a cologrowers.com subdomain

The session cookie is `HttpOnly; Secure; SameSite=Lax`. A browser sends a
`SameSite=Lax` cookie on a cross-**origin** request only when that request is
still same-**site** — that is, when both hosts share the registrable domain
`cologrowers.com`.

So this Worker must be published at something like
**`board-api.cologrowers.com`**. If it is left on a `*.workers.dev` hostname,
sign-in will appear to succeed and then every call to `/me` will return 401,
because the browser silently drops the cookie. Step 6 below sets this up, and
`board/config.js` on the static side must point at the same hostname.

---

## Endpoints

| Method | Path               | Auth            | Purpose |
|--------|--------------------|-----------------|---------|
| `POST` | `/auth/request`    | none            | Emails a single-use sign-in link. Always returns the same 200 body. |
| `GET`  | `/auth/verify`     | token in query  | Redeems the link, sets the session cookie, redirects to the portal. |
| `GET`  | `/me`              | session         | Current member, motion, deadline, and their own recorded vote. |
| `POST` | `/vote`            | session         | Casts or changes a vote. Rejected after the deadline. |
| `GET`  | `/results`         | session         | Tally. Members after close only; admins any time. |
| `POST` | `/admin/send-all`  | admin session   | Fresh link to every active member. One broadcast per 15 minutes. |
| `POST` | `/auth/logout`     | session         | Destroys the session. |
| `GET`  | `/health`          | none            | Liveness check. |

---

## Deploy

Run everything below from this `worker/` directory.

### 1. Install tooling

```sh
npm install
npx wrangler login
```

### 2. Create the D1 database

```sh
npx wrangler d1 create ccga_board
```

Copy the `database_id` it prints into `wrangler.toml`, replacing
`REPLACE_WITH_D1_DATABASE_ID`.

### 3. Apply the schema

```sh
npx wrangler d1 execute ccga_board --remote --file=./schema.sql
```

### 4. Seed the roster

The roster is an allowlist — there is no self-registration, and an address that
is not in `members` with `is_active = 1` can never sign in.

```sh
cp seed.example.sql seed.sql
$EDITOR seed.sql          # real names, lowercase emails, set is_admin where needed
npx wrangler d1 execute ccga_board --remote --file=./seed.sql
```

`seed.sql` is in `.gitignore`. Do not commit it — it contains real addresses.
Emails must be lowercase; the API lowercases what it receives before looking up,
so a mixed-case row will never match.

Verify:

```sh
npx wrangler d1 execute ccga_board --remote \
  --command "SELECT email, full_name, is_admin, is_active FROM members ORDER BY full_name;"
```

### 5. Set the secrets

Never in `wrangler.toml`, never committed. Names are documented in
`.env.example`.

```sh
npx wrangler secret put RESEND_API_KEY     # from https://resend.com/api-keys
npx wrangler secret put SESSION_SECRET     # openssl rand -base64 48
```

`SESSION_SECRET` signs session cookies. Rotating it invalidates every existing
session, which is the intended way to force everyone to sign in again.

### 6. Add the custom domain

In the Cloudflare dashboard: **Workers & Pages → ccga-board-vote → Settings →
Domains & Routes → Add → Custom domain**, and enter
`board-api.cologrowers.com`.

Cloudflare creates the DNS record and issues the certificate automatically,
**provided cologrowers.com is on Cloudflare DNS**. See "DNS" below if it is not.

The `[[routes]]` block in `wrangler.toml` already declares this domain, so
`wrangler deploy` will also claim it once the zone is in the account.

### 7. Set the deadline and origins

Edit `[vars]` in `wrangler.toml`:

- `VOTE_DEADLINE` — ISO 8601 with an explicit offset, e.g.
  `2026-09-15T17:00:00-06:00`. Read from the environment at request time; it is
  not hardcoded anywhere in `src/`.
- `VOTE_TIMEZONE` — how the deadline is written out in email and on the portal.
- `SITE_ORIGIN` — where `/auth/verify` redirects after sign-in.
- `API_ORIGIN` — this Worker's public origin, used to build the magic link.
- `MAIL_FROM` / `MAIL_REPLY_TO` — must be on the Resend-verified domain.

Changing the deadline later is an edit here plus a redeploy — no code change.

### 8. Deploy

```sh
npx wrangler deploy
```

Check it:

```sh
curl https://board-api.cologrowers.com/health
npx wrangler tail          # live logs while you test a sign-in
```

### 9. Point the static site at the Worker

In `../board/config.js`, set `API_BASE` to `https://board-api.cologrowers.com`.
Commit and push; GitHub Pages picks it up.

---

## Resend domain verification

Transactional mail only. Do **not** route these through Constant Contact — it
is a marketing-list tool, and a single-use sign-in credential must not pick up
tracking redirects, unsubscribe handling, or list scrubbing.

1. Sign in at <https://resend.com> → **Domains** → **Add Domain** →
   `cologrowers.com`.
2. Resend shows three DNS records. Add all of them at whoever hosts DNS for
   cologrowers.com:
   - **SPF** — `TXT` on `send.cologrowers.com` (or the apex, per what Resend
     shows), value `v=spf1 include:amazonses.com ~all`. If an SPF record
     already exists on that name, merge the `include:` into the existing
     record rather than adding a second one — two SPF records is itself a
     failure.
   - **DKIM** — `TXT` on `resend._domainkey.cologrowers.com`, value as given.
   - **MX** — on `send.cologrowers.com`, `feedback-smtp.<region>.amazonses.com`
     priority 10, for bounce and complaint handling.
3. Back in Resend, click **Verify**. Propagation is usually minutes; allow up
   to an hour.
4. Optional but recommended — DMARC: `TXT` on `_dmarc.cologrowers.com`, value
   `v=DMARC1; p=none; rua=mailto:postmaster@cologrowers.com`. Start at
   `p=none`, review reports, then tighten.
5. Create an API key under **API Keys** with **Sending access** only, scoped to
   the verified domain, and set it as `RESEND_API_KEY` (step 5 above).
6. `MAIL_FROM` in `wrangler.toml` must use that verified domain. Sending from
   an unverified domain fails, and the failure is reported per recipient in the
   `/admin/send-all` response.

## DNS

Two records, and they are independent:

- **`board-api.cologrowers.com` → the Worker.** If cologrowers.com is on
  Cloudflare DNS, adding the custom domain in step 6 creates this record for
  you; nothing manual is needed. If DNS is elsewhere, you must either move the
  zone to Cloudflare or use a Cloudflare-managed subdomain — a Worker custom
  domain cannot be pointed at with a plain external `CNAME`, because
  Cloudflare has to terminate TLS for it.
- **Resend's SPF / DKIM / MX records** for `cologrowers.com`, from the section
  above. These go wherever DNS is hosted and are unrelated to the Worker.

The existing GitHub Pages records for `www.cologrowers.com` are untouched by
any of this.

---

## Security notes

- **Roster allowlist.** No self-registration. Sign-in requires an existing
  `is_active = 1` row.
- **No account enumeration.** `/auth/request` returns a byte-identical body
  whether the address is on the roster, inactive, rate-limited, or malformed.
- **Token handling.** 32 random bytes per link. Only the SHA-256 hash is
  stored. The link is `<row id>.<secret>`; the row is fetched by its non-secret
  id and the hash is then compared with a constant-time comparison, so nothing
  about the comparison depends on how many bytes matched. Single-use, enforced
  by a conditional `UPDATE ... WHERE used_at IS NULL`, so two simultaneous
  clicks cannot both succeed. 24-hour expiry.
- **Rate limits.** `/auth/request`: 3 per email per hour, 20 per IP per hour,
  both rolling, counted off the `tokens` table. Hitting a limit still returns
  the same generic 200. `/admin/send-all`: one broadcast per 15 minutes,
  counted off `audit_log`.
- **Sessions.** Server-side rows in D1. The cookie carries
  `<id>.<HMAC-SHA256(id)>` under `SESSION_SECRET`, so a forged cookie is
  rejected before D1 is touched. `HttpOnly; Secure; SameSite=Lax`, 30 days.
- **CORS.** Allowlist of exactly `https://cologrowers.com` and
  `https://www.cologrowers.com`, with credentials. Any other origin gets no
  `Access-Control-Allow-Origin` header at all.
- **Audit log.** Every sign-in request, verification success and failure,
  logout, vote, and admin broadcast is written to `audit_log` with actor, IP,
  and timestamp.
- **Result visibility.** Members cannot read the tally until `VOTE_DEADLINE`
  passes; `/results` returns 403 before then. Admins can read it at any time.

## Operations

Read the audit trail:

```sh
npx wrangler d1 execute ccga_board --remote \
  --command "SELECT created_at, actor_email, action, detail FROM audit_log ORDER BY created_at DESC LIMIT 50;"
```

Read the tally (server-side, regardless of deadline):

```sh
npx wrangler d1 execute ccga_board --remote \
  --command "SELECT choice, COUNT(*) FROM votes GROUP BY choice;"
```

Full ballot detail with names, for the minutes:

```sh
npx wrangler d1 execute ccga_board --remote \
  --command "SELECT m.full_name, v.choice, v.comment, v.updated_at FROM votes v JOIN members m ON m.id = v.member_id ORDER BY m.full_name;"
```

Add or retire a member:

```sh
npx wrangler d1 execute ccga_board --remote \
  --command "UPDATE members SET is_active = 0 WHERE email = 'someone@example.com';"
```

## Local development

```sh
cp .env.example .dev.vars     # .dev.vars is gitignored
npx wrangler d1 execute ccga_board --local --file=./schema.sql
npx wrangler d1 execute ccga_board --local --file=./seed.sql
npx wrangler dev
```

Against `wrangler dev` on `http://localhost:8787` the cookie's `Secure`
attribute means a browser will not store it over plain HTTP. Test the API with
`curl -c/-b` cookie jars, or run the static pages through an HTTPS tunnel.
