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
  password_hash TEXT,                -- set when a member chooses a password (optional)
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

-- The Board Room: board members' notes and "midnight thoughts". Written by any
-- signed-in member, kept forever, shown newest first. The body is plain text
-- entered by a person, so it is always HTML-escaped on the way out.
CREATE TABLE IF NOT EXISTS notes (
  id           TEXT PRIMARY KEY,
  author_email TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);

-- The Decisions log: the board's official record of motions and their outcomes.
-- Written by any signed-in member, kept forever, shown newest first. Text fields
-- are person-entered, so they are always HTML-escaped on the way out.
CREATE TABLE IF NOT EXISTS decisions (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  detail         TEXT,
  outcome        TEXT NOT NULL,          -- Passed / Failed / Tabled / In progress
  decided_on     TEXT,                   -- date the board decided (YYYY-MM-DD), optional
  recorded_by    TEXT NOT NULL,          -- author name
  recorded_email TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at);

-- The membership list: CCGA members and prospects (starting with expired
-- members), worked as sponsorship targets. Private to the board. Text fields
-- are person-entered, so they are always HTML-escaped on the way out.
CREATE TABLE IF NOT EXISTS membership (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  farm        TEXT,                    -- farm / business name
  email       TEXT,
  phone       TEXT,
  town        TEXT,                    -- town / county
  status      TEXT,                    -- Expired / Lapsed / Active / Prospect
  stage       TEXT,                    -- sponsorship pipeline: New / Contacted / Interested / Committed / Declined
  notes       TEXT,
  added_by    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_membership_name ON membership(name);

-- Responses to the "trusted source for legislation" survey sent to elected
-- officials. Submitted from a PUBLIC form (an official or their staff, no board
-- login), so every text field is person-entered and always HTML-escaped on the
-- way out. office_key ties a response to a seat in the officials directory.
CREATE TABLE IF NOT EXISTS survey_responses (
  id            TEXT PRIMARY KEY,
  office_key    TEXT,                    -- seat key from the officials directory (e.g. "sen-bennet", "co-04")
  office_label  TEXT,                    -- human label as shown to the respondent
  respondent    TEXT,                    -- who filled it in (name)
  role          TEXT,                    -- their role / title (e.g. "Legislative Aide")
  email         TEXT,
  phone         TEXT,
  answer        TEXT,                    -- Yes / Maybe / Not now
  interests     TEXT,                    -- topics they care about (free text)
  comments      TEXT,
  created_ip    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_survey_created ON survey_responses(created_at);

-- Member legislative suggestions: what laws growers want created or changed.
-- Submitted from a PUBLIC form (members, no board login), so every text field is
-- person-entered and always HTML-escaped on the way out.
CREATE TABLE IF NOT EXISTS suggestions (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  email       TEXT,
  county      TEXT,
  change_type TEXT,                    -- "New law" / "Change a law" / "Not sure"
  topic       TEXT,                    -- short subject line
  body        TEXT,                    -- the suggestion itself
  created_ip  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_suggestions_created ON suggestions(created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor_email TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Private board documents (strategy memos, timelines, notes). The CONTENT lives
-- here in the database on the server's disk, never in the public repository.
-- Served only to an authenticated session.
CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  body_html  TEXT NOT NULL,              -- trusted, board-authored HTML
  category   TEXT,                       -- dashboard grouping, e.g. "checkoff", "operations"
  status     TEXT,                       -- dashboard badge, e.g. "active", "blocked", "reference"
  summary    TEXT,                       -- one-line description shown on the dashboard tile
  sort       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
