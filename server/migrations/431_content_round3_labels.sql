-- Migration 431 — content round 3: two traveler-visible labels the database still carries
-- (P-8; ledger 2026-11-03-p8-content-round-3). DML ONLY: no CREATE, ALTER or DROP, no CHECK,
-- no index, no DEFAULT change, so the publish-time schema push has nothing to add.
--
-- Closes the two P-6 rules (Leon, Nov 2 §7) these rows still broke on production:
--   · "Recommended" needs a stated reason — the Discover feed's disclosure label
--     (platform_settings.feed_rec_label, seeded 'Recommended' by 067/086) is served over the
--     client's own P-6 default, so Discover still read "Recommended". It becomes
--     'Picked for your days', the label P-6 approved.
--   · no ranking/top/superlative claims — the experience-template filter chips seeded by
--     server/seeds/experience-template-tabs.seed.ts: the anniversary "Crowd Level" option
--     "Popular but Spacious" becomes "Spacious", and the universal "Sort By" option
--     "Most Popular" (value 'popular') is removed. Options are rows; nothing references an
--     option id, and the seed skips a filter that already exists, so a removed row is not
--     re-created. The catalog's sort already treats an absent sort as its default order.
--
-- Idempotent: every statement matches only the OLD text, so a second run changes nothing,
-- and a value an admin has since changed is never overwritten.

UPDATE platform_settings
   SET setting_value = 'Picked for your days'
 WHERE setting_key = 'feed_rec_label'
   AND setting_value = 'Recommended';

UPDATE experience_template_filter_options
   SET label = 'Spacious'
 WHERE label = 'Popular but Spacious'
   AND value = 'popular';

DELETE FROM experience_universal_filter_options o
 USING experience_universal_filters f
 WHERE o.filter_id = f.id
   AND f.slug = 'sort_by'
   AND o.label = 'Most Popular'
   AND o.value = 'popular';
