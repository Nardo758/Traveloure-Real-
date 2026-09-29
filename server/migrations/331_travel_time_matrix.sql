-- 331 — Kyoto travel-time matrix (Track A step A2; ledger `2026-09-29-a2-travel-time-matrix`;
-- product map §M3/§M4, ratified `2026-09-28-part2-m4-matrix-first`).
--
-- TWO NEW TABLES, both born empty, with their indexes; NO CHECK, NO DB DEFAULT beyond timestamps,
-- all declared in shared/schema.ts (the deploy-push durability rule). The UNIQUE indexes are on
-- tables this same file creates, so a publish prompt offering them is inside §20's new-object
-- carve-out. Idempotent: every statement is IF NOT EXISTS.
--
-- travel_time_matrix_refreshes — one row per refresh run: which market, which modes, how many
--   elements were asked for and returned, the unit prices the run was costed at (read from config
--   at run time, recorded so a later price change never rewrites what a past run cost), and why a
--   run stopped. Written only by the refresh job.
-- travel_time_matrix — one row per (market, origin centroid, destination centroid, mode): the
--   route's duration and distance as the Routes API returned them. NULL duration = the API found no
--   route for that pair (e.g. no transit at that hour) — never a guessed number (§13).

CREATE TABLE IF NOT EXISTS travel_time_matrix_refreshes (
  id varchar PRIMARY KEY,
  market_slug varchar(40) NOT NULL,
  modes text[] NOT NULL,
  centroid_hash varchar(64) NOT NULL,
  centroid_count integer NOT NULL,
  status varchar(20) NOT NULL,
  elements_requested integer NOT NULL,
  elements_returned integer,
  essentials_price_per_1000 decimal(10, 4) NOT NULL,
  pro_price_per_1000 decimal(10, 4) NOT NULL,
  estimated_list_cost_usd decimal(10, 2) NOT NULL,
  error text,
  started_at timestamp NOT NULL DEFAULT now(),
  finished_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_travel_time_matrix_refreshes_market_started
  ON travel_time_matrix_refreshes (market_slug, started_at);

CREATE TABLE IF NOT EXISTS travel_time_matrix (
  id varchar PRIMARY KEY,
  market_slug varchar(40) NOT NULL,
  origin_slug varchar(100) NOT NULL,
  dest_slug varchar(100) NOT NULL,
  mode varchar(10) NOT NULL,
  duration_seconds integer,
  distance_meters integer,
  refresh_id varchar REFERENCES travel_time_matrix_refreshes(id) ON DELETE SET NULL,
  computed_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS travel_time_matrix_pair_mode_uniq
  ON travel_time_matrix (market_slug, origin_slug, dest_slug, mode);
