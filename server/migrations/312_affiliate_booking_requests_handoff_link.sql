-- Migration 312: THE HAND-OFF LINK — checkout of a Booking Concierge line creates the plan's
-- partner requests, and each request that comes from that hand-off remembers WHICH booking and
-- WHICH plan item it came from.
-- Ledger `2026-09-18-concierge-handoff`. CLAUDE.md Locked Decision 51 (the fee this hand-off
-- earns), Locked Decision 39/44 (the two rails this connects: `itinerary_items` and
-- `affiliate_booking_requests`), §13, §15 (the statement is the guard), §18 rule 1, §20.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WAS MISSING
-- ─────────────────────────────────────────────────────────────────────────────
-- `affiliate_booking_requests` already carries a nullable `trip_id` (migration 060) but nothing
-- ties a row to the SPECIFIC concierge purchase that produced it or to the SPECIFIC plan item it
-- is booking. Without that pair, a hand-off has no idempotency key: nothing stops a retried
-- promotion (the recovery twin `promotePaidCheckout` runs the exact same effect the primary
-- `promoteAuthorizedCheckout` path already ran) from filing the same partner item twice.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE SHAPE
-- ─────────────────────────────────────────────────────────────────────────────
-- Both columns additive, NULLABLE, NO DEFAULT, NO CHECK (the migration
-- 181/195/273/275/276/277/279/280/281/282/284/287/295/297/301..311 posture — a CHECK here is
-- exactly the publish-time drizzle-push failure CLAUDE.md's Coordination Prevention rules warn
-- about). NO BACKFILL: every row on disk today was born by a traveler's own affiliate-booking
-- request or the pre-hand-off pooled flow, and neither carries a booking or a plan item behind it
-- — leaving both NULL is the honest reading (§13), not a gap to fill.
--
--   itinerary_item_id  — the plan item (a partner item: `affiliate_product_id IS NOT NULL AND
--                         provider_service_id IS NULL`) this request is booking. ON DELETE SET
--                         NULL, the `service_route_points`/`trip_destinations` posture: deleting
--                         the plan item must never delete the booking-agent's record of having
--                         been asked to book it.
--   service_booking_id — the Booking Concierge purchase (`service_bookings`) whose checkout
--                         produced this request. ON DELETE SET NULL for the same reason.
--
-- The partial UNIQUE `(service_booking_id, itinerary_item_id) WHERE both NOT NULL` is the
-- idempotency guard ITSELF (§15: the statement is the guard, never a check-then-insert) — a
-- retried hand-off for the same booking and the same plan item inserts nothing a second time.
-- Legacy rows carrying NEITHER column never collide with each other or with a hand-off row,
-- because a partial index ignores any row where either side is NULL.
--
-- Both columns AND the index are DECLARED in `shared/schema.ts` in this same commit (deploy-push
-- durability rule): an object that file does not declare is dropped at publish and never
-- recreated, because the migration is already stamped.
--
-- `preflight-prod-constraints.cjs`: no CHECK is added or changed, so no new manifest entry is
-- needed. The UNIQUE index is safe to declare without a duplicate-row check first — both columns
-- are brand new and every existing row is NULL on both, so no row can violate a partial index that
-- only applies where both are NOT NULL.
--
-- Idempotent; safe to re-run.

ALTER TABLE affiliate_booking_requests
  ADD COLUMN IF NOT EXISTS itinerary_item_id VARCHAR
    REFERENCES itinerary_items(id) ON DELETE SET NULL;

ALTER TABLE affiliate_booking_requests
  ADD COLUMN IF NOT EXISTS service_booking_id VARCHAR
    REFERENCES service_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_abr_service_booking_id
  ON affiliate_booking_requests(service_booking_id)
  WHERE service_booking_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_abr_booking_item
  ON affiliate_booking_requests(service_booking_id, itinerary_item_id)
  WHERE service_booking_id IS NOT NULL AND itinerary_item_id IS NOT NULL;

COMMENT ON COLUMN affiliate_booking_requests.itinerary_item_id IS
  'Ledger 2026-09-18-concierge-handoff: the plan item (a partner item — affiliate_product_id set, provider_service_id NULL) this request is booking, when the request was born from a Booking Concierge hand-off. NULL = a traveler-initiated or pre-hand-off request with no plan-item behind it; never backfilled.';
COMMENT ON COLUMN affiliate_booking_requests.service_booking_id IS
  'Ledger 2026-09-18-concierge-handoff: the Booking Concierge purchase (service_bookings) whose checkout produced this request. NULL = not a hand-off row; never backfilled. Paired with itinerary_item_id under a partial UNIQUE index that is the exactly-once guard for the hand-off (the statement is the guard, §15).';
