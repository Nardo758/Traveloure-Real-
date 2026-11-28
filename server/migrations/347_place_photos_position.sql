-- V31 (Leon, Nov 27 2026; supersedes the HELD note on Migration 346): a place_photo's place in its item's gallery.
--
-- ADDITIVE ONLY: one nullable integer column. No default, no backfill, no index (the table is small and the read is one
-- item at a time), no FK (place_id stays untyped by Step 0 ruling 3). A NULL position means "unordered": the reader sorts
-- NULLS LAST behind the numbered rows, so every existing row keeps rendering and a gallery can be ordered one row at a time.
--
--   position 0..n-1, 0 = the cover; the reader returns at most 8 per item.
--
-- SQL HELD FOR LEON: "Migration 347 SQL approved - Leon" must be on the PR before this runs anywhere but a local copy.

ALTER TABLE place_photos ADD COLUMN IF NOT EXISTS position integer;
