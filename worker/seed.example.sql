-- CCGA board roster seed — TEMPLATE ONLY.
--
-- Copy this file to seed.sql, replace the placeholder rows with the real board
-- roster, and apply it. seed.sql is listed in .gitignore and must never be
-- committed, because it contains real email addresses.
--
--   cp seed.example.sql seed.sql
--   $EDITOR seed.sql
--   wrangler d1 execute ccga_board --remote --file=./seed.sql
--
-- Rules:
--   * email MUST be lowercase and trimmed. The API lowercases what it receives
--     before looking it up, so a mixed-case row here will never match.
--   * is_admin = 1 grants the "Email all board members" broadcast button and
--     the ability to see the tally before the vote closes. Keep this list short.
--   * is_active = 0 retires a member without deleting their vote history.
--   * id can be any stable unique string; a UUID or a short slug both work.

INSERT INTO members (id, email, full_name, role, is_admin, is_active) VALUES
  ('member-001', 'first.member@example.com',  'First Member',  'President',      1, 1),
  ('member-002', 'second.member@example.com', 'Second Member', 'Vice President', 0, 1),
  ('member-003', 'third.member@example.com',  'Third Member',  'Secretary',      0, 1)
ON CONFLICT(email) DO UPDATE SET
  full_name = excluded.full_name,
  role      = excluded.role,
  is_admin  = excluded.is_admin,
  is_active = excluded.is_active;
