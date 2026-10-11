-- 363 — free_draft_runs (ledger `2026-10-09-fd1-free-draft-cap`; brief docs/planning/briefs/fd-1-free-draft-cap.md
-- §3/§6). SQL as held in PR #1368, APPROVED by the founder, Oct 9, 2026 ("361, 362 and 363 approved").
-- A NEW table, born EMPTY, so its UNIQUE index cannot be violated at creation (ruling 1; §20's born-object
-- carve-out — the no-index rule guards live tables). NO FK to trips: deleting a plan never refunds a draft.
-- The value sets (`rail`, `status`) are app-enforced ONCE in shared/free-draft-cap.ts — no CHECK. IF NOT
-- EXISTS throughout, so a second run is a no-op. Table and all three indexes are declared in shared/schema.ts.
--
-- One row per counted free draft. ONE writer: server/services/free-draft-cap.service.ts (claim → drafted, or
-- released on our own failure). A `released` row never counts and frees its plan (the partial UNIQUE).
CREATE TABLE IF NOT EXISTS free_draft_runs (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     varchar,
  guest_key   varchar,
  trip_id     varchar,
  rail        varchar(32),
  status      varchar(16),
  created_at  timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_free_draft_runs_user_created  ON free_draft_runs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_free_draft_runs_guest_created ON free_draft_runs (guest_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_free_draft_runs_trip ON free_draft_runs (trip_id) WHERE status <> 'released';
