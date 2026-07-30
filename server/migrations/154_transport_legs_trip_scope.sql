-- 154: trip-scoped transport legs — L4a (CLAUDE.md §18 "Transport legs for expert-built trips",
-- ratified "BOTH" Jul 30 2026; spec docs/briefs/L4-transport-legs.md).
--
-- WHY: `transport_legs` was variant-scoped (`variant_id NOT NULL`), so only AI-optimizer trips had
-- legs. Expert-built Workstation trips had none — the §18 mode-aware CTA always fell back to
-- Navigate, the Trip Card Transport section never rendered, and "leave by" timing was impossible.
-- This gives expert trips real legs in the SAME table (one-home rule — no parallel leg table).
--
-- MODEL: the engine PROPOSES (`proposal_status='proposed'`), the expert CONFIRMS/EDITS
-- (`'confirmed'`, + `pickup_point`/`pickup_time` for chauffeured rides), and ONLY confirmed legs
-- reach traveler surfaces (the D1a born-approved lesson applied to machine transport). A leg is
-- therefore born 'proposed', NEVER born 'confirmed' — enforced in the write path (app layer).
--
-- SCOPE INVARIANT (app-level by design): a leg is EITHER variant-scoped (variant_id, the legacy
-- optimizer home) OR trip-scoped (trip_id, this lane). There is deliberately **NO cross-column
-- exactly-one-of CHECK** — a cross-column CHECK is exactly the shape that fails Replit's
-- publish-time drizzle-push (it enforces schema CHECKs without our remap steps). Enforced in
-- `server/services/trip-transport-legs.service.ts` instead.
--
-- PUBLISH-TRAP POSTURE:
--  • trip_id / pickup_point / pickup_time / proposal_status are ADDITIVE NULLABLE, no DEFAULT.
--    Every existing row keeps NULL → nothing to backfill, nothing to violate.
--  • The one CHECK added (`proposal_status`) explicitly ALLOWS NULL, so all ~existing rows
--    (variant legs, grandfathered) pass it. Per the CLAUDE.md publish-time CHECK rule the column
--    is registered in `scripts/preflight-prod-constraints.cjs` CONSTRAINT_MANIFEST.
--  • `variant_id DROP NOT NULL` is a LOOSENING (never fails on existing data) and is mirrored in
--    `shared/schema.ts` so a drizzle push does not try to re-add the constraint.

-- Variant scope becomes optional: a trip-scoped leg has no variant.
ALTER TABLE transport_legs ALTER COLUMN variant_id DROP NOT NULL;

-- Trip scope. CASCADE: a deleted trip's legs are meaningless (mirrors the variant CASCADE).
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS trip_id VARCHAR;

DO $$ BEGIN
  ALTER TABLE transport_legs
    ADD CONSTRAINT transport_legs_trip_id_fkey
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Expert-stated arrangement facts for a chauffeured leg (§13: only ever what the expert wrote).
-- pickup_time is a DISPLAY STRING in v1 — no timezone math, no derived "leave by" value.
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS pickup_point TEXT;
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS pickup_time TEXT;

-- Proposal lifecycle. NULL = legacy variant leg (grandfathered; existing behavior untouched).
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS proposal_status VARCHAR(20);

DO $$ BEGIN
  ALTER TABLE transport_legs
    ADD CONSTRAINT transport_legs_proposal_status_check
    CHECK (proposal_status IN ('proposed', 'confirmed') OR proposal_status IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The trip-scoped read path (assembler `full` level + the Workstation editor) filters
-- (trip_id, day_number). Partial (the migration-153 posture): every legacy variant leg has
-- trip_id NULL and would otherwise bloat the index for no reader.
CREATE INDEX IF NOT EXISTS idx_transport_legs_trip_day
  ON transport_legs(trip_id, day_number)
  WHERE trip_id IS NOT NULL;
