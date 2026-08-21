-- 249_restore_travel_pulse_cities_unique_index.sql
--
-- Restore the normalized city/country guard after the production data operation
-- documented in docs/runbooks/travelpulse-city-reconciliation.md has been run.
-- This migration intentionally fails closed if duplicate production rows remain;
-- do not use publish's "copy development over production" recovery option.
CREATE UNIQUE INDEX IF NOT EXISTS travel_pulse_cities_city_country_unique
  ON travel_pulse_cities (lower(city_name), lower(country));