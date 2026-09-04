-- Migration 278: a PLAN CARRIES ITS OWN TIMEZONE.
-- Ledger `2026-09-04-plan-mint`, CLAUDE.md entry 30. Additive, nullable, NO DEFAULT, NO CHECK,
-- no backfill (the migration-181/195/273/275/276/277 posture — a CHECK over an app-enforced value
-- set is exactly the publish-time drizzle-push failure CLAUDE.md's Coordination Prevention notes
-- warn about). The column is ALSO declared in `shared/schema.ts` in this same commit: per the
-- deploy-push durability rule, a DB object the code depends on that `schema.ts` does not declare
-- is dropped by Replit's publish-time push and NEVER recreated (the stamped migration will not
-- re-run).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: A TIME WITH NO ZONE IS RENDERED IN THE READER'S ZONE, NOT THE PLAN'S
-- ─────────────────────────────────────────────────────────────────────────────
-- Nothing on a trip said what zone its times were in. (`vendors.service_timezone` exists but is a
-- provider's own operating zone — a different fact about a different row.) So the calendar export
-- `server/utils/ics-calendar.ts` emitted DTSTART/DTEND with no TZID and no trailing `Z`, which is
-- RFC 5545 FLOATING time: every calendar client renders it in whatever zone the READER is in. A
-- 16:00 ceremony in Tuscany showed up as 16:00 for a guest in Sydney. That is an active
-- correctness bug for every out-of-zone guest, and it cannot be fixed by touching the exporter
-- alone, because the fact it needs — the plan's zone — did not exist anywhere.
--
--   timezone — the ONE IANA zone (e.g. 'Asia/Tokyo') the plan's wall-clock times are read in.
--       `itinerary_items.start_time` / `end_time` remain varchar(10) WALL-CLOCK strings and are
--       NOT converted by this migration or by any reader: this column says what zone those
--       strings mean, it does not re-encode them. No stored value moves.
--
-- NULL MEANS NOT CAPTURED, AND THAT IS A FINISHED ANSWER (§13). Every row on disk today is NULL
-- and stays NULL — deriving a zone for a historical trip from its free-text destination would be
-- a guess dressed as a fact. A reader that meets NULL keeps TODAY'S behaviour exactly (the .ics
-- stays floating) and says why in a comment; it must never substitute UTC, the server's zone, or
-- the nearest-looking market. A wrong zone is worse than an honest floating time because it looks
-- authoritative.
--
-- SERVER-DERIVED, NEVER CLIENT-SET (§14 posture, same placement as `trips.market_slug`):
-- `insertTripSchema` omits the column and `storage.createTrip`/`updateTrip` derive it from the
-- destination via `server/services/trip-timezone.ts` — a LAUNCH-MARKET lookup over the existing
-- 8-market config, not a geocoder and not a network call.
--
-- varchar(64) matches the existing `vendors.service_timezone` width — the longest real IANA id
-- ('America/Argentina/ComodRivadavia', 32 chars) fits with room to spare.
--
-- Idempotent; safe to re-run.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

COMMENT ON COLUMN trips.timezone IS
  'IANA timezone the plan''s wall-clock item times are read in (migration 278, ledger 2026-09-04-plan-mint). NULL = not captured: readers keep floating/local-free behaviour and say so; never substitute UTC or the server zone. Server-derived from the destination at write time (never client-settable).';
