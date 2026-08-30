-- 257: anchor a variant was built around ("build around a location", ledger 2026-08-23-optimizer-anchors)
-- Additive-nullable, NO CHECK (publish-trap rule): the deploy-push enforces schema CHECKs before our
-- remap runs, so we keep anchor_type app-enforced ({hotel,neighborhood,activity}) rather than a DB CHECK.
-- NULL on every legacy variant and on Auto variants the AI didn't label. anchor_median_meters is the
-- phase-0 fit score (median metres to the trip's located stops) — a real figure or NULL, never 0 (§13).
ALTER TABLE itinerary_variants ADD COLUMN IF NOT EXISTS anchor_type varchar(20);
ALTER TABLE itinerary_variants ADD COLUMN IF NOT EXISTS anchor_name varchar(200);
ALTER TABLE itinerary_variants ADD COLUMN IF NOT EXISTS anchor_lat numeric(10,7);
ALTER TABLE itinerary_variants ADD COLUMN IF NOT EXISTS anchor_lng numeric(10,7);
ALTER TABLE itinerary_variants ADD COLUMN IF NOT EXISTS anchor_median_meters integer;
