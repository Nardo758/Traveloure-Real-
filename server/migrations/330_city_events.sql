-- Migration 330: CITY EVENTS — the rows behind "Coming up in our cities".
--
-- Ledger `2026-09-28-city-events` (decision-maker dispatch "landing page reorder", item 6,
-- Sep 28, 2026). §13, §20.
--
-- ONE additive table, born empty. A row is one festival or one-night show in an operating city.
--   * `source` is `manual` (the hand-kept seed) or `ticketmaster` (reserved: nothing writes it
--     yet). App-enforced in shared/city-events.ts, NO CHECK (publish-trap posture).
--   * (source, source_id) is UNIQUE: the seeder inserts only, keyed on it.
--   * `neighbourhood_id` and `nights` are derived by the seeder, never typed: the nearest
--     same-city `city_neighborhoods` row when the venue and that row both have coordinates, else
--     NULL (never a guess); nights = local calendar days start..end, inclusive.
--   * No row is ever deleted: a withdrawn event gets `withdrawn_at`.
--   * NO DB DEFAULT on `id` (the app supplies it, as shared/schema.ts declares).
-- Table and both indexes are declared in shared/schema.ts in the same commit (deploy-push rule).
-- The UNIQUE index is on a table this migration creates, so no existing row can violate it.
CREATE TABLE IF NOT EXISTS city_events (
  id               VARCHAR PRIMARY KEY,
  source           VARCHAR(20) NOT NULL,
  source_id        VARCHAR(200) NOT NULL,
  series           VARCHAR(200),
  title            VARCHAR(300) NOT NULL,
  city             VARCHAR(100) NOT NULL,
  venue            VARCHAR(300) NOT NULL,
  venue_lat        DOUBLE PRECISION,
  venue_lng        DOUBLE PRECISION,
  neighbourhood_id VARCHAR REFERENCES city_neighborhoods(id) ON DELETE SET NULL,
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ,
  nights           INTEGER NOT NULL,
  ticket_url       TEXT,
  billed_artists   TEXT,
  blurb            TEXT,
  image_path       TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  withdrawn_at     TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS city_events_source_uniq
  ON city_events (source, source_id);

CREATE INDEX IF NOT EXISTS city_events_starts_at_idx
  ON city_events (starts_at);
