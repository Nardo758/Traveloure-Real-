-- Migration 083: Deduplication index on content_impressions.
--
-- Source-branch file: 071_impressions_dedup_index.sql
--
-- Adds a partial composite index on content_impressions to support efficient
-- deduplication queries — finding whether a given user/session already saw a
-- content item in the same page load. Partial (WHERE user_id IS NOT NULL AND
-- session_id IS NOT NULL) so anonymous, session-less impressions are exempt.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS; safe to re-run.

CREATE INDEX IF NOT EXISTS idx_ci_dedup_user_session
  ON content_impressions(content_type, content_id, user_id, session_id)
  WHERE user_id IS NOT NULL AND session_id IS NOT NULL;
