-- 177_reconciliation_exceptions.sql — reconciliation-detection lane.
--
-- WHY THIS EXISTS
-- ───────────────
-- Recovery on the cart-checkout money path is three-layered (ruling 38's TTL sweep, ruling 39's
-- webhook + client-confirm promotion). DETECTION was one-eyed: `server/jobs/stripeReconciliation.ts`
-- scanned only the LEGACY `bookings` table, so a cart checkout — the primary checkout — was
-- invisible to the daily Stripe-vs-DB drift job. Nothing told anyone that money and the database
-- disagreed.
--
-- These two tables are that job's ops-visible output. Log lines are not a surface: a drift found at
-- 03:00 has to still be readable at 09:00, from an admin page, without grepping a container.
--
--   reconciliation_runs        — ONE row per pass, ALWAYS written, including a clean pass.
--                                "Zero exceptions" and "the job never ran" must not look the same.
--   reconciliation_exceptions  — one row per DISTINCT drift fact, stamped with the run that first
--                                detected it.
--
-- DELIBERATE POSTURES
--   * APPEND-ONLY. No app code carries an UPDATE or DELETE against reconciliation_exceptions
--     (item_transition_log / ruling 11 posture). Re-detection on a later pass is absorbed by the
--     UNIQUE `dedupe_key` + ON CONFLICT DO NOTHING, so a drift that persists for a month is ONE
--     row (first detection) rather than thirty — and the run row still records how many were
--     detected vs. how many were new, so "still drifting" stays visible without mutating a fact.
--   * NO DB CHECK on rail/kind/severity/status (migration-159/171 posture). Canonical vocabulary
--     lives in shared/schema.ts + the job. Nothing for preflight-prod-constraints.cjs's
--     CONSTRAINT_MANIFEST; no publish-time drizzle-push remap trap (new tables, no legacy rows).
--   * `booking_id` has NO FK, deliberately: the job must be able to name a booking id that does
--     NOT exist (that is one of the drift cases), and a financial-audit row must outlive the row
--     it indicts (the `refunds.booking_id ON DELETE SET NULL` rationale, taken one step further).
--   * `run_id` DOES cascade — an exception with no run has no provenance and is not worth keeping.
--   * Both tables AND every index are declared in shared/schema.ts in the SAME commit. The deploy
--     push is authoritative over objects it does not find declared there and WILL drop them, and a
--     stamped migration never recreates them (CLAUDE.md deploy-push rule, both variants).
--   * The UNIQUE index is safe to declare: the table is created empty by this migration, so no
--     pre-existing duplicate can fail the publish.

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  started_at TIMESTAMP NOT NULL DEFAULT now(),
  finished_at TIMESTAMP,
  -- scheduled | manual | test  (`trigger` is a reserved word — hence triggered_by)
  triggered_by VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  -- running | completed | skipped | failed
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  -- Oldest `created` timestamp this pass looked at, on BOTH the Stripe and the DB side.
  window_start TIMESTAMP,
  scanned_payment_intents INTEGER NOT NULL DEFAULT 0,
  scanned_charges INTEGER NOT NULL DEFAULT 0,
  scanned_refunds INTEGER NOT NULL DEFAULT 0,
  scanned_cart_bookings INTEGER NOT NULL DEFAULT 0,
  scanned_legacy_bookings INTEGER NOT NULL DEFAULT 0,
  -- Every drift found this pass, including ones already on record from an earlier pass.
  exceptions_detected INTEGER NOT NULL DEFAULT 0,
  -- Rows this pass actually inserted (detected minus already-recorded).
  exceptions_new INTEGER NOT NULL DEFAULT 0,
  -- The ONE narrow repair this job may perform: PI-succeeded / row-still-provisional, handed to
  -- the EXISTING shared promotion (promotePaidCheckout, actor=reconciliation). Never anything else.
  promoted INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE INDEX IF NOT EXISTS recon_runs_started_idx ON reconciliation_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  run_id VARCHAR NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  detected_at TIMESTAMP NOT NULL DEFAULT now(),
  -- cart (service_bookings) | legacy (bookings)
  rail VARCHAR(20) NOT NULL,
  -- The classification. See RECONCILIATION_EXCEPTION_KINDS in shared/schema.ts.
  kind VARCHAR(60) NOT NULL,
  -- critical (money is unaccounted for) | warning (a state to look at, no dollars at risk yet)
  severity VARCHAR(20) NOT NULL DEFAULT 'critical',
  -- Deterministic identity of the DRIFT FACT (not of the run). UNIQUE — this is what makes the
  -- append-only insert idempotent across daily passes.
  dedupe_key TEXT NOT NULL,
  booking_id VARCHAR,
  payment_intent_id VARCHAR(255),
  charge_id VARCHAR(255),
  -- DOLLARS, same precision/scale as service_bookings.total_amount (the value they compare to).
  expected_amount DECIMAL(10,2),
  actual_amount DECIMAL(10,2),
  currency VARCHAR(10),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS recon_exc_dedupe_idx ON reconciliation_exceptions (dedupe_key);
CREATE INDEX IF NOT EXISTS recon_exc_detected_idx ON reconciliation_exceptions (detected_at DESC);
CREATE INDEX IF NOT EXISTS recon_exc_run_idx ON reconciliation_exceptions (run_id);
