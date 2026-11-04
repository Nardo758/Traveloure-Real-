-- 432_waitlist_markets_and_partner_editorial.sql
-- GATE-1 + PARTNER-1 (ledger 2026-11-03-gate1-partner1). HELD until Leon approves the SQL on the PR.
-- The statements below are the brief's §8 text, verbatim. Every ALTER is ADD COLUMN IF NOT EXISTS (nullable, no
-- DEFAULT, no CHECK, no index); the INSERT is ON CONFLICT DO NOTHING; the UPDATE matches only the old text.
-- The eight new columns are declared in shared/schema.ts (deploy-push durability rule).

-- WAIT-1 settings (Kyoto stays Beta via beta_market_slugs; marquee = launch_market_slug; marquee ≠ Live)
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
  ('live_market_slugs', '[]',
   'Markets shown as "Live" (full planner, bookings). JSON array of operating-market keys. Empty at launch. Marquee = launch_market_slug.'),
  ('market_launch_dates', '{}',
   'Optional opening month per market, JSON {"<market-key>":"YYYY-MM"}; shown as "Opening <Month YYYY>" only when set.')
ON CONFLICT (setting_key) DO NOTHING;
-- PARTNER-1 editorial text: our own reviewed description; raw supplier text is never rendered
ALTER TABLE fever_event_cache    ADD COLUMN IF NOT EXISTS editorial_description text, ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamp;
ALTER TABLE activity_cache       ADD COLUMN IF NOT EXISTS editorial_description text, ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamp;
ALTER TABLE hotel_cache          ADD COLUMN IF NOT EXISTS editorial_description text, ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamp;
ALTER TABLE affiliate_products   ADD COLUMN IF NOT EXISTS editorial_description text, ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamp;
-- Copy row 3 (DB value)
UPDATE experience_types SET description = 'Plan the proposal: the place, the moment, the dinner after.'
  WHERE description = 'Plan the perfect proposal with the right setting and ambiance';
