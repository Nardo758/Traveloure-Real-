-- 365 — hotel_cache columns for LiteAPI static content (ledger `2026-10-10-s1-d1-liteapi`; brief
-- docs/planning/briefs/s1-d1-liteapi.md). APPROVED by Leon, Oct 10, 2026 (S1-d-1).
-- Six nullable columns, NO DEFAULT, NO CHECK, no backfill. The `provider` column and its 'amadeus' default
-- are untouched. One UNIQUE index on (provider, provider_hotel_id): every existing row has provider_hotel_id
-- NULL (the column is born here), and NULLs never collide, so the index cannot be violated at creation.
-- IF NOT EXISTS throughout, so a second run is a no-op. Columns and index are declared in shared/schema.ts.
--
-- Rates are never stored here (S1-d-1): only static content, written by the nightly LiteAPI sync.
ALTER TABLE hotel_cache ADD COLUMN IF NOT EXISTS provider_hotel_id varchar(100);
ALTER TABLE hotel_cache ADD COLUMN IF NOT EXISTS hotel_type_id integer;
ALTER TABLE hotel_cache ADD COLUMN IF NOT EXISTS guest_rating numeric(4,2);
ALTER TABLE hotel_cache ADD COLUMN IF NOT EXISTS main_image_url text;
ALTER TABLE hotel_cache ADD COLUMN IF NOT EXISTS fetched_at timestamp;
ALTER TABLE hotel_cache ADD COLUMN IF NOT EXISTS content_updated_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hotel_cache_provider_hotel ON hotel_cache (provider, provider_hotel_id);
