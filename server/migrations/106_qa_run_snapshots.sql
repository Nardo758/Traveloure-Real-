-- 106: qa_run_snapshots — stores each nightly QA run result for diff reporting.
-- Each row holds the full results JSON, aggregate counts, and trigger source.
CREATE TABLE IF NOT EXISTS qa_run_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  triggered_by  TEXT NOT NULL DEFAULT 'scheduled',  -- 'scheduled' | 'manual'
  results       JSONB NOT NULL DEFAULT '{}',
  pass_count    INTEGER NOT NULL DEFAULT 0,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  partial_count INTEGER NOT NULL DEFAULT 0,
  total_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS qa_run_snapshots_ran_at_idx ON qa_run_snapshots (ran_at DESC);
