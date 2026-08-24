-- Migration 236: X API raw_ref null constraint + enable all Phase 2 adapters
--
-- Part A: Belt-and-suspenders enforcement of R9.
--   The x_api adapter already writes raw_ref = NULL (code-level enforcement).
--   This DB CHECK constraint is the second enforcement layer: any INSERT or UPDATE
--   that would set raw_ref to a non-null value on an x_api row is rejected by the DB.
--   Historical rows must be repaired before the constraint is installed. This is
--   intentionally first so a retry after a partial apply can finish cleanly.
--   Test: INSERT INTO trend_signals (source, raw_ref, ...) VALUES ('x_api', '{}', ...)
--         must fail with "new row for relation ... violates check constraint".
--
--   DELIBERATELY NOT DECLARED IN shared/schema.ts (audit ledger row 113): this CHECK
--   lives ONLY in the migration. Declaring it in schema.ts would arm the Replit
--   deploy-push CHECK trap — the push enforces schema.ts CHECKs BEFORE runMigrations()
--   runs this remap, so a publish onto a prod whose x_api rows still hold non-null
--   raw_ref would fail destructively. Do NOT add it to schema.ts without first running
--   `node scripts/preflight-prod-constraints.cjs "<PROD_DATABASE_URL>"` and confirming
--   zero violating rows. The code-level enforcement (adapter writes raw_ref=NULL) is the
--   primary guard; this DB CHECK is defense-in-depth.
UPDATE trend_signals
SET raw_ref = NULL
WHERE source = 'x_api'
  AND raw_ref IS NOT NULL;

-- ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS form. The catalog guard
-- makes this safe when the previous attempt installed the constraint but failed
-- before the migration ledger entry was recorded.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'trend_signals'::regclass
      AND conname = 'chk_x_api_raw_ref_null'
  ) THEN
    ALTER TABLE trend_signals
      ADD CONSTRAINT chk_x_api_raw_ref_null
      CHECK (source != 'x_api' OR raw_ref IS NULL);
  END IF;
END
$$;

-- Part B: Enable all 8 Phase 2 adapters.
--   All adapters are built and credential-verified. Flip enabled = true so the
--   ingestion runner picks them up on the next daily() call.
--   Internal trips was added after the original Phase 1 seed on some databases,
--   so seed that missing config row before the shared enablement update.
INSERT INTO trend_source_config (
  source,
  enabled,
  decay_half_life_days,
  weight,
  monthly_cost_ceiling,
  resale_class,
  notes
)
VALUES (
  'internal_trips',
  true,
  30.0,
  0.25,
  NULL,
  'first_party',
  'First-party platform trip counts per market: active travelers + upcoming trips 30d. pre_launch=true before 2024-01-01.'
)
ON CONFLICT (source) DO NOTHING;

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
