-- 380 — bot_proposals.fact_id gains its foreign key to place_facts (decision-maker ruling, Oct 15, 2026; ledger
-- `2026-10-15-bot-proposal-fact-fk`). Migration 378 created the column with no FK, by oversight: an approved
-- proposal names the place_facts row its approval wrote, and nothing enforced that the row exists.
--
-- ON DELETE SET NULL: a deleted fact never deletes the proposal that produced it (the review record stays).
-- One object, the constraint, named as drizzle names it so the declaration in shared/schema.ts matches and the
-- deploy push has nothing to add or drop. Idempotent: an existing constraint of that name is left alone.
-- No column, no CHECK, no DEFAULT, no index, no data change.
--
-- PRECONDITION before publish (a violating row would fail this ALTER at boot): no approved proposal names a fact
-- that does not exist —
--   SELECT bp.id, bp.fact_id FROM bot_proposals bp
--   LEFT JOIN place_facts pf ON pf.id = bp.fact_id
--   WHERE bp.fact_id IS NOT NULL AND pf.id IS NULL;
-- must return no rows. place_facts is insert-only and its one writer stamps fact_id in the same transaction, so none
-- is expected. At publish, decline the diff (§20: an FK is applied by the runner, never through the diff).
DO $$ BEGIN
  ALTER TABLE "bot_proposals" ADD CONSTRAINT "bot_proposals_fact_id_place_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "place_facts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
