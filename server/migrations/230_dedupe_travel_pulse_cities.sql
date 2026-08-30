-- 230_dedupe_travel_pulse_cities.sql
-- Remove duplicate city rows from travel_pulse_cities (two seed paths could both
-- insert the same city, e.g. Tokyo/Japan and Sydney/Australia).
-- Keep the row with the highest pulse_score; tie-break on newest created_at.
-- Then add a unique index on (lower(city_name), lower(country)) so the DB
-- rejects any future duplicate insert.

-- Step 1: Delete duplicates — keep the best row per (city_name, country) pair.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(city_name), lower(country)
      ORDER BY pulse_score DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM travel_pulse_cities
)
DELETE FROM travel_pulse_cities
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- Step 2: Guard — unique index on the normalised pair so no future seed/insert
-- can reintroduce a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS travel_pulse_cities_city_country_unique
  ON travel_pulse_cities (lower(city_name), lower(country));
