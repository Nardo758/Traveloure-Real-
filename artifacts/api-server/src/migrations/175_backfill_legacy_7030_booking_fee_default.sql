-- 175: One-time backfill of legacy 70/30 booking_fee_configs rows to the 75/25 policy
-- (Task #1036; DECISIONS.md ruling 32 — fee literals must declare their surface).
--
-- SURFACE: booking_fee_configs percent rows feed the transport/service booking
-- commission layer (resolved at runtime via booking_fee_configs lookups, migration 031).
--
-- WHY A MIGRATION: this backfill previously ran inside server/routes.ts on EVERY
-- startup. Run repeatedly, it is a clobber hazard — an admin who deliberately sets a
-- row back to 70/30 would have their edit silently reverted on the next boot. Policy
-- backfills are one-time events; the migration ledger guarantees exactly-once.
--
-- Behavior note: converts any row still carrying the pre-policy 70/30 default to
-- 75/25 once. After this migration, admin edits to ANY value (including 70/30) stick.
-- The companion bootstrap (server/services/booking-fee-bootstrap.ts) only INSERTs the
-- 'default' row when absent (ON CONFLICT DO NOTHING) and never updates existing rows.

UPDATE booking_fee_configs
SET expert_share_percent = '75.00',
    platform_fee_percent = '25.00',
    updated_at = NOW()
WHERE CAST(expert_share_percent AS NUMERIC) = 70
  AND CAST(platform_fee_percent  AS NUMERIC) = 30;
