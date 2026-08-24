-- Migration 231: Fix travel_pulse_cities_city_country_unique for production
--
-- Migration 230's CREATE UNIQUE INDEX failed on production because duplicate
-- (city_name, country) rows survived its CTE-DELETE step. Root cause: production
-- had more duplicate entries than dev; the window-function DELETE in 230 is
-- correct but left no audit trail if any rows were skipped due to type coercion
-- or NULL-handling edge cases.
--
-- This migration uses a simpler MIN(id) GROUP BY dedup (no window functions,
-- no CTEs) which is guaranteed to handle NULL city_name/country correctly, then
-- drops and recreates the index cleanly.

-- Step 1: Drop index if it was partially created or left in a broken state.
DROP INDEX IF EXISTS travel_pulse_cities_city_country_unique;

-- Step 2: Fresh dedup — for every (lower city_name, lower country) group,
-- keep the single row with the lowest id. MIN(id) is stable and never NULL
-- (id is a PK). NOT IN is safe here because the subquery returns only non-NULL
-- integers (PK values).
DELETE FROM travel_pulse_cities
WHERE id NOT IN (
  SELECT MIN(id)
  FROM travel_pulse_cities
  GROUP BY lower(city_name), lower(country)
);

-- Step 3: Create the guard index now that duplicates are fully removed.
CREATE UNIQUE INDEX travel_pulse_cities_city_country_unique
  ON travel_pulse_cities (lower(city_name), lower(country));
