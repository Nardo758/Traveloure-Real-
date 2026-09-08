-- Migration 290: `conversations.trip_id` — an AI conversation can belong to a plan.
-- Ledger `2026-09-08-conversation-trip-id`; ratified by `2026-09-07-concierge-conversation-trip-id`
-- (CLAUDE.md Locked Decision 45 (1)); Console & AI Concierge brief lane L15.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS IS
-- ─────────────────────────────────────────────────────────────────────────────
-- `conversations` (declared in `shared/models/chat.ts`, which `shared/schema.ts` re-exports) is the
-- AI concierge thread. It carried no trip id, so a PRE-MINT thread had no relationship to the plan
-- it went on to mint, and the POST-MINT slip drawer (LD 45 (3)) had nothing to attach to. This adds
-- exactly that link, and nothing else: no UI, no rename, no second thread table.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ADDITIVE, NULLABLE, NO CHECK, NO DEFAULT, NO BACKFILL — deliberately
-- ─────────────────────────────────────────────────────────────────────────────
-- The publish-trap posture (migrations 181 / 195 / 273 / 275 / 276 / 277 / 279 / 280 / 281 / 282 /
-- 284 / 287 / 288): Replit's Autoscale deploy runs an automatic drizzle-kit push from
-- `shared/schema.ts` BEFORE our migrations, so a CHECK added over a column holding legacy values
-- fails the publish mid-push and offers the DESTRUCTIVE "copy dev database over production" option.
-- There is nothing to CHECK here anyway — the FK is the only shape rule this column has.
--
-- ON DELETE SET NULL, not CASCADE: deleting a plan must never delete the conversation that planned
-- it. The thread survives and honestly belongs to no plan.
--
-- NO BACKFILL. Every existing conversation gets NULL, and that is a FINISHED ANSWER (§13):
-- **NULL = this conversation belongs to no plan**, which is the ordinary pre-mint case and also the
-- honest reading of every thread that predates this column. Guessing a trip from a thread's text,
-- its owner's most recent plan, or its timestamps would turn "we never linked it" into "the
-- traveler planned this here", and every reader says the NULL case out loud rather than resolving it.
--
-- The COLUMN and its INDEX are BOTH declared in `shared/models/chat.ts` in this same commit — the
-- deploy-push durability rule: an object the schema files do not declare is dropped by the publish
-- push and never recreated, because this migration is stamped by then.
--
-- Idempotent; safe to re-run.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS trip_id varchar
    REFERENCES trips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_trip_id ON conversations (trip_id);

COMMENT ON COLUMN conversations.trip_id IS
  'The plan this AI conversation belongs to (migration 290, ledger 2026-09-08-conversation-trip-id, CLAUDE.md LD 45 (1)). Server-verified against the session user at write time; NULL = the conversation belongs to no plan (the ordinary pre-mint case), never a guess.';
