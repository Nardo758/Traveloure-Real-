-- 160: the cart projection's SOURCE KEY — Trip-Canon Lane 1 (Reconcile), Phase 1b (W2).
-- Governing docs: docs/briefs/RECONCILE_PHASE1_SCOPE.md (§1 W2, §3 Phase 1b),
-- docs/briefs/ROUTING_STATE_CONTRACT.md (§2, "Projection sync" row: reads all routing states,
-- writes cart rows only), docs/planning/TRIP_CANON_MASTER_BRIEF.md.
--
-- ⚠️ FLAGGED FOR DECISION-MAKER RATIFICATION (CLAUDE.md Coordination Prevention — this is a
-- schema change). It rides the ALREADY-APPROVED projection design (W2: `cart_items` stays a
-- physical table but becomes a single-writer materialized projection of items in
-- `ready_for_checkout`). The design was approved without naming the key it needs, and the
-- projection is not expressible without one: `cart_items` today has NO link back to the
-- itinerary item it projects, so "upsert the row for THIS item / delete the row for THIS item"
-- has nothing to key on, and a projection keyed on (userId, serviceId) would silently collide
-- with — and clobber — legacy/guest/direct cart rows.
--
-- WHY NULLABLE, AND WHAT NULL MEANS: NULL is the honest marker for "this cart row is NOT a
-- projection" — every legacy row, every guest add, every direct add-to-cart. The projection sync
-- module NEVER reads, writes, or deletes a row whose `itinerary_item_id` is NULL. That is the
-- entire compatibility story for the nine Q1 consumers: the cart they see is byte-identical
-- unless a traveler explicitly routes a trip item to checkout.
--
-- ON DELETE CASCADE (deliberate, and the one place a cascade is right here): the projection row
-- has no independent existence — it IS the item's presence in the cart. If the itinerary item is
-- deleted, a surviving cart row would be an orphan the sync module could never clean up (its key
-- is gone) and checkout would happily charge for it. Contrast with `itinerary_items.booking_id`
-- (migration 159), which is ON DELETE SET NULL because the PLAN item survives its booking.
--
-- NO CHECK, NO DEFAULT, NO BACKFILL, NO NOT NULL → no publish-time drizzle-push remap trap
-- (CLAUDE.md "publish-time CHECK failure"); nothing to add to the preflight CONSTRAINT_MANIFEST.
-- Backfilling would be fabrication: no cart row today was ever produced by a routing transition.
--
-- The column AND the index are also declared in `shared/schema.ts` — per the CLAUDE.md deploy-push
-- durability rule, an object that exists only in migration SQL is DROPPED by the publish push and,
-- once this migration is stamped, never recreated.

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS itinerary_item_id VARCHAR;

DO $$ BEGIN
  ALTER TABLE cart_items
    ADD CONSTRAINT cart_items_itinerary_item_id_fkey
    FOREIGN KEY (itinerary_item_id) REFERENCES itinerary_items(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- The sync module's only lookup key: "find the projection row for this item" (upsert + delete),
-- and the read that proves a row is/is not a projection.
CREATE INDEX IF NOT EXISTS idx_cart_items_itinerary_item_id
  ON cart_items(itinerary_item_id);
