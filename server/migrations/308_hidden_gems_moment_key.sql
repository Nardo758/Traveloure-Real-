-- A curated gem photo may replace a landing Moment's representative image only when an expert
-- explicitly associates it with that Moment. Existing rows remain NULL because city alone is not
-- enough information to infer an occasion honestly.
ALTER TABLE "travel_pulse_hidden_gems"
  ADD COLUMN IF NOT EXISTS "moment_key" varchar(30);

CREATE INDEX IF NOT EXISTS "travel_pulse_hidden_gems_city_moment_key_idx"
  ON "travel_pulse_hidden_gems" (LOWER(TRIM("city")), "moment_key")
  WHERE "moment_key" IS NOT NULL;