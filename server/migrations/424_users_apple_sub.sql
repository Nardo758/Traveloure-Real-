-- 424 — users.apple_sub (ledger `2026-10-31-sign-in-with-apple`).
--
-- HELD until Leon approves the SQL on the pull request.
--
-- Sign in with Apple subject. NULL = this account has no Apple identity.
-- Unique when set, so a second account cannot claim the same subject.
-- Multiple NULLs stay allowed.
--
-- Additive nullable text, NO DEFAULT, NO CHECK, NO backfill.
-- Declared in shared/models/auth.ts, which shared/schema.ts re-exports
-- (deploy-push durability). IF NOT EXISTS, so a second run is a no-op.
-- 421 is claimed by open PRs #1804 and #1802. 422 is claimed by #1803.
-- 423 is reserved for #1802. This file is 424.

ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub text;

CREATE UNIQUE INDEX IF NOT EXISTS users_apple_sub_unique
  ON users (apple_sub)
  WHERE apple_sub IS NOT NULL;
