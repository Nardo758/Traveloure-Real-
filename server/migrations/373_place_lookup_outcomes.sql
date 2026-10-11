-- 373 — place_lookup_outcomes (PF-1; ledger `2026-10-11-pf1-lookup-outcomes`; decision-maker rulings 1–4, Oct 11,
-- 2026). HELD for Leon's approval comment on the PR. The number is provisional until merge-main.
--
-- One row per (plan item, lookup run): what the Places lookup did with that item — attached, unmatched, capped,
-- skipped, no_place or error — with the reason, the run's start, which caller ran it, and the place id / cache /
-- cost / latency of the attempt. The same value set the `[place-facts]` log lines print (shared/place-lookup-outcomes.ts).
--
-- A NEW table, born EMPTY. IDS ONLY: no title and no query text (the log lines' own posture). NO FK (ruling 1:
-- the evidence outlives the plan and its items — the free_draft_runs pattern). NO CHECK and NO DEFAULT on
-- outcome/reason (app-enforced, ONE value set). Retention is a config window enforced by the daily
-- facts-recheck job (ruling 2), never a literal here. ONE writer: server/services/content-facts/lookup-outcomes.service.ts,
-- one batch per run; a failed write never fails the lookup (§15b). IF NOT EXISTS throughout, so a re-run is a
-- no-op. Table and both indexes are declared in shared/schema.ts.
CREATE TABLE IF NOT EXISTS place_lookup_outcomes (
  id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            varchar NOT NULL,
  run_started_at    timestamp NOT NULL,
  trip_id           varchar NOT NULL,
  itinerary_item_id varchar NOT NULL,
  run_trigger       varchar(32),
  day_number        integer,
  outcome           varchar(16) NOT NULL,
  reason            varchar(64),
  place_id          varchar(255),
  cache             varchar(8),
  cost_cents        integer,
  latency_ms        integer,
  created_at        timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_place_lookup_outcomes_trip_run ON place_lookup_outcomes (trip_id, run_started_at);
CREATE INDEX IF NOT EXISTS idx_place_lookup_outcomes_created ON place_lookup_outcomes (created_at);
