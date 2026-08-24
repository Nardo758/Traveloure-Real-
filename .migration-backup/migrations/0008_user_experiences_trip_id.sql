-- Additive migration: link user_experiences to trips
-- Safe to run on an existing database (uses IF NOT EXISTS guards)

ALTER TABLE "user_experiences"
  ADD COLUMN IF NOT EXISTS "trip_id" varchar
    REFERENCES "trips"("id") ON DELETE SET NULL;
