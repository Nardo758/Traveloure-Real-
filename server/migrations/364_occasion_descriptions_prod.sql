-- 364 — the three occasion descriptions production still shows as "<name> planning experience".
-- Ledger `2026-10-10-m364-occasion-descriptions`; decision-maker dispatch, Oct 10, 2026. HELD for the founder.
--
-- WHY THIS FILE EXISTS
-- ────────────────────
-- Migration 360 repaired six slugs read from a DEV database. A production read shows seven placeholder
-- rows, and 360 covers four of them (family-occasion, golf-trip, honeymoon, milestone-birthday); its
-- `corporate` and `romance` rows do not exist on production. This file covers the other three:
-- `anniversary`, `bachelor-bachelorette` and `sports-event` — each spelled exactly as production holds it.
-- The seeder creates the anniversary occasion as `anniversary-trip`, which is NOT a production row, so this
-- file carries no UPDATE for it; the seeder's own sentence covers a fresh database, and the test reads
-- production's `anniversary` as the seeder's `anniversary-trip`.
--
-- The sentences are the seeder's own (`SEEDED_OCCASION_DESCRIPTIONS`), character for character, pinned by
-- `server/__tests__/occasion-descriptions.test.ts`.
--
-- WHAT THIS FILE IS NOT
-- ─────────────────────
--  • NOT DDL. No ALTER, no CHECK, no index, no DEFAULT. Nothing for the deploy push to offer or fail on,
--    and nothing to declare in `shared/schema.ts`.
--  • NOT a general rewrite. Each row is matched by SLUG and only while its description is still the
--    generated placeholder for its own name — a description an admin has since written is never
--    replaced.
--
-- Idempotent: a second run matches no row.

UPDATE experience_types AS et
   SET description = v.description
  FROM (VALUES
    ('anniversary', 'Another year together, marked with a stay, a dinner to remember and time for the two of you.'),
    ('bachelor-bachelorette', 'A weekend with your friends before the wedding, with the nights out, the activities and the group''s stays.'),
    ('sports-event', 'The game, the match or the race, with the stay, the getting there and the evenings around it.')
  ) AS v(slug, description)
 WHERE et.slug = v.slug
   AND et.description = et.name || ' planning experience';
