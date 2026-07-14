-- Migration 114 — Kyoto Knowledge-Bar scored expertise gate (Phase 1).
--
-- Adds two nullable columns to local_expert_forms to hold the AI-scored rubric result over the
-- knowledge-proof answers:
--   knowledge_score     jsonb  — { overall, verdict, perAnswer:[{dimensions, score, feedback}],
--                                  market, model, scoredAt }  (NULL = not yet scored / unscored)
--   knowledge_scored_at timestamp — when scoring last ran (NULL = never)
--
-- ADVISORY in v1: the score is decision support surfaced to the admin queue; it does NOT auto-gate
-- approval (approval still flows through updateLocalExpertFormStatus). Nullable + no default, so
-- existing rows are simply "unscored" and pre-existing applications are unaffected. Idempotent.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='local_expert_forms') THEN
    ALTER TABLE local_expert_forms ADD COLUMN IF NOT EXISTS knowledge_score jsonb;
    ALTER TABLE local_expert_forms ADD COLUMN IF NOT EXISTS knowledge_scored_at timestamp;
  END IF;
END $$;
