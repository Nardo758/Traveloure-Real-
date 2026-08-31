-- 269_trip_finals.sql — the versioned, immutable plan snapshot ("Make final").
-- Trip Card rebuild Phase 1 (ledger 2026-08-31-two-surfaces-one-handoff). One row per FINAL cut of
-- a trip's plan: `version` increases per trip, `snapshot` freezes the plan as it stood at Finalize,
-- `content_hash` is the plan fingerprint that drives the idempotent re-final rule (unchanged plan =>
-- no new version). Additive; no CHECK constraints (publish-trap posture). Declared in
-- shared/schema.ts including the UNIQUE (trip_id, version) index (deploy-push durability rule: an
-- index only in migration SQL is dropped by the publish push and never recreated). `finalize_trip`
-- service is the sole writer; snapshot rows are append-only history (never mutated after insert).
-- Idempotent: IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS trip_finals (
  id varchar PRIMARY KEY,
  trip_id varchar NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  content_hash varchar(64) NOT NULL,
  finalized_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now()
);

-- Monotonic version per trip; also the concurrency guard for version numbering under a race (§15):
-- two finalizes computing the same version collide here, so exactly one wins.
CREATE UNIQUE INDEX IF NOT EXISTS trip_finals_trip_version_uniq
  ON trip_finals (trip_id, version);

-- Latest-final lookup by trip.
CREATE INDEX IF NOT EXISTS trip_finals_trip_idx
  ON trip_finals (trip_id);
