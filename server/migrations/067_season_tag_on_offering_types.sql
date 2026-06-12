-- Task #601: Add season_tag to service_offering_types.
--
-- Seasonal offerings (e.g. cherry_blossom_photo) should only surface when the
-- traveler's date range overlaps the season window. Without this column every
-- offering is shown year-round. NULL = non-seasonal = always visible.
--
-- Idempotent: IF NOT EXISTS guards the column add; UPDATE ... WHERE is safe
-- to re-run (idempotent).

ALTER TABLE service_offering_types
ADD COLUMN IF NOT EXISTS season_tag VARCHAR(100);

-- Seed known seasonal offerings
UPDATE service_offering_types SET season_tag = 'cherry_blossom' WHERE offering_type_key = 'cherry_blossom_photo';
UPDATE service_offering_types SET season_tag = 'fringe_festival'  WHERE offering_type_key = 'fringe_insider';
