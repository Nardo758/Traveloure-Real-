-- Migration 058 (renumbered from 051 — that slot is taken by the ledger bootstrap
-- on this line of history; registry already pointed here): Trip-logging link for the existing affiliate-booking rail.
--
-- Adds a nullable trip_id FK to affiliate_booking_requests so a facilitated
-- affiliate booking can be logged onto the canonical Trip at expert-confirmation
-- time (the expert workspace is trip-scoped; the create trigger is a no-trip
-- discover surface, so trip_id stays NULL until confirmation).
--
-- Side-effect-free: nullable, no backfill. Existing rows keep trip_id NULL and
-- the existing free flow is unchanged. Idempotent (IF NOT EXISTS).
ALTER TABLE affiliate_booking_requests
  ADD COLUMN IF NOT EXISTS trip_id varchar
  REFERENCES trips(id) ON DELETE SET NULL;
