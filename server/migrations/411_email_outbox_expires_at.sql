-- 411 — email_outbox.expires_at. Additive, nullable, NO DEFAULT, NO CHECK,
-- NO index, NO backfill. NULL = no expiry was stored at enqueue (every row
-- that already exists, and every later enqueue whose type has no stated window).
-- Nothing in this file sends mail or rewrites status.
-- HELD for "Migration 411 SQL approved — Leon".
-- Ledger 2026-10-25-email-outbox-expires-at. Declared in shared/schema.ts.
-- Z-03 (ledger 2026-10-24-traveler-automation-rulings).

ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN email_outbox.expires_at IS
  'Set at enqueue (Z-03). NULL = no stated window, including every row that existed before this column. A due allowlisted row with expires_at <= now() is cancelled with reason expired and is not sent.';
