-- Migration 116: content_impressions — complete the table for the live tracking endpoint.
--
-- GROUND TRUTH: the content_impressions table itself was ALREADY created by migration 082
-- (082_content_impressions.sql, registered), but it never had a writer — the client feed's
-- impression tracker (client/src/hooks/use-impression-tracker.ts) POSTs to
-- /api/tracking/impression, an endpoint that did not exist until the companion code change
-- to this migration. So on any migrated DB the CREATE TABLE below is a no-op; this
-- migration's real work is completing the table for the endpoint that now writes it:
--
--   1. session_id NOT NULL (guarded) — the tracker always sends a sessionId and the
--      endpoint requires it; guarded so a DB that somehow holds NULL rows is skipped,
--      never failed (analytics table — refusal would be disproportionate).
--   2. A UNIQUE index on (session_id, content_type, content_id) — the client hook's
--      contract comment promises "the server enforces its own unique index as a second
--      dedup layer"; this is that index. The endpoint inserts ON CONFLICT DO NOTHING and
--      returns the existing row's id on a duplicate, so attribution stays stable across
--      remount races. Guarded: if duplicate rows already exist, a plain (non-unique)
--      index is created instead (still serves session_id lookups) and a NOTICE is raised.
--      session_id leads the index, so it also serves plain session_id lookups.
--   3. A plain created_at index for time-window analytics scans.
--
-- (content_type, content_id) lookups are already served by 082's
-- idx_ci_content(content_type, content_id, created_at DESC) prefix — no duplicate index.
-- user_id keeps 082's FK → users ON DELETE SET NULL (harmless for analytics; never blocks
-- user deletion). Analytics-only table: no money semantics, fire-and-forget writes.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS; guarded ALTERs; safe to re-run.

-- Belt-and-braces for a hypothetical DB that skipped 082 (shape matches 082 exactly).
CREATE TABLE IF NOT EXISTS content_impressions (
  id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type   VARCHAR(50) NOT NULL,
  content_id     VARCHAR(255) NOT NULL,
  city           VARCHAR(100),
  card_position  INT,
  session_id     VARCHAR(255),
  user_id        VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 1. session_id NOT NULL (guarded — skip, never fail, if NULL rows exist).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM content_impressions WHERE session_id IS NULL) THEN
    ALTER TABLE content_impressions ALTER COLUMN session_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'Migration 116: content_impressions has NULL session_id rows — skipping SET NOT NULL';
  END IF;
END $$;

-- 2. Dedup unique index (session_id, content_type, content_id) — guarded on pre-existing dupes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM content_impressions
    GROUP BY session_id, content_type, content_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_session_content
      ON content_impressions(session_id, content_type, content_id);
  ELSE
    RAISE NOTICE 'Migration 116: duplicate (session_id, content_type, content_id) rows exist — creating non-unique index instead';
    CREATE INDEX IF NOT EXISTS uq_ci_session_content
      ON content_impressions(session_id, content_type, content_id);
  END IF;
END $$;

-- 3. Time-window scans.
CREATE INDEX IF NOT EXISTS idx_ci_created_at ON content_impressions(created_at);
