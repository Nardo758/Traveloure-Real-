-- Ledger 2026-10-04-surface-step5-map-versions (step 5 rulings, decision-maker Oct 4, 2026). SQL HELD
-- for the founder's ruling before merge. ADDITIVE ONLY: three nullable columns. No DEFAULT, no CHECK,
-- no index, no FK, no backfill. Declared in shared/schema.ts (deploy-push durability rule).
--
--   itinerary_variant_items.source_item_id   the plan item (itinerary_items.id) this version stop
--       came from. Written when the plan is copied into a run (the baseline) and returned per stop by
--       the model for the three versions (validated against the copied ids — an id the plan did not
--       hold is dropped). NULL = no link (an older run, or a stop the version added): the board then
--       matches by listing, then title, and labels that day "matched by name".
--   itinerary_items.source_run_id             the optimizer run an ADOPTED day came from.
--   itinerary_items.source_variant_id         the version (itinerary_variants.id) it came from.
--       Both written ONLY by apply-days, on the items it writes. NULL = not adopted from a version.
--       Read later by trip_finals (per-day {run_id, variant}).
ALTER TABLE itinerary_variant_items ADD COLUMN IF NOT EXISTS source_item_id varchar;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS source_run_id varchar;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS source_variant_id varchar;
