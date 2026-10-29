-- 416 — service_bookings.payout_snapshot (ledger `2026-10-29-provider-payout-block`).
--
-- HELD for "Migration 416 SQL approved — Leon". Do not merge until that comment is on the PR.
-- Do not run this against production until then.
--
-- The provider-accept snapshot for a booking that had no purchase-time split.
-- NULL means this accept did not snapshot one: the row was accepted before this
-- column, or the purchase-time split was already stored and was not recomputed.
--
-- Additive: IF NOT EXISTS. Nullable jsonb. No DEFAULT, no CHECK, no index, no backfill.
-- Declared in shared/schema.ts. A second run is a no-op.

ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS payout_snapshot jsonb;

COMMENT ON COLUMN service_bookings.payout_snapshot IS
  'Provider accept snapshot for a booking with no purchase-time split. NULL = not snapshotted by that accept.';
