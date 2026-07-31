-- 161: trip_contexts re-key — Trip-Canon Lane 6.
-- Governing docs: docs/planning/TRIP_CANON_MASTER_BRIEF.md §3 ("trip_contexts keyed by
-- userId, not tripId — re-key after L1 lands") + CLAUDE.md "Migration 130" record.
--
-- WHY: migration 130 gave every signed-in user exactly ONE planning-context row, keyed by
-- `user_id PRIMARY KEY`. Now that the Trip is the canonical container (Lane 1, migrations
-- 159-160), a user planning two trips at once has their context smeared across both —
-- picking a destination/date for trip B silently overwrites the blob trip A was reading.
-- Context should be able to follow a SPECIFIC trip.
--
-- SHAPE DECISION (ground-truthed, not the mechanical "just add trip_id" option): a
-- `user_id`-only PRIMARY KEY physically cannot coexist with more than one row per user, so
-- adding a nullable `trip_id` column alone cannot produce per-(user,trip) rows — Postgres
-- would reject the second INSERT for the same user outright. The only way to get
-- one-row-per-(user,trip) while the existing one-row-per-user "legacy" (no active trip)
-- row survives verbatim is a real PK swap: a surrogate `id` becomes the PRIMARY KEY, and
-- `user_id`/`trip_id` move to enforced-by-partial-unique-index columns instead. This is
-- the re-key the lane exists to do — executed as ONE migration, in place, so existing rows
-- keep their `user_id` + `context` and simply gain a fresh surrogate `id` with `trip_id`
-- staying NULL (i.e. they become the "legacy / no active trip" row for that user, exactly
-- their pre-migration meaning).
--
-- Publish-push posture: `trip_id` is additive nullable with an FK (idempotent DO-block, the
-- migration-159 pattern) — ON DELETE CASCADE, matching `user_id`'s existing CASCADE (a
-- context row has no life independent of the trip it's scoped to, same as it has none
-- independent of the user, migration 130). No CHECK constraint is added anywhere in this
-- migration, so there is nothing for the preflight CONSTRAINT_MANIFEST and no legacy-row
-- CHECK-failure trap. All new columns/indexes are declared in shared/schema.ts in the
-- same commit (deploy-push durability rule).

-- 1) Surrogate id: every existing row gets a fresh UUID, becomes NOT NULL with a DB-side
--    default (raw-SQL INSERT/UPSERT callers — this table is written via db.execute(sql`…`),
--    not the Drizzle query builder — need the default to exist in the database itself, the
--    migration-151 bundle_components pattern).
ALTER TABLE trip_contexts ADD COLUMN IF NOT EXISTS id VARCHAR;
UPDATE trip_contexts SET id = gen_random_uuid()::varchar WHERE id IS NULL;
ALTER TABLE trip_contexts ALTER COLUMN id SET DEFAULT gen_random_uuid()::varchar;
ALTER TABLE trip_contexts ALTER COLUMN id SET NOT NULL;

-- 2) trip_id: additive nullable FK -> trips. NULL = the legacy per-user row (back-compat,
--    the no-active-trip case); non-NULL = a context scoped to that specific trip.
ALTER TABLE trip_contexts ADD COLUMN IF NOT EXISTS trip_id VARCHAR;

DO $$ BEGIN
  ALTER TABLE trip_contexts
    ADD CONSTRAINT trip_contexts_trip_id_fkey
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- 3) The PK swap itself. user_id keeps its existing FK -> users ON DELETE CASCADE
--    (untouched, added by migration 130) but stops being the primary key; it must stay
--    NOT NULL (every row, legacy or trip-scoped, still belongs to exactly one user).
ALTER TABLE trip_contexts ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE trip_contexts DROP CONSTRAINT IF EXISTS trip_contexts_pkey;
ALTER TABLE trip_contexts DROP CONSTRAINT IF EXISTS trip_contexts_id_pkey;
ALTER TABLE trip_contexts ADD CONSTRAINT trip_contexts_id_pkey PRIMARY KEY (id);

-- 4) Uniqueness (this is what actually re-establishes "one context row" per scope, now
--    that the PK no longer does it). Two PARTIAL unique indexes, not one plain
--    UNIQUE(user_id, trip_id): Postgres treats NULL as distinct from NULL in a unique
--    index, so a bare UNIQUE(user_id, trip_id) would let a user accumulate unlimited
--    trip_id-NULL "legacy" rows instead of exactly one.
--      - at most one legacy (trip_id IS NULL) row per user — migration 130's original
--        invariant, preserved
--      - at most one row per (user_id, trip_id) once trip-scoped
CREATE UNIQUE INDEX IF NOT EXISTS trip_contexts_user_legacy_uidx
  ON trip_contexts(user_id) WHERE trip_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trip_contexts_user_trip_uidx
  ON trip_contexts(user_id, trip_id) WHERE trip_id IS NOT NULL;

-- 5) Read-path index: GET/PUT ?tripId=<id> looks a row up by (user_id, trip_id), already
--    covered by the partial unique index above (leading columns), but ownership checks and
--    any future cross-user cleanup (e.g. trip deletion fan-out) look up by trip_id alone.
CREATE INDEX IF NOT EXISTS idx_trip_contexts_trip_id ON trip_contexts(trip_id);
