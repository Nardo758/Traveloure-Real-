-- Ledger 2026-10-03-smoke5-fixes (smoke 5 items 6 and 8). HELD FOR RULING until the decision-maker
-- approves this migration.
--
-- Two additive, NULLABLE jsonb columns on the draft's own row (ai_generated_itineraries).
-- No DEFAULT, no CHECK, no index, no FK, no backfill. Declared in shared/schema.ts.
--
--   where_to_stay — the plan's Where-to-stay ranking, computed ONCE per draft from that draft's
--     located stops and read back on every reload. NULL = not computed yet for this draft.
--   facts_lookup  — the draft's place-facts lookup run: { status, startedAt, finishedAt, pending[] }
--     (item ids still being checked). NULL = no lookup run was recorded for this draft.
--
-- Both live on the draft row (not in process memory) so any server instance can read them.

ALTER TABLE ai_generated_itineraries ADD COLUMN IF NOT EXISTS where_to_stay jsonb;
ALTER TABLE ai_generated_itineraries ADD COLUMN IF NOT EXISTS facts_lookup jsonb;
