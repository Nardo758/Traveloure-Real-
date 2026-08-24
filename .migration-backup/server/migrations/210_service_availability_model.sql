-- Migration 210: S7 availability model — DECISIONS.md ledger row 102 (Wave 3 schema ballot,
-- ratified as recommended, decision-maker Aug 13, 2026). Ballot: docs/briefs/WAVE3_SCHEMA_PROPOSALS.md.
--
-- Three additive child tables — AUTHORING data, not the §15 claim surface. A new materializer
-- (server/services/availability-materializer.service.ts, code not schema) expands patterns minus
-- blackouts into ordinary vendor_availability_slots rows for a rolling 60-day window (S7-Q1
-- integrator default). storage.bookSlot/releaseSlot, the checkout spine, and the TTL sweep are
-- UNTOUCHED — this migration adds nothing they read or write directly.
--
--   service_availability_patterns — a weekly repeat rule ("every Tuesday 09:00-11:00, capacity 4").
--     Natural-key UNIQUE (service_id, day_of_week, start_time, end_time) — a weekly grid has no
--     sequence, only distinct slots, so this does NOT follow the position-ordered
--     dmo_extracted_places/service_route_points shape (ballot's own note).
--   service_date_ranges — property/property_room date-range availability with a per-night price
--     (S11's future checkout input; S7-Q4: nightly_price is provider-authored config like `price`,
--     never charged from directly — S11 must server-derive the stay charge from this row, §14).
--     Natural-key UNIQUE (service_id, start_date, end_date).
--   service_availability_blackouts — applies to EITHER shape. S7-Q3 (ratified): a blackout blocks
--     FUTURE materialization/manual creation only — it NEVER cancels an existing slot or booking
--     (auto-cancelling a paid booking is a §15 violation waiting to happen). Natural-key UNIQUE
--     (service_id, start_date, end_date).
--
-- All three: ON DELETE CASCADE off provider_services (dmo_extracted_places/service_route_points
-- FK posture), NO DB CHECK (day_of_week 0-6 is app-enforced, migration-181/195 posture), additive
-- only. All declared in shared/schema.ts in this same commit (publish-trap rule).
--
-- PLUS: the ratified idempotency UNIQUE index (service_id, date, start_time) on the EXISTING
-- vendor_availability_slots table (S7-Q2) — the materializer's ON CONFLICT DO NOTHING upsert
-- target, so re-materializing never duplicates a slot and never touches an existing row's
-- capacity/booked_count/status (manual edits and live bookings survive untouched). NOT partial (no
-- WHERE clause), even though start_time is nullable: a plain composite unique index already
-- tolerates multiple NULL start_times per (service_id, date) under standard SQL NULL semantics, so
-- no predicate is needed for correctness — and Drizzle's `onConflictDoNothing({ target: [...] })`
-- emits a bare `ON CONFLICT (cols) DO NOTHING` with no WHERE, which Postgres can only resolve
-- against a NON-partial index (a partial index requires the ON CONFLICT clause's own WHERE to
-- match verbatim, which a plain target-column upsert never supplies — confirmed by an actual
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification" failure
-- during this lane's own proof run). Declared in shared/schema.ts per the publish-trap rule (the
-- sb_idempotency_key_idx / migration-155 lesson: an index the code depends on, absent from
-- schema.ts, is silently dropped by the Replit deploy-push on the NEXT publish once this migration
-- is already stamped).
--
-- Per migration-155's own precedent (cited by the ballot's S7-Q2 resolution): a violated UNIQUE
-- fails the deploy-push destructively (offers the "copy dev over production" option — NEVER
-- accept it). Unlike 155, this migration does NOT silently degrade to a plain index on finding
-- duplicates — it FAILS LOUDLY (RAISE EXCEPTION), because a materializer upsert running against a
-- non-unique "unique-shaped" index would silently duplicate slots rather than being caught at
-- migration time. Run `node scripts/preflight-prod-unique-indexes.cjs "<PROD_DATABASE_URL>"`
-- before publishing this migration; de-duplicate any reported rows first (see docs/RELEASE.md).
--
-- Idempotent: IF NOT EXISTS / guarded throughout; safe to re-run.

CREATE TABLE IF NOT EXISTS service_availability_patterns (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,       -- 0=Sun..6=Sat, app-enforced range, NO DB CHECK
  start_time varchar(5) NOT NULL,     -- "HH:MM" wall clock, matches earliest_start_time's shape
  end_time varchar(5) NOT NULL,
  capacity integer DEFAULT 1,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT service_availability_patterns_unique UNIQUE (service_id, day_of_week, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS service_availability_patterns_service_idx
  ON service_availability_patterns (service_id);

CREATE TABLE IF NOT EXISTS service_date_ranges (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  nightly_price decimal(10, 2),       -- NULL = inherit provider_services.price; §14: S11 derives the charge server-side from THIS row, never req.body
  capacity integer DEFAULT 1,         -- units (rooms) available across this range
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT service_date_ranges_unique UNIQUE (service_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS service_date_ranges_service_idx
  ON service_date_ranges (service_id);

CREATE TABLE IF NOT EXISTS service_availability_blackouts (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason varchar(255),
  created_at timestamp DEFAULT now(),
  CONSTRAINT service_availability_blackouts_unique UNIQUE (service_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS service_availability_blackouts_service_idx
  ON service_availability_blackouts (service_id);

-- Idempotency UNIQUE on the EXISTING claim table (S7-Q2). Defensive duplicate check FIRST —
-- fail loudly and refuse to proceed rather than silently skip or drop rows (unlike migration
-- 155's degrade-to-plain-index posture; see header note above for why this one is stricter). NOT
-- partial (see header note — a bare ON CONFLICT (cols) upsert needs a non-partial arbiter index);
-- the duplicate check still excludes NULL start_time groups because Postgres never treats two
-- NULLs as a uniqueness collision regardless of the index being partial or not.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT service_id, date, start_time
    FROM vendor_availability_slots
    WHERE start_time IS NOT NULL
    GROUP BY service_id, date, start_time
    HAVING count(*) > 1
  ) dupes;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Migration 210: % duplicate (service_id, date, start_time) group(s) already exist in vendor_availability_slots — refusing to create the UNIQUE index. De-duplicate on this database first (see docs/RELEASE.md), then re-run.',
      dup_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'vendor_availability_slots_service_date_start_unique'
  ) THEN
    CREATE UNIQUE INDEX vendor_availability_slots_service_date_start_unique
      ON vendor_availability_slots (service_id, date, start_time);
  END IF;
END $$;
