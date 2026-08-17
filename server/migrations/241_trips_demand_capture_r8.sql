-- 241_trips_demand_capture_r8.sql
--
-- Partner Demand Data lane 2A.3 / R8 (ledger 2026-08-17-partner-demand-phase0-rulings R8;
-- capture-forward per R11). Two additive-nullable capture columns on `trips`, the party-size
-- DE-MASKING (drop the fabricated defaults), and a best-effort market_slug backfill.
--
-- ADDITIVE-NULLABLE, NO DB CHECK — the migration-181/195/228/239 posture (avoids the Replit
-- publish-time CHECK trap in CLAUDE.md). Both columns are declared in shared/schema.ts per the
-- publish-trap rule. A DROP DEFAULT never fails a deploy push (unlike an added CHECK), so this is
-- publish-safe; `preflight-prod-constraints` is N/A (no CHECK added).
--
--   origin_market — the traveler's stated origin at trip creation (free text as captured). NULL =
--     not asked / not answered (§13), never a default.
--   market_slug — the DESTINATION resolved to one of the 8 operating-market slugs (marketKey in
--     server/services/trend-engine/operating-markets.ts) at write time, or NULL for a destination
--     outside the 8 (R13 unmapped_destination bucket). Server-derived only (insertTripSchema omits
--     it); resolveMarketSlug() is the code equivalent of the backfill CASE below.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS origin_market VARCHAR(100),
  ADD COLUMN IF NOT EXISTS market_slug   VARCHAR(40);

COMMENT ON COLUMN trips.origin_market IS
  'R8 capture: traveler-stated origin market at trip creation (free text). NULL = not captured (§13), never a default.';
COMMENT ON COLUMN trips.market_slug IS
  'R8 capture: destination resolved to one of the 8 operating-market slugs (marketKey), or NULL when outside the 8 (R13 unmapped bucket). Server-derived (resolveMarketSlug), never client-set.';

-- Party-size DE-MASKING (R8): drop the fabricated 1/2/0 defaults so an omitted party size stays
-- NULL going forward — an honest "not captured" the demand rollup can tell apart from a real
-- count. Existing row values are untouched (DROP DEFAULT does not rewrite data). The ORM defaults
-- are removed in shared/schema.ts and the zod defaults become .optional() in the same change.
ALTER TABLE trips ALTER COLUMN number_of_travelers DROP DEFAULT;
ALTER TABLE trips ALTER COLUMN adults DROP DEFAULT;
ALTER TABLE trips ALTER COLUMN kids DROP DEFAULT;

-- Best-effort backfill of market_slug from the existing free-text destination (Q3 top-40 mapping
-- spec). Mirrors resolveMarketSlug EXACTLY: match the first comma-segment (lowercased, trimmed)
-- against a marketKey or cityName; anything else stays NULL (ambiguous → unmapped, §13). Only
-- Kyoto has real in-set volume today; Lisbon/San Francisco/Paris/Barcelona and junk stay NULL.
UPDATE trips
SET market_slug = CASE lower(trim(split_part(destination, ',', 1)))
  WHEN 'kyoto'     THEN 'kyoto'
  WHEN 'goa'       THEN 'goa'
  WHEN 'mumbai'    THEN 'mumbai'
  WHEN 'jaipur'    THEN 'jaipur'
  WHEN 'edinburgh' THEN 'edinburgh'
  WHEN 'porto'     THEN 'porto'
  WHEN 'bogota'    THEN 'bogota'
  WHEN 'bogotá'    THEN 'bogota'
  WHEN 'cartagena' THEN 'cartagena'
  ELSE NULL
END
WHERE market_slug IS NULL;

-- Rollup reads group trips by market_slug (partial — NULL rows are the R13 bucket, counted apart).
-- Declared in shared/schema.ts so the deploy push keeps it (publish-trap rule).
CREATE INDEX IF NOT EXISTS idx_trips_market_slug ON trips (market_slug) WHERE market_slug IS NOT NULL;
