-- 436_itinerary_item_one_per_source.sql
-- A-11 (ledger 2026-11-05-lane1-guest-save-rail): one plan item per source content row. Shape per the Lane 1 rulings
-- (Nov 5, 2026): a unique index on (trip_id, content_type, content_id) WHERE content_id IS NOT NULL; a double submit
-- answers the existing row (guest-plan.service.ts saveGuestPlanItem; storage.createItineraryItem's Viator branch).
-- Index only; declared in shared/schema.ts (publish-trap rule). No data step: run the duplicate check on the PR
-- against production before approving — a duplicate pair makes this statement fail at boot.
CREATE UNIQUE INDEX IF NOT EXISTS itinerary_items_trip_content_uidx ON itinerary_items (trip_id, content_type, content_id)
  WHERE content_id IS NOT NULL;
