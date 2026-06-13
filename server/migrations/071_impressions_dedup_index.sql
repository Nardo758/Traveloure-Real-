-- Migration 071: unique index on content_impressions for session-scoped dedup
-- First remove any duplicates (keep earliest row per session+type+content triple),
-- then create the unique index to enforce server-side dedup going forward.
DELETE FROM content_impressions
WHERE id NOT IN (
  SELECT DISTINCT ON (session_id, content_type, content_id) id
  FROM content_impressions
  ORDER BY session_id, content_type, content_id, created_at ASC
);

CREATE UNIQUE INDEX IF NOT EXISTS content_impressions_session_dedup
  ON content_impressions (session_id, content_type, content_id);
