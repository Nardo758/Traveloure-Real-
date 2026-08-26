-- 258: clear leftover centroid-placeholder text from city_neighborhoods.description
-- (2026-08-27-neighbourhood-slug-match residual, closed here). Migration 042 seeded
-- ~30+ neighbourhood rows across 8 cities (Kyoto, Edinburgh, Bogotá, Cartagena, Porto,
-- Mumbai, Goa, Jaipur) with a literal placeholder string instead of editorial copy.
-- Since 042 is already applied to production, its SQL body cannot be edited in place
-- (see AUTHORING.md); this migration corrects the data it left behind instead.
--
-- Sanctioned one-off write-target exception: the fix here is a data UPDATE, not a
-- schema change, and it targets city_neighborhoods.description specifically because
-- that is the only place the placeholder string was seeded. NULL is authored deliberately
-- (not a rewritten description) — the client's chrome-heading fallback chain already
-- treats a NULL description as "no editorial copy" and falls back to the neighbourhood's
-- plain name (§6, BENTO_ASSEMBLY.md), which is honest; inventing placeholder-free prose
-- here would be fabricated copy, not a bug fix.
--
-- Idempotent: the WHERE clause only ever matches rows still carrying the placeholder
-- text, so re-running this migration after it succeeds once is a no-op UPDATE (0 rows).
UPDATE city_neighborhoods
SET description = NULL
WHERE description ILIKE '%confirm centroid%' OR description ILIKE '%placeholder%';
