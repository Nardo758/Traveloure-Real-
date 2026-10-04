-- Work plan L1-13 (docs/planning/expert-console-ready-made-work-plan.md; ruling R-bj). SQL HELD for the
-- founder's ruling before merge. ADDITIVE ONLY: one new table, born empty, with only its PK. No
-- DEFAULT, no CHECK, no index, no FK, no seed. Declared in shared/schema.ts (deploy-push durability
-- rule). IF NOT EXISTS so a second run is a no-op.
--
-- An "Ask a local about this" question lives as a `funnel_events` row (`expert_interest`, with
-- `properties.itemId`) and has no status of its own; this is where an expert's answer is recorded.
--   question_event_id  the funnel_events.id of the question
--   trip_id / item_id  the plan and item it was asked about (copied from the question by the server)
--   expert_id          the answering expert (the session user)
--   answer             plain text, <=2000 chars (app-enforced)
--   status             'answered' (app-enforced; the only value written today)
--   created_at         set by the app
-- One answer per question is enforced by the writer under a transaction-scoped advisory lock (no
-- UNIQUE index was ruled), see server/services/expert-inbox-questions.service.ts.
CREATE TABLE IF NOT EXISTS expert_question_answers (id varchar PRIMARY KEY);
ALTER TABLE expert_question_answers ADD COLUMN IF NOT EXISTS question_event_id varchar;
ALTER TABLE expert_question_answers ADD COLUMN IF NOT EXISTS trip_id varchar;
ALTER TABLE expert_question_answers ADD COLUMN IF NOT EXISTS item_id varchar;
ALTER TABLE expert_question_answers ADD COLUMN IF NOT EXISTS expert_id varchar;
ALTER TABLE expert_question_answers ADD COLUMN IF NOT EXISTS answer text;
ALTER TABLE expert_question_answers ADD COLUMN IF NOT EXISTS status varchar(20);
ALTER TABLE expert_question_answers ADD COLUMN IF NOT EXISTS created_at timestamp;
