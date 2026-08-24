-- 184_ready_made_plan_type_custom.sql — "Custom…" plan type theme label (decision-maker approved
-- Aug 9 2026; shared/ready-made-plan-types.ts's `custom` vocabulary entry).
--
-- WHAT: additive nullable `ready_made_trips.plan_type_custom` VARCHAR(80). Free text is NEVER
-- written to the closed-vocabulary `plan_type` column itself — this is a SEPARATE column that
-- only carries a value when `plan_type = 'custom'`. Server validation (server/routes/ready-made
-- .routes.ts) requires a trimmed 3..80 char value to accompany `planType: 'custom'` (400
-- otherwise), and clears/nulls this column whenever a non-custom key is saved.
--
-- No CHECK constraint (migration-159/173/181 house posture — an app-enforced cross-column rule
-- avoids the publish-time drizzle-push CHECK-over-legacy-rows trap; every existing row is NULL
-- here so there is nothing to remediate, but the posture is kept consistent with its siblings).
--
-- Declared on the `readyMadeTrips` pgTable in shared/schema.ts in the SAME commit (the
-- deploy-push durability rule — an undeclared column the code depends on is silently reverted by
-- the next Replit publish-time drizzle-kit push).
--
-- Idempotent-ALTER pattern per the migration-159/161/173/181 house style.

ALTER TABLE ready_made_trips ADD COLUMN IF NOT EXISTS plan_type_custom VARCHAR(80);
