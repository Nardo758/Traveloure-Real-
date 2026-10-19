-- 394_place_facts_feasibility_retag.sql — data only (EV-P0 PR 3; ledger `2026-10-18-fact-tags-exhaustive`).
--
-- Migration 362 tagged every `expert_nugget` row local + reusable. FD-3 rulings 1/3 (ledger
-- `2026-10-10-fd3-feasibility`) make an OFFICIAL last-entry or last-train fact public + link_only whoever wrote
-- it, and `placeFactTags` (shared/content-tiers.ts) tags new rows that way — so a pre-FD-3 expert row citing an
-- official page was left local, and the feasibility readers (public rows only) never read it.
--
-- Re-tags exactly those rows to what `placeFactTags` answers today. No ALTER, CHECK, index or DEFAULT change.
-- Idempotent: the WHERE matches only rows still tagged local, so a second run touches 0 rows.
UPDATE place_facts
   SET source_class = 'public', reuse_class = 'link_only'
 WHERE origin = 'expert_nugget'
   AND license = 'official'
   AND fact_type IN ('last_admission', 'last_service')
   AND source_class = 'local';
