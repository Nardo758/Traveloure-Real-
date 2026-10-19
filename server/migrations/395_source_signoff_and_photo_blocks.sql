-- 395_source_signoff_and_photo_blocks.sql — CS-1 item 1 (ledger `2026-10-18-cs1-source-signoff`). HELD for the
-- decision-maker's comment on the PR. Additive and nullable; the new table is created EMPTY — no row is inserted by
-- this migration or by any deploy (rows are entered by Leon in admin).
--
-- content_sources: the sign-off and what the site's terms allow. NULL signoff_status reads as pending. No DEFAULT,
-- no CHECK (value sets are app-enforced in shared/source-signoff.ts), no index, no FK, no backfill.
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS signoff_status varchar(16);
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS signoff_by varchar;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS signoff_at timestamp;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS terms_class varchar(24);
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS automated_access_allowed boolean;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS credit_text text;

-- place_photo_blocks: per-place no_photos. A photo is hidden (and refused at upload) when its place id matches, or its
-- item / listing / nugget names a place whose normalised name and city match. Rows are never deleted by code.
CREATE TABLE IF NOT EXISTS place_photo_blocks (
  id varchar PRIMARY KEY,
  place_id varchar(255),
  place_name_normalised varchar(300),
  city varchar(150),
  reason text NOT NULL,
  set_by varchar NOT NULL,
  set_at timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_place_photo_blocks_place_id ON place_photo_blocks (place_id);
