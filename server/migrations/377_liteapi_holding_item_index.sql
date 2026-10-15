-- 377 — a LiteAPI booking awaiting review holds its item at the database too
-- (ledger `2026-10-15-liteapi-review-holds-item`; follow-up to `2026-10-15-liteapi-cancel-needs-review`, #1448).
--
-- Migration 371's partial UNIQUE allows at most one LIVE booking per itinerary item
-- (`booking`, `confirmed`, `cancelling`). #1448 added `needs_review` — a cancel LiteAPI refused with a definite
-- 4xx, so whether the hotel booking still stands is unknown — and it must hold the item the same way. The app
-- guarded it with a NOT EXISTS on the book claim; this index makes the database the guard.
--
-- INDEX ONLY: no column, no data, no CHECK, no DEFAULT. Declared in shared/schema.ts (deploy-push rule).
-- The new index is created BEFORE the old one is dropped, under a new name, so no instant leaves an item
-- unguarded; the file runs as one statement batch (one implicit transaction).
-- PRECONDITION (it fails the boot otherwise): no item has more than one row in the four statuses —
--   SELECT itinerary_item_id, count(*) FROM liteapi_bookings
--   WHERE status IN ('booking','confirmed','cancelling','needs_review') GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_liteapi_bookings_holding_item ON liteapi_bookings (itinerary_item_id)
  WHERE status IN ('booking', 'confirmed', 'cancelling', 'needs_review');
DROP INDEX IF EXISTS uq_liteapi_bookings_live_item;
