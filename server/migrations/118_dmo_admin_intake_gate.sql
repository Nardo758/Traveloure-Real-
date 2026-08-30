-- Migration 118 — DMO admin-intake gate ("B", ratified Jul 19, 2026).
--
-- Scraped/DMO content must be approved by an admin INTO the expert library before an expert
-- can see it. The gate is the existing `expert_workspace_visible` boolean: born FALSE (admin
-- pre-filters raw content), flipped TRUE on admin approval.
--
-- This aligns the DB column DEFAULT with the ORM schema (shared/schema.ts now `.default(false)`),
-- so an insert that omits the column is born hidden too — closing the "born-visible if a create
-- site forgets to set it" trap. The DMO create sites (seed, Tavily gap-fill, DMOCrawler) also set
-- it FALSE explicitly.
--
-- Future-inserts-only. NO backfill: existing rows are grandfathered at their current visibility
-- (the F2 pattern) — pre-gate seed/heritage content stays expert-visible and does not get dragged
-- into the intake queue. Default change only (no CHECK) → no publish-time push trap.

ALTER TABLE "dmo_raw_content" ALTER COLUMN "expert_workspace_visible" SET DEFAULT false;
