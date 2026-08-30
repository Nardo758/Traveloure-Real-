-- 188: open-data enrichment envelope on extracted places (source-map execution, decision-maker
-- directed Aug 9 2026; extends CLAUDE.md §20a). One additive nullable jsonb carrying facts from
-- explicitly-licensed open sources (Wikidata CC0, OSM ODbL): {officialUrl, openingHours,
-- heritage, wikidataId, osmId, source, fetchedAt}. Facts only, never prose (§13); NULL = not
-- enriched (the honest state). Expert-curated ticketing_url is a SEPARATE column and is never
-- overwritten by enrichment. Idempotent; declared in shared/schema.ts in the same commit
-- (publish-trap rule).

ALTER TABLE dmo_extracted_places ADD COLUMN IF NOT EXISTS enrichment jsonb;
