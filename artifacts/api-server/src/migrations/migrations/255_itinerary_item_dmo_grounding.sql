-- 255: DMO grounding link on itinerary_items (ledger 2026-08-23-item2-grounding).
-- Set by the build-time resolver when a free-text AI item matches a recognized DMO extracted place
-- (informational — a real pin + official/ticketing link, NOT platform-bookable; providerServiceId
-- keeps that job). Soft ref (no FK): dmo_extracted_places are replace-by-position child rows a
-- re-extract can renumber, so a hard FK would cascade-null on every refresh. Additive-nullable,
-- NO CHECK (publish-trap rule). Declared in shared/schema.ts. Behavior-neutral on apply.

ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS dmo_extracted_place_id varchar;
