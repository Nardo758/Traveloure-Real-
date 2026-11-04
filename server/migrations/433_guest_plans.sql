-- 433_guest_plans.sql
-- GATE-1B (ledger 2026-11-04-gate1b-guest-plan): a server-side guest plan in waitlist mode.
-- SQL as given in the architect's GATE-1B rulings (Nov 4, 2026). Two deltas from that text, both stated on the PR:
--   1. guest_claimed_at is `timestamp` (without time zone), matching trips.created_at, as the ruling instructs
--      ("confirm the timestamp type matches trips.created_at (swap to match if not)").
--   2. IF NOT EXISTS on every statement: both columns and both indexes are declared in shared/schema.ts, so the
--      publish-time schema push can create them before boot; the boot run must then find them and do nothing (§20).
-- Both columns nullable, no DEFAULT, no CHECK, no FK. No backfill.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS guest_session_hash varchar(64), ADD COLUMN IF NOT EXISTS guest_claimed_at timestamp;
CREATE INDEX IF NOT EXISTS trips_guest_session_hash_idx ON trips (guest_session_hash) WHERE guest_session_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS trips_guest_retention_idx ON trips (updated_at) WHERE guest_session_hash IS NOT NULL AND guest_claimed_at IS NULL;
