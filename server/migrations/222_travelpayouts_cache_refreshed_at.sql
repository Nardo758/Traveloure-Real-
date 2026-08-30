-- 221: Add refreshed_at to travelpayouts_cache so every cache upsert records
-- the true last-refresh time independently of the immutable created_at.
-- The shared-cache service stamps this on every onConflictDoUpdate write, so
-- operators querying /api/admin/travelpayouts-cache/status always see the real
-- last-refresh time even after the first insert was long ago.
-- NO DEFAULT: existing rows get NULL, which the status endpoint represents as
-- "unknown" rather than manufacturing a false deployment-time timestamp.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
ALTER TABLE travelpayouts_cache
  ADD COLUMN IF NOT EXISTS refreshed_at timestamp without time zone;
