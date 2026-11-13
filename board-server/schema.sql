-- Private board portal — schema. SQLite (node:sqlite).
--
-- The roster is a closed allowlist: there is no self-registration. A person can
-- sign in only if an is_active row exists for their email.

CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,       -- stored lowercased/trimmed
  full_name  TEXT NOT NULL,
  role       TEXT,                       -- "President", "Board Member", ...
  is_admin   INTEGER NOT NULL DEFAULT 0, -- 0/1
  is_active  INTEGER NOT NULL DEFAULT 1, -- 0/1
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Magic-link tokens. Only the hash of the secret is ever stored; the raw
-- secret lives in the emailed URL and nowhere else. Single-use, 24h expiry.
CREATE TABLE IF NOT EXISTS tokens (
  id         TEXT PRIMARY KEY,           -- public lookup id (in the link)
  email      TEXT NOT NULL,
  token_hash TEXT NOT NULL,              -- hex SHA-256 of the token secret
  expires_at TEXT NOT NULL,
  used_at    TEXT,                       -- NULL until redeemed
  created_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_tokens_email ON tokens(email);

-- Server-side sessions. The cookie carries "<id>.<HMAC(id)>"; a forged cookie
-- is rejected on signature before the table is ever read.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor_email TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
