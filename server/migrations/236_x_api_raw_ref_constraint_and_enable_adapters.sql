-- Migration 236: X API raw_ref null constraint + enable all Phase 2 adapters
--
-- Part A: Belt-and-suspenders enforcement of R9.
--   The x_api adapter already writes raw_ref = NULL (code-level enforcement).
--   This DB CHECK constraint is the second enforcement layer: any INSERT or UPDATE
--   that would set raw_ref to a non-null value on an x_api row is rejected by the DB.
--   Test: INSERT INTO trend_signals (source, raw_ref, ...) VALUES ('x_api', '{}', ...)
--         must fail with "new row for relation ... violates check constraint".
ALTER TABLE trend_signals
  ADD CONSTRAINT chk_x_api_raw_ref_null
  CHECK (source != 'x_api' OR raw_ref IS NULL);

-- Part B: Enable all 8 Phase 2 adapters.
--   All adapters are built and credential-verified. Flip enabled = true so the
--   ingestion runner picks them up on the next daily() call.
--   Note: this is a pure config-row update — no application redeploy needed.
UPDATE trend_source_config
SET enabled = true,
    updated_at = NOW()
WHERE source IN (
  'wikimedia_pageviews',
  'gdelt',
  'nager_date',
  'open_meteo',
  'internal_trips',
  'besttime',
  'predicthq',
  'x_api'
);
