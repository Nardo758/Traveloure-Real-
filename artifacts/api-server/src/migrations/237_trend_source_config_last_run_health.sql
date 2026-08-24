-- 237: Trend Source Config — last-run health columns
--
-- Adds per-source last-run tracking so the health panel reflects actual run outcomes,
-- not only ceiling-halt state. A source failing its last N runs shows 'degraded';
-- "healthy" means the last run succeeded (Item C, corrective dispatch 2).
--
-- consecutive_failures: incremented on each failure, reset to 0 on success.
-- Health transitions:  success → 'healthy'  (consecutive_failures = 0)
--                      failure, consecutive < 2 → health unchanged
--                      failure, consecutive ≥ 2 → 'degraded'
-- 'halted_ceiling' continues to be set by cost-enforcement.ts on ceiling breach.

ALTER TABLE trend_source_config
  ADD COLUMN IF NOT EXISTS last_run_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_status      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS last_run_error       TEXT,
  ADD COLUMN IF NOT EXISTS last_run_inserted_rows INTEGER,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
