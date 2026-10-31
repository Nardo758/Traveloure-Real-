-- 422 — discover_tile_panel_facts and discover_tile_panel_photos (row 303a).
--
-- Additive. No CHECK. No DEFAULT on reviewed_at or photo_rights_ticked:
-- NULL means not reviewed, and NULL means the photo-rights tick is unset.
-- Idempotent. Declared in shared/schema.ts so a publish push does not drop
-- the tables or the indexes.
--
-- HELD until the owner approves the SQL on the PR. 421 is PR #1804.
-- The citation form is in server/migrations/AUTHORING.md. This file does not
-- carry that sentence.

CREATE TABLE IF NOT EXISTS discover_tile_panel_facts (
  id varchar(64) PRIMARY KEY,
  tile_id varchar(200) NOT NULL,
  subject_kind varchar(16) NOT NULL,
  section varchar(24) NOT NULL,
  value text NOT NULL,
  source text,
  source_url text,
  checked_on date,
  reviewed_at timestamptz,
  fetched_at timestamptz,
  attribution text
);

CREATE INDEX IF NOT EXISTS idx_discover_tile_panel_facts_tile_id
  ON discover_tile_panel_facts (tile_id);

CREATE TABLE IF NOT EXISTS discover_tile_panel_photos (
  id varchar(64) PRIMARY KEY,
  tile_id varchar(200) NOT NULL,
  subject_kind varchar(16) NOT NULL,
  image_url text NOT NULL,
  credit text,
  source_url text,
  license_url text,
  photo_rights_ticked boolean,
  fetched_at timestamptz,
  attribution text,
  position integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_discover_tile_panel_photos_tile_position
  ON discover_tile_panel_photos (tile_id, position);
