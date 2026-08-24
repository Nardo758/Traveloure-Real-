-- Migration 134 — Ready-Made plan type (the "Type of Plan" line of the store's quality structure).
--
-- Decision-maker model (2026-07-25): every Ready Made Trips store item ships in a standard
-- structure — branded page header, declared plan type (Hiking Itinerary, Road Trip Itinerary,
-- Birthday Plan, ...), then the structured content. This adds the plan-type column.
--
-- ADDITIVE NULLABLE, no CHECK, no DEFAULT → no publish-time drizzle-push trap (the migration-124/129
-- posture). NULL = "not chosen yet" (a draft-only state — the submit gate refuses a NULL plan type,
-- so nothing reaches the store shelf without one). Vocabulary is validated in code against the
-- shared/ready-made-plan-types.ts list, not a DB CHECK, so extending the editorial vocabulary never
-- needs a schema migration.

ALTER TABLE ready_made_trips ADD COLUMN IF NOT EXISTS plan_type VARCHAR(60);
