-- 397 — SH-1 item 12: a test-account flag on users. Ledger `2026-10-19-sh1-test-flag`.
-- HELD FOR LEON'S COMMENT on the PR before merge.
--
-- A test account is `is_test` TRUE OR an email on the QA_ACCOUNT_EMAIL_DOMAIN setting (one predicate,
-- server/services/test-account.ts). Its listings are left out of public readers and it is never routed.
-- Set by an admin (audit-logged) or at QA sign-up; never client-settable.
--
-- Additive, nullable, NO DEFAULT (NULL reads as false; ruling Q12.1 — any publish-screen offer to add a
-- default is declined, §20), NO CHECK, NO index, NO backfill. Declared in shared/models/auth.ts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test boolean;
