-- Migration 129 — Content location normalization, Lane A Phase 1.
-- Additive nullable coordinate columns on provider_services + a NEVER-FABRICATES backfill
-- from the real city_neighborhoods centroid source (109/109 rows have centroid_lat/lng NOT NULL).
--
-- Governing rules (CLAUDE.md Coordination Prevention — schema/migration change):
--   * ADDITIVE NULLABLE ONLY. No DB CHECK, no NOT NULL, no DEFAULT — so there is NO publish-time
--     drizzle-push CHECK-failure trap (matches the migration-124/125 additive posture).
--   * location_precision intended values are 'neighborhood_centroid' | 'exact', but we deliberately
--     do NOT add a CHECK — enforcement is a later lane.
--   * NULL is the honest state (the location='Unknown' lesson): rows without a resolvable
--     neighborhood keep all four columns NULL. NO defaults, NO city-center fallback, NO 'Unknown'.
--
-- The ~14 free-text ilike location readers are LEFT UNTOUCHED — columns are ADDED, not repurposed.

-- 1. Additive nullable columns (idempotent).
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7);
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS city VARCHAR;
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS location_precision VARCHAR;

-- 2. Backfill from city_neighborhoods centroids (NEVER FABRICATES).
--    provider_services.neighborhood holds a SLUG (CLAUDE.md: "soft reference into
--    city_neighborhoods.slug"); city_neighborhoods.slug is globally unique, so a slug match is
--    unambiguous. We match on slug first, then fall back to name (LOWER(TRIM) — the migration-011/012
--    case-insensitive pattern) for robustness, picking the single best neighborhood per row.
--    A match-miss simply leaves all four columns NULL (guarded: WHERE a match EXISTS + coords are NULL).
UPDATE provider_services ps
SET
  latitude           = m.centroid_lat,
  longitude          = m.centroid_lng,
  location_precision = 'neighborhood_centroid',
  city               = m.city
FROM (
  -- One neighborhood per provider_service, slug match preferred over name match.
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
