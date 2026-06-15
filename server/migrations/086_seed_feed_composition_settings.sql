-- Migration 086: Discover Feed Composition settings seed.
--
-- Source-branch file: 074_seed_feed_composition_settings.sql
--
-- Seeds the five platform_settings keys that drive the Discover feed
-- composition layer. This is the canonical source-branch seed; migrations
-- 067 and 075 contain identical SQL for the same keys. All three are fully
-- idempotent via ON CONFLICT (setting_key) DO NOTHING, so re-running
-- whichever of the three executes first is safe — subsequent runs are no-ops.
--
-- GET /api/feed-composition-config reads these keys to control recommendation
-- cadence, wanted-slot gating, and disclosure label copy.

INSERT INTO platform_settings (setting_key, setting_value, description)
VALUES
  ('feed_rec_cadence', '4',
   'Discover feed: organic items per engine recommendation (~1 per 3-4). Composition layer places at this cadence; it never re-ranks the engine order.'),
  ('feed_wanted_slot_max', '2',
   'Discover feed: max wanted/recruitment slots interleaved per feed. 0 disables recruitment slots.'),
  ('feed_wanted_slot_spacing', '6',
   'Discover feed: minimum organic items between wanted/recruitment slots (~one per screen).'),
  ('feed_rec_label', 'Recommended',
   'Discover feed: disclosure label shown on engine recommendation cards.'),
  ('feed_rec_affiliate_label', 'Paid partner',
   'Discover feed: distinct disclosure label shown on paid affiliate recommendation cards.')
ON CONFLICT (setting_key) DO NOTHING;
