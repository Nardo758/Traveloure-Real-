-- 336 — Optimizer run records (Track A step A9; product map §N2/§N4, RATIFIED Sep 28, 2026 with the
-- N4 amendment; ledger `2026-09-30-a9-run-records`). HELD FOR RULING by the decision-maker's
-- instruction of Sep 30, 2026 ("Each PR stays draft and held until I rule on its migration file").
--
-- ADDITIVE ONLY. Two new tables, born empty, and one nullable column. NO DEFAULT, NO CHECK, NO INDEX,
-- NO BACKFILL — the publish-trap posture (migrations 181/195/273/…); value sets are app-enforced; all
-- three objects are declared in shared/schema.ts (deploy-push durability). Idempotent (IF NOT EXISTS
-- everywhere). The migration-336 rule (decision-maker, Sep 30, 2026): the NEW tables may carry their own
-- PK and FKs (R188 rules `optimizer_runs.trip_id` a nullable FK ON DELETE SET NULL); the EXISTING table
-- gets only `ADD COLUMN IF NOT EXISTS` — NO FK constraint on `itinerary_variants`, whose link to its run
-- is APP-ENFORCED (an FK on an existing table takes a validation lock and is outside the §20 carve-out).
--
-- optimizer_runs — one row per authorized run, INSERT-ONLY (its one writer exposes no UPDATE/DELETE).
--   trip_id / comparison_id ON DELETE SET NULL: a paid run is a money record and outlives its plan
--   (R196, `2026-09-28-part2-n4-runs-outlive-plan`). The prompt text is never stored, only its hash.
-- optimizer_run_outcomes — append-only child rows (adopted_whole | adopted_part | option_chosen |
--   booking_created), written at the moment each happens, never reconstructed.
-- itinerary_variants.run_id — the run each version belongs to; NULL = a version from before this
--   record existed (§13), never backfilled.

CREATE TABLE IF NOT EXISTS optimizer_runs (
  id varchar PRIMARY KEY,
  trip_id varchar REFERENCES trips(id) ON DELETE SET NULL,
  comparison_id varchar REFERENCES itinerary_comparisons(id) ON DELETE SET NULL,
  authorization_basis varchar(20),
  payment_intent_id varchar(255),
  toll_run_id varchar(64),
  input_snapshot jsonb,
  model_version varchar(100),
  prompt_sha256 varchar(64),
  created_by varchar,
  created_at timestamp
);

CREATE TABLE IF NOT EXISTS optimizer_run_outcomes (
  id varchar PRIMARY KEY,
  run_id varchar REFERENCES optimizer_runs(id),
  kind varchar(30),
  variant_id varchar,
  variant_item_ids jsonb,
  set_id varchar,
  option_id varchar,
  booking_id varchar,
  actor_id varchar,
  created_at timestamp
);

ALTER TABLE itinerary_variants ADD COLUMN IF NOT EXISTS run_id varchar;

