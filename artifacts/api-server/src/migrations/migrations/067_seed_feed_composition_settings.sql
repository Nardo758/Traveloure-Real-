-- Discover Feed Composition Brief — admin-row seed (no schema change).
--
-- GET /api/feed-composition-config (server/routes/content.routes.ts) reads
-- these platform_settings keys to drive the Discover feed-composition layer
-- (client/src/lib/feed-composition.ts): recommendation cadence, wanted-slot
-- cap/spacing, and the honest-disclosure label copy. The endpoint falls back
-- to these exact code defaults when rows are absent, so this seed changes no
-- behavior — it makes the knobs DISCOVERABLE in the admin platform-settings
-- list (which shows only existing rows) instead of editable only by admins
-- who already know the key names.
--
-- Idempotent: ON CONFLICT (setting_key) DO NOTHING — an admin-tuned value is
-- never overwritten (mirrors the 033 seed pattern).

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
