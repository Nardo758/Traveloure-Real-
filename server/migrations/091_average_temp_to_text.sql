-- 091: Change destination_seasons.average_temp from varchar(60) to text
-- Removes the length cap entirely so any future temperature description fits.
ALTER TABLE destination_seasons
  ALTER COLUMN average_temp TYPE text;
