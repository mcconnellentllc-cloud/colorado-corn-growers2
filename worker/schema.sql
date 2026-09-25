-- CCGA Board Vote Portal — D1 schema
-- Apply with:
--   wrangler d1 execute ccga_board --remote --file=./schema.sql
--
-- All timestamps are stored as ISO 8601 UTC strings ("2026-09-15T17:00:00Z")
-- so that lexical comparison equals chronological comparison, and so that
-- they compare directly against the VOTE_DEADLINE environment variable.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- members — the roster allowlist. There is no self-registration; a person can
-- only sign in if they already have an active row here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,          -- always stored lowercased/trimmed
  full_name  TEXT NOT NULL,
  role       TEXT,                          -- "President", "Board Member", ...
  is_admin   INTEGER NOT NULL DEFAULT 0,    -- 0/1
  is_active  INTEGER NOT NULL DEFAULT 1,    -- 0/1
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------------
-- tokens — single-use magic-link tokens. Only the SHA-256 hash of the token
-- secret is stored; the raw secret exists only inside the emailed link.
-- `created_at` backs the per-email and per-IP rate limits.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tokens (
  id         TEXT PRIMARY KEY,              -- public lookup id (in the link)
  email      TEXT NOT NULL,
  token_hash TEXT NOT NULL,                 -- hex SHA-256 of the token secret
  expires_at TEXT NOT NULL,
  used_at    TEXT,                          -- NULL until redeemed
  created_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_tokens_email_created ON tokens (email, created_at);
CREATE INDEX IF NOT EXISTS idx_tokens_ip_created    ON tokens (created_ip, created_at);
CREATE INDEX IF NOT EXISTS idx_tokens_expires       ON tokens (expires_at);

-- ---------------------------------------------------------------------------
-- sessions — server-side sessions. The cookie carries "<id>.<hmac>"; the HMAC
-- is verified with SESSION_SECRET before the database is touched at all.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_member  ON sessions (member_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- votes — one row per member, upserted. Editable until VOTE_DEADLINE.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votes (
  id         TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  choice     TEXT NOT NULL CHECK (choice IN ('for','against','abstain')),
  comment    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ---------------------------------------------------------------------------
-- audit_log — every auth event, vote, and admin action.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor_email TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_action_created ON audit_log (action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON audit_log (created_at);

-- ---------------------------------------------------------------------------
-- Mailing list.
--
-- Separate from `members`: that table is the board roster and controls who may
-- vote. This one is the public list anyone may join and leave. Nothing here
-- grants access to anything.
--
-- A row is only mailable when status = 'active'. Signing up creates a
-- 'pending' row and sends one confirmation email; the row becomes 'active'
-- only when the recipient clicks the link in it. That is double opt-in, and it
-- is what keeps a list deliverable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscribers (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  full_name        TEXT,
  status           TEXT NOT NULL CHECK (status IN ('pending', 'active', 'unsubscribed')),
  -- SHA-256 of the confirmation secret, never the secret itself.
  confirm_hash     TEXT,
  confirm_expires  TEXT,
  -- Stable per-subscriber secret used to sign unsubscribe links, so an
  -- unsubscribe link keeps working without being guessable from the address.
  unsub_secret     TEXT NOT NULL,
  source           TEXT,
  created_at       TEXT NOT NULL,
  created_ip       TEXT,
  confirmed_at     TEXT,
  unsubscribed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers (status);
CREATE INDEX IF NOT EXISTS idx_subscribers_created ON subscribers (created_at);

-- Every send, recorded. One row per address per campaign, which also makes it
-- impossible to send the same campaign to the same person twice.
CREATE TABLE IF NOT EXISTS mailings (
  id           TEXT PRIMARY KEY,
  subject      TEXT NOT NULL,
  body_html    TEXT NOT NULL,
  body_text    TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  created_by   TEXT,
  sent_at      TEXT,
  sent_count   INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mailing_deliveries (
  mailing_id    TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  email         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error         TEXT,
  attempted_at  TEXT NOT NULL,
  PRIMARY KEY (mailing_id, subscriber_id)
);
