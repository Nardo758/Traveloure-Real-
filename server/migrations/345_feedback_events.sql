-- Ledger 2026-10-04-feedback-phase-a (decision-maker dispatch, Oct 4, 2026). SQL HELD for the
-- founder's ruling before merge. ADDITIVE ONLY: one new table, born empty. No DEFAULT (created_at is
-- set by the app), no CHECK (the moment/code registry is app-enforced in shared/feedback.ts), no
-- index, no FK, no seed. Declared in shared/schema.ts (deploy-push durability rule).
--
-- One row per plan per moment per user — a second tap UPDATES the row. With no UNIQUE index (none
-- ruled), the write serialises per plan under a row lock on the trip and updates-or-inserts in one
-- transaction (server/services/feedback.service.ts).
--   surface    slip | versions | card | handoff — server-derived from the moment
--   moment     post_draft | post_optimize | post_handoff | post_trip
--   code       a registry code for that moment (or `dismissed`)
--   text       free text, only with `other`; capped at 500 chars; never rendered on a public surface
--   group_key  the plan's group from the group manifest; city — the plan's destination city;
--   build_sha  the serving build. All server-filled.
CREATE TABLE IF NOT EXISTS feedback_events (
  id varchar PRIMARY KEY,
  plan_id varchar,
  user_id varchar,
  surface text,
  moment text,
  code text,
  text text,
  group_key text,
  city text,
  build_sha text,
  created_at timestamp
);
