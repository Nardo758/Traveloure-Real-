-- 428 — selection_events (row 306, CS-3 brief 10: the selection profile).
--
-- One row per planner action, while the platform setting `selection_profile` is "true".
-- A row carries the action and four coarse fields only: stop type, neighbourhood, time of
-- day and price band. No place name, note, coordinate, trip id, or anything naming or
-- implying religion or health. Plain counts are read from it; nothing else is stored.
--
-- Additive. No CHECK (the value sets are app-enforced in shared/selection-profile.ts).
-- user_id cascades on account deletion. Idempotent. The table and its index are declared
-- in shared/schema.ts so a publish push does not drop them. The table is born empty, so
-- nothing exists to violate the index.
--
-- HELD until the owner approves the SQL on the PR.

CREATE TABLE IF NOT EXISTS selection_events (
  id varchar(64) PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action varchar(20) NOT NULL,
  stop_type varchar(20),
  neighbourhood varchar(120),
  time_of_day varchar(12),
  price_band varchar(12),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selection_events_user_created
  ON selection_events (user_id, created_at);
