-- Migration 314: A QUOTE IS LINKED TO THE PLAN IT WAS ASKED FROM.
--
-- Ledger `2026-09-19-quote-plan-link`. CLAUDE.md Locked Decision 49 (as amended). §13, §15, §18
-- rule 1, §19, §20.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WAS MISSING
-- ─────────────────────────────────────────────────────────────────────────────
-- PR #988 made a quote-born booking carry the traveler service fee, waived when its trip holds a
-- Trip Pass (`resolveQuoteCharge` reads `b.trip_id` -> `coversAction`) — but `service_quotes`
-- (migration 305) had no column naming the plan a quote was asked from, so the waiver could never
-- fire for a real quote and the service page's own resolved plan context (`resolveTargetTripId`)
-- was posted nowhere.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE SHAPE
-- ─────────────────────────────────────────────────────────────────────────────
-- Both columns additive, NULLABLE, NO DEFAULT, NO CHECK (the migration
-- 181/195/273/275/276/277/279/280/281/282/284/287/295/297/301..313 posture — a CHECK here is
-- exactly the publish-time drizzle-push failure CLAUDE.md's Coordination Prevention rules warn
-- about). NO BACKFILL: every `service_quotes` row on disk today was asked with no plan in mind,
-- and leaving both NULL is the honest reading (§13), not a gap to fill — every existing reader
-- keeps today's behaviour for a NULL `trip_id`.
--
--   trip_id             — the plan the traveler was asking from, when they asked from one.
--                          ON DELETE SET NULL: deleting the plan must never delete the quote or
--                          the offer conversation behind it (the `trip_destinations` /
--                          `service_route_points` posture).
--   itinerary_item_id    — the plan's OWN item for this exact listing, when one already existed at
--                          request time. ON DELETE SET NULL for the same reason. Server-verified at
--                          request time (the item must belong to `trip_id` AND reference this
--                          `provider_services` row) — never trusted from the body alone (§14).
--
-- An index on `trip_id` supports "quotes asked from this plan" reads without a sequential scan.
-- No UNIQUE: a traveler may ask more than one quote from the same plan (different listings, or a
-- re-quote after `superseded_by`).
--
-- Both columns AND the index are DECLARED in `shared/schema.ts` in this same commit (deploy-push
-- durability rule): an object that file does not declare is dropped at publish and never
-- recreated, because the migration is already stamped.
--
-- `preflight-prod-constraints.cjs`: no CHECK is added or changed, so no new manifest entry is
-- needed.
--
-- Idempotent; safe to re-run.

ALTER TABLE service_quotes
  ADD COLUMN IF NOT EXISTS trip_id VARCHAR
    REFERENCES trips(id) ON DELETE SET NULL;

ALTER TABLE service_quotes
  ADD COLUMN IF NOT EXISTS itinerary_item_id VARCHAR
    REFERENCES itinerary_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_quotes_trip_id
  ON service_quotes(trip_id)
  WHERE trip_id IS NOT NULL;

COMMENT ON COLUMN service_quotes.trip_id IS
  'Ledger 2026-09-19-quote-plan-link: the plan (trips row) the traveler was asking from, when they asked from one. Server-verified at request time (verifyTripOwnership); never client-trusted beyond that. NULL = not asked from a plan; never backfilled.';
COMMENT ON COLUMN service_quotes.itinerary_item_id IS
  'Ledger 2026-09-19-quote-plan-link: the plan''s own item for this listing, when one already existed at request time. Requires trip_id. Server-verified (the item must belong to trip_id AND reference this provider_services row). NULL = no existing plan item named; never backfilled.';
