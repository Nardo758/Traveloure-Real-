-- Ledger 2026-10-04-surface-step5-map-versions (R-ac). SQL HELD for the founder's ruling before merge.
-- ADDITIVE ONLY: one new table, born empty. No DEFAULT (created_at is set by the app), no CHECK, no
-- index, no FK, no seed. Declared in shared/schema.ts (deploy-push durability rule).
--
-- One row per FREE day re-time on the versions board. Counted against OPTIMIZER_FREE_RETIMES
-- (default 3) within 24 h of the paid run, same version. A re-time past the limit writes NO row and
-- does not re-time: it is answered with the fee and routed into the existing paid run.
--   run_id      the run the version belongs to (NULL when run records are off)
--   variant_id  the version (itinerary_variants.id) the day was adopted from
--   day         the day number re-timed
CREATE TABLE IF NOT EXISTS plan_day_retimes (
  id varchar PRIMARY KEY,
  trip_id varchar NOT NULL,
  run_id varchar,
  variant_id varchar,
  day integer NOT NULL,
  user_id varchar NOT NULL,
  created_at timestamp NOT NULL
);
