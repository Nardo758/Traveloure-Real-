-- Migration 158: retire `service_demand_requests` DELIBERATELY, rather than letting the
-- deploy tool decide by default.
--
-- WHY THIS IS A MIGRATION AND NOT "just leave it undeclared". The table is created by
-- migration 080 (and by the 000 baseline dump) but is absent from `shared/schema.ts`, and the
-- publish-time drizzle-kit push is authoritative over objects the schema does not declare —
-- proven by observing the push plan emit, for this exact table:
--     ALTER TABLE "service_demand_requests" DISABLE ROW LEVEL SECURITY;
--     DROP TABLE "service_demand_requests" CASCADE;
-- So the table was going to disappear at the next publish either way. The only real choice was
-- whether the removal is a RECORDED decision or an invisible side effect of a deploy. Doing it
-- here also makes the end state deterministic in every environment — including a fresh one,
-- where the baseline and 080 would otherwise recreate it and leave it lingering again.
--
-- WHY RETIRE RATHER THAN DECLARE. Verified before writing this, in BOTH production and
-- development: 0 rows, and no foreign key anywhere references it. The codebase has zero
-- references to it — no reader, no writer. It is also redundant against two LIVE tables that
-- ARE declared and ARE used: `service_demand_signals` (the upsell engine's demand source, read
-- by `GET /api/services/demand`) and `service_requests` (migration 123, the traveler
-- request-a-service queue). Declaring a third, unused demand table would pin dead weight into
-- the canonical schema and make it look live.
--
-- If a demand-request feature is ever wanted, build it on `service_requests` (which already has
-- endpoints, an admin triage queue, and a status CHECK) rather than resurrecting this.
--
-- GUARDED: refuses to drop a table that has rows. The premise for this retirement is
-- "empty in both environments", verified at a point in time — if that stops being true before
-- this migration applies somewhere, the honest response is to keep the data and raise a notice,
-- not to destroy it because a comment said it was empty. Same refusal posture as migration 109.
DO $$
DECLARE
  n BIGINT;
BEGIN
  IF to_regclass('public.service_demand_requests') IS NULL THEN
    RAISE NOTICE 'migration 158: service_demand_requests already absent — nothing to do.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.service_demand_requests' INTO n;

  IF n > 0 THEN
    RAISE NOTICE 'migration 158: REFUSING to drop service_demand_requests — it holds % row(s). The retirement premise (empty in all environments) no longer holds; keep the data and re-decide.', n;
    RETURN;
  END IF;

  DROP TABLE public.service_demand_requests;
  RAISE NOTICE 'migration 158: service_demand_requests dropped (was empty, zero code references, no dependents).';
END $$;
