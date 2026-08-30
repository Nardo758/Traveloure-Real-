-- 266_upsell_endorsements_schema_drift.sql
--
-- Fixes a schema.ts-vs-migration-chain drift on upsell_expert_endorsements
-- (inverse of the usual "publish-time CHECK failure" trap documented in
-- CLAUDE.md: there the deploy push is authoritative and DROPS an object the
-- migration chain depends on; here the deploy push is authoritative and
-- ADDS columns/constraints the migration chain never created).
--
-- History: 052_phase5_expert_endorsements.sql shipped an EARLIER design of
-- this table (service_id / offering_type_key / city_key / endorsed_at /
-- active) and was folded into 000_baseline_schema.sql verbatim. The table
-- was later redesigned in shared/schema.ts to the scope/trip_id/
-- neighborhood_id/offering_id/category_key shape used by
-- server/services/upsell-query.service.ts and server/routes/upsell.routes.ts
-- (POST/DELETE /api/upsell/expert-review/endorse) today — but no migration
-- ever carried that redesign into server/migrations/. 052 was excluded from
-- migration-files.ts with a comment claiming baseline (000) "creates the
-- table from the real schema"; that claim is stale/incorrect — baseline
-- carries the OLD shape, not the current Drizzle shape. Because Replit's
-- Autoscale deploy runs an automatic drizzle-kit schema-push from
-- shared/schema.ts (see CLAUDE.md "Replit deploy-push vs. our migrations"),
-- production likely already has these columns; a database built purely by
-- runMigrations() (CI, fresh dev, any migration-canonical environment) does
-- not, so every upsell-endorsement query fails with
-- `column "..." does not exist` and is silently swallowed by the
-- try/catch-and-warn wrapper in loadEndorsementsForContext /
-- getExpertEndorsements (degraded data, 200 response, log spam).
--
-- This migration is purely ADDITIVE and idempotent (IF NOT EXISTS / guarded
-- DO blocks), matching shared/schema.ts's exact types/nullability for the
-- five missing columns and the one missing FK:
--   scope             varchar(20)  NOT NULL   -- 'trip' | 'neighborhood'
--   trip_id           varchar(255)
--   neighborhood_id   varchar
--   offering_id       varchar(255) NOT NULL
--   category_key      varchar(100)
--   expert_id -> users(id) ON DELETE CASCADE  (schema.ts declares
--     .references(() => users.id, { onDelete: "cascade" }) on expertId;
--     no migration ever created the FK)
--
-- NOT NULL with no DEFAULT is safe here: the write path that would populate
-- these columns (upsertTripEndorsement / upsertNeighborhoodEndorsement)
-- issues `INSERT ... ON CONFLICT (expert_id, trip_id, offering_id) WHERE
-- scope = 'trip'` (and the neighborhood equivalent), and NEITHER
-- shared/schema.ts NOR any migration declares those two partial unique
-- indexes anywhere — so that insert has never been able to succeed in ANY
-- environment (it errors "no unique or exclusion constraint matching the
-- ON CONFLICT specification"). The table is therefore provably empty of
-- rows carrying these columns in every environment, so adding them as
-- NOT NULL cannot violate existing data. That missing-unique-index gap is a
-- SEPARATE, more severe defect than the one this migration closes — it
-- also affects production, unlike the read-path drift above — and requires
-- a shared/schema.ts change (new indexes the deploy-push must own per the
-- "index the code depends on must be DECLARED in shared/schema.ts" rule),
-- which needs decision-maker sign-off per the Coordination Prevention
-- rule. Left unfixed here; do not conflate the two.
--
-- The OLD-shape columns (service_id, offering_type_key, city_key,
-- endorsed_at, active) and their three indexes are left in place: they are
-- unused by any current Drizzle/route/service code (verified by repo-wide
-- grep) and dropping columns is a separate, riskier change out of scope for
-- an additive drift fix.

ALTER TABLE upsell_expert_endorsements
  ADD COLUMN IF NOT EXISTS scope varchar(20),
  ADD COLUMN IF NOT EXISTS trip_id varchar(255),
  ADD COLUMN IF NOT EXISTS neighborhood_id varchar,
  ADD COLUMN IF NOT EXISTS offering_id varchar(255),
  ADD COLUMN IF NOT EXISTS category_key varchar(100);

-- Applied as separate statements (not inline on the ADD COLUMN above) so a
-- re-run against a database that already has these columns nullable, with
-- rows, does not attempt to retroactively enforce NOT NULL — it only fires
-- the first time each column is actually created.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'upsell_expert_endorsements' AND column_name = 'scope' AND is_nullable = 'NO'
  ) AND NOT EXISTS (SELECT 1 FROM upsell_expert_endorsements WHERE scope IS NULL) THEN
    ALTER TABLE upsell_expert_endorsements ALTER COLUMN scope SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'upsell_expert_endorsements' AND column_name = 'offering_id' AND is_nullable = 'NO'
  ) AND NOT EXISTS (SELECT 1 FROM upsell_expert_endorsements WHERE offering_id IS NULL) THEN
    ALTER TABLE upsell_expert_endorsements ALTER COLUMN offering_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'upsell_expert_endorsements_expert_id_users_id_fk'
      AND conrelid = 'upsell_expert_endorsements'::regclass
  ) THEN
    ALTER TABLE upsell_expert_endorsements
      ADD CONSTRAINT upsell_expert_endorsements_expert_id_users_id_fk
      FOREIGN KEY (expert_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
