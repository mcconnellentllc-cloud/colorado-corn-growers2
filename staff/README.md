# Staff console

`/staff/` is the board's mailing-list console. Static HTML and vanilla JS, like
the rest of the site; everything it does is a call to the Worker in `/worker/`.

## It has no login of its own

That is deliberate. The console reuses the board's magic-link sign-in, the same
session cookie, and the same `is_admin` flag on the `members` row. There is no
second password, no second roster and no separate staff account, because a
second way in is a second thing to get wrong — and the second one is always the
one nobody audits.

One call to `/me` decides everything the page shows:

| `/me` says            | The page shows                        |
|-----------------------|---------------------------------------|
| 401                   | the sign-in form                      |
| 200, `is_admin` false | "signed in, but not a staff account"  |
| 200, `is_admin` true  | the console                           |

Every admin endpoint re-checks the session and the admin flag server-side. The
hiding in the browser is a courtesy, not a control.

## Making somebody an admin

Set the flag on their existing board row. There is nothing else to create:

```sql
UPDATE members SET is_admin = 1 WHERE email = 'person@example.com';
```

Run it with `wrangler d1 execute ccga_board --remote --command "..."`.

## What the console does

- **Subscriber counts** — confirmed, awaiting confirmation, unsubscribed.
- **Write a mailing** — subject plus both a plain-text and an HTML body. Write
  both. The plain-text version is what reaches people whose client blocks HTML,
  and a message carrying only one of the two is more likely to be filtered.
- **Save a draft** — nothing is sent until you press Send.
- **Send a test to yourself** — do this every time, and read it in a real inbox
  rather than in the preview.
- **Send** — asks for confirmation with the recipient count in the question.
- **Retry failures** — appears only when a send had failures, and retries only
  those addresses.

## Two properties worth knowing

**A sent mailing cannot be edited.** The save endpoint refuses with 409 once
`sent_at` is set. It is the record of what went out, and a record you can edit
afterwards is not a record.

**Send is safe to press twice.** Delivery is written per recipient to
`mailing_deliveries`, keyed on `(mailing_id, subscriber_id)`, before the next
address is attempted. A second send skips everyone already marked sent. If a
send dies halfway — a timeout, a Worker restart — press Send again and it picks
up where it stopped.

## Deploying

Nothing separate. `/staff/` is served by GitHub Pages with the rest of the site
and needs `API_BASE` in `board/config.js` pointed at the deployed Worker, which
is the same setting the board portal uses. See `worker/README.md`.

`/staff/index.html` is `noindex, nofollow` and is not linked from the site's
navigation.
