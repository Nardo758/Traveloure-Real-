-- 191: dmo_extraction_runs — sweep/ingest run ledger for the admin "Content Ops" page (CLAUDE.md
-- §17 lesson applied by analogy, decision-maker ratified Aug 10 2026). Every YouTube ingestion
-- call and every warmup-sweep boot pass writes ONE append-only row here, success or not, so the
-- admin page's "last run" line can tell "ran and found nothing" from "never ran". Additive only,
-- idempotent (IF NOT EXISTS), no CHECK. Declared in shared/schema.ts in the same commit
-- (publish-trap rule).

CREATE TABLE IF NOT EXISTS dmo_extraction_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar(40) NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}',
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS dmo_extraction_runs_kind_created_idx ON dmo_extraction_runs (kind, created_at);

COMMENT ON TABLE dmo_extraction_runs IS
  'Append-only sweep/ingest run ledger (§17 lesson by analogy, Aug 10 2026). kind: '
  'youtube_ingest | warmup_sweep. counts carries each caller''s full stats object verbatim.';
