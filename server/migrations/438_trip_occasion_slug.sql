-- 438_trip_occasion_slug.sql
-- A-35 (ledger 2026-11-05-lane3-occasion): the plan's fine occasion, as the `experience_types` slug the catalog resolved.
-- Shape per the Lane 3 rulings (Nov 5, 2026): occasion_slug varchar(64) NULL on trips. NULL = no occasion was picked
-- (A-8: never a default). No default, no CHECK, no index, no backfill; declared in shared/schema.ts (publish-trap rule).
-- Written by PATCH /api/trips/:tripId/occasion and the guest plan create; the guest claim carries it on the same row.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS occasion_slug varchar(64);
