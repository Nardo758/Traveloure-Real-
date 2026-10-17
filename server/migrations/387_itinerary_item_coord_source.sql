-- 387 — itinerary_items.coord_source (GC-1; ledger `2026-10-17-gc1-google-coords`). HELD until
-- "Migration 387 SQL approved — Leon" is on its PR.
--
-- Where a plan item's own coordinate came from. text, nullable, NO DEFAULT, NO CHECK, NO index, NO FK, NO
-- backfill. NULL = Google: every coordinate written before this column came from a Google Places pick or the
-- Google Geocoding API, or from somewhere nobody recorded, and is read as Google (decision-maker, Oct 16, 2026).
-- New writes stamp 'places' or 'geocode_google'; the value set is app-enforced once in shared/item-coord-source.ts.
-- Declared in shared/schema.ts (deploy-push durability rule). IF NOT EXISTS, so a second run is a no-op.
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS coord_source text;
