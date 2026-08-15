-- 221: unique index on fever_event_cache(event_id) so concurrent cache-miss
-- fetches cannot insert duplicate rows for the same Fever event.
-- Duplicate rows (if any exist from the pre-index era) are removed first by
-- keeping the most-recently-updated copy. Fully idempotent via IF NOT EXISTS.

-- 1. Remove duplicates: keep the row with the latest last_updated per event_id.
DELETE FROM fever_event_cache
WHERE id NOT IN (
  SELECT DISTINCT ON (event_id) id
  FROM fever_event_cache
  ORDER BY event_id, last_updated DESC NULLS LAST
);

-- 2. Add the unique index (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fever_event_cache_event_id
  ON fever_event_cache (event_id);
