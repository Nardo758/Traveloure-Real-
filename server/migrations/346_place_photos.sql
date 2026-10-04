-- Ledger 2026-10-04-step6-trip-card (surface spec v1.3.4 R-aq; step 6 brief). SQL HELD for the
-- founder's ruling before merge. ADDITIVE ONLY: one new table, born empty. Identity columns NOT NULL
-- (new-table rule, clarified Oct 4, 2026); every other column nullable. No DEFAULT (created_at is set
-- by the app), no CHECK (the source set ours|wikimedia is app-enforced in shared/place-photos.ts), no
-- index beyond the primary key, no FK, no seed. Declared in shared/schema.ts (deploy-push durability).
--
-- A photo is a FACT: one row per place reference we may show, with its origin, licence and
-- attribution. Only `ours` and `wikimedia` rows are ever stored — a Google Place Photo is fetched live
-- per render and NEVER persisted (R-aq), so `google_live` never appears in this table.
--   place_id      the Google place id the photo belongs to (or our own listing id for `ours`)
--   source        ours | wikimedia
--   url_or_asset  the image URL (Wikimedia file URL) or our asset id
--   licence       e.g. "CC BY-SA 4.0"
--   attribution   the text rendered with the image (author · licence · source)
--   checked_at    when the reference was last confirmed
CREATE TABLE IF NOT EXISTS place_photos (
  id varchar PRIMARY KEY,
  place_id varchar NOT NULL,
  source text NOT NULL,
  url_or_asset text,
  licence text,
  attribution text,
  checked_at timestamp,
  created_at timestamp
);
