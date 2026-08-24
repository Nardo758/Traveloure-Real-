-- Migration 162 — Provider-services coordinate re-backfill (post-129 rows).
--
-- Problem: migration 129 backfilled latitude/longitude/city/location_precision on
-- provider_services from city_neighborhoods centroids as a ONE-TIME pass at the
-- time it ran. Rows inserted AFTER 129 (notably by the Kyoto/popular-cities seed
-- scripts, which set `neighborhood` but never set coordinates) were never touched
-- and are still NULL-coordinate even though most of them carry a resolvable
-- neighborhood — so items pulled from the Platform-services pill into an expert
-- build never get a map pin.
--
-- This migration is DATA-ONLY: it re-runs migration 129's exact backfill logic
-- (slug-first, then LOWER(TRIM(name)) fallback match against city_neighborhoods,
-- guarded WHERE latitude IS NULL so it is idempotent — a re-run is a no-op) against
-- the CURRENT table contents, catching every row 129 missed. NO fabrication: rows
-- whose `neighborhood` does not resolve to any city_neighborhoods row keep all
-- four columns NULL (the migration-129 "no city-center fallback, no 'Unknown'"
-- rule holds here too).
--
-- No schema change: latitude/longitude/city/location_precision were added by
-- migration 129 and are already declared (nullable) in shared/schema.ts — verified,
-- not touched. No CHECK constraint added or changed → nothing for the preflight
-- CONSTRAINT_MANIFEST, no publish-time drizzle-push trap (a pure data UPDATE).

UPDATE provider_services ps
SET
  latitude           = m.centroid_lat,
  longitude          = m.centroid_lng,
  location_precision = 'neighborhood_centroid',
  city               = m.city
FROM (
  -- One neighborhood per provider_service, slug match preferred over name match
  -- (same preference order as migration 129).
  SELECT DISTINCT ON (src.id)
    src.id AS ps_id, cn.centroid_lat, cn.centroid_lng, cn.city
  FROM provider_services src
  JOIN city_neighborhoods cn
    ON LOWER(TRIM(cn.slug)) = LOWER(TRIM(src.neighborhood))
    OR LOWER(TRIM(cn.name)) = LOWER(TRIM(src.neighborhood))
  WHERE src.neighborhood IS NOT NULL
    AND TRIM(src.neighborhood) <> ''
  ORDER BY src.id, (LOWER(TRIM(cn.slug)) = LOWER(TRIM(src.neighborhood))) DESC  -- prefer the slug match
) m
WHERE ps.id = m.ps_id
  AND ps.latitude IS NULL;  -- idempotent: re-run is a no-op for already-backfilled rows
