/**
 * Discover tile detail panel (row 303a). Held DDL.
 *
 * Not registered in MIGRATION_FILES and not applied on boot. The read answers
 * store "absent" until this DDL is registered. The follow-up that registers it
 * also declares the tables in shared/schema.ts in the same change, so a publish
 * push does not drop them.
 *
 * HELD for Leon's comment before this DDL is registered. This text does not
 * carry a migration approval sentence.
 *
 * Additive. No CHECK. No DEFAULT on reviewed_at or photo_rights_ticked:
 * NULL means not reviewed, and NULL means the photo-rights tick is unset.
 * Idempotent.
 */
export const DISCOVER_TILE_PANEL_HELD_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS discover_tile_panel_facts (
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
)`,
  `CREATE INDEX IF NOT EXISTS idx_discover_tile_panel_facts_tile_id
  ON discover_tile_panel_facts (tile_id)`,
  `CREATE TABLE IF NOT EXISTS discover_tile_panel_photos (
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
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_discover_tile_panel_photos_tile_position
  ON discover_tile_panel_photos (tile_id, position)`,
];

export const DISCOVER_TILE_PANEL_HELD_SQL = DISCOVER_TILE_PANEL_HELD_STATEMENTS.join(";\n\n") + ";\n";
