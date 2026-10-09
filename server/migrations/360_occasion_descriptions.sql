-- 360 — the six occasion descriptions that read "<name> planning experience".
-- Ledger `2026-10-09-e3-experiences-inline`; E3 ruling 2 (decision-maker, Oct 9, 2026). HELD FOR RULING.
--
-- WHY THIS FILE EXISTS
-- ────────────────────
-- `server/seeds/experience-template-tabs.seed.ts` created six occasions (`getOrCreateExperienceType`)
-- with the generated description `<name> planning experience`. `/api/experience-types` serves that
-- text and the occasion picker shows it under the name — a placeholder read as a description. The
-- seeder now writes one real sentence per slug (`SEEDED_OCCASION_DESCRIPTIONS`); this file repairs the
-- rows already written. The sentences here are the seeder's own, character for character
-- (pinned by `server/__tests__/occasion-descriptions.test.ts`).
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
    ('corporate', 'Offsites and team retreats, with the venue, the sessions and the group''s travel in one plan.'),
    ('family-occasion', 'A family gathering across generations — a reunion, an anniversary or a long weekend together.'),
    ('golf-trip', 'Tee times on the courses you want, and the evenings in between, for your group.'),
    ('honeymoon', 'Your first trip as newlyweds, with the stay, the dinners and time to slow down.'),
    ('milestone-birthday', 'A big birthday worth marking, with the dinner, the venue and the guests.'),
    ('romance', 'A getaway for two, with a stay, a table for dinner and time on your own.')
  ) AS v(slug, description)
 WHERE et.slug = v.slug
   AND et.description = et.name || ' planning experience';
