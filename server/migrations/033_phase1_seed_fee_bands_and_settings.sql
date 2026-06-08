-- Master Integration Brief — Phase 1.2b: seed fee_bands + platform_settings.
--
-- CONVENTION (per SEED_DATA §1 header): percent bands store the PLATFORM TAKE
-- as a fraction. expert_standard = 0.25 means platform keeps 25 %, expert
-- keeps 75 %. Flat bands store USD dollars (49.99 = $49.99).
--
-- Preserves live values from booking_fee_configs so day-one math is unchanged:
--   - FEE-2 beta-flat 10 % → beta_flat band (preserved from provider_commission_percent.platform_fee_percent)
--   - FEE-3 deposit rate 25 % → platform_deposit band (preserved from platform_deposit_rate.platform_fee_percent)
--   - Expert default 25 platform / 75 expert → expert_standard band (preserved from default.platform_fee_percent)
-- All other bands seed at SEED_DATA §1 defaults.
--
-- Brief's optimize_tier1/2/3 placeholders are NOT seeded (per user correction).
-- Real product tiers are AI-only / AI+Expert-Review ($49.99 = optimize_expert_review,
-- a.k.a. ai_plan_polish) / Full Expert Service (no flat band — flows through 25/75 split).

-- ─── Percent bands: expert tier (preserve booking_fee_configs.default if present) ─
INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
SELECT 'expert_standard', 'percent',
  COALESCE(
    (SELECT CAST(platform_fee_percent AS NUMERIC) / 100
     FROM booking_fee_configs WHERE category = 'default' AND is_active = true LIMIT 1),
    0.25),
  0.15, 0.25,
  'Expert (standard)',
  'Established-expert split. Platform take = 0.25; expert keeps 0.75. Default for expert line items.',
  true
WHERE NOT EXISTS (SELECT 1 FROM fee_bands WHERE band_key = 'expert_standard');

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES
  ('expert_new',      'percent', 0.15, 0.15, 0.25, 'Expert (new / beta)',           'New/beta cohort: platform take 0.15, expert keeps 0.85. Admin-toggled via per-expert isBeta flag.'),
  -- Provider bands (all default_rate values = platform take)
  ('beta_flat',       'percent', 0.10, 0.05, 0.15, 'Provider beta flat',            'FEE-2: platform take 0.10, provider keeps 0.90. Active when active_provider_commission_policy = beta_flat. Default during beta.'),
  ('limited',         'percent', 0.12, NULL, NULL, 'Tiered: limited',               'Tiered provider band: 12 % platform take. Seeded dormant — used only when active_provider_commission_policy = tiered.'),
  ('moderate',        'percent', 0.08, NULL, NULL, 'Tiered: moderate',              'Tiered provider band: 8 % platform take. Seeded dormant.'),
  ('commercial',      'percent', 0.06, NULL, NULL, 'Tiered: commercial',            'Tiered provider band: 6 % platform take. Seeded dormant.'),
  ('premium',         'percent', 0.04, NULL, NULL, 'Tiered: premium',               'Tiered provider band: 4 % platform take. Partner flag, not a category. Seeded dormant.')
ON CONFLICT (band_key) DO NOTHING;

-- Preserve FEE-2's actual live value into beta_flat (in case it's been admin-edited away from 0.10).
UPDATE fee_bands
SET default_rate = COALESCE(
      (SELECT CAST(platform_fee_percent AS NUMERIC) / 100
       FROM booking_fee_configs WHERE category = 'provider_commission_percent' AND is_active = true LIMIT 1),
      default_rate)
WHERE band_key = 'beta_flat';

-- ─── Affiliate per-partner bands (platform take of affiliate margin) ──────────
INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES
  ('affiliate:viator',       'percent', 0.08, 0.04, 0.12, 'Affiliate: Viator',       'Platform takes 0.08 of affiliate margin; partner keeps 0.92. ⚠confirm per contract.'),
  ('affiliate:getyourguide', 'percent', 0.08, 0.04, 0.12, 'Affiliate: GetYourGuide', 'Platform takes 0.08 of affiliate margin. ⚠confirm per contract.'),
  ('affiliate:klook',        'percent', 0.08, 0.04, 0.12, 'Affiliate: Klook',        'Platform takes 0.08 of affiliate margin. ⚠confirm per contract.'),
  ('affiliate:fever',        'percent', 0.08, 0.04, 0.12, 'Affiliate: Fever',        'Platform takes 0.08 of affiliate margin. ⚠confirm per contract.'),
  ('affiliate:12go',         'percent', 0.08, 0.04, 0.12, 'Affiliate: 12Go',         'Platform takes 0.08 of affiliate margin. ⚠confirm per contract.'),
  ('affiliate:amadeus',      'percent', 0.06, 0.04, 0.12, 'Affiliate: Amadeus',      'Platform takes 0.06 of affiliate margin (lower band for air/hotel). ⚠confirm.'),
  ('affiliate:tiqets',       'percent', 0.08, 0.04, 0.12, 'Affiliate: Tiqets',       'Platform takes 0.08 of affiliate margin. ⚠confirm per contract.'),
  ('affiliate:headout',      'percent', 0.08, 0.04, 0.12, 'Affiliate: Headout',      'Platform takes 0.08 of affiliate margin. ⚠confirm per contract.'),
  ('affiliate:musement',     'percent', 0.08, 0.04, 0.12, 'Affiliate: Musement',     'Platform takes 0.08 of affiliate margin. ⚠confirm per contract.')
ON CONFLICT (band_key) DO NOTHING;

-- ─── Flat USD bands (default_rate stores dollars) ─────────────────────────────
-- Per user correction: optimize_tier1/2/3 placeholders dropped. Only the real
-- AI+Expert-Review tier (optimize_expert_review) needs a flat band.
INSERT INTO fee_bands (band_key, rate_type, default_rate, display_name, description, is_active)
VALUES
  ('ai_concierge_standard', 'flat', 9.99,  'AI Concierge (standard)',   'Per-task AI Concierge fee per §4.8. ⚠confirm amounts.',                                                                                true),
  ('ai_concierge_event',    'flat', 49.99, 'AI Concierge (event-type)', 'Premium event-type override per §4.8 (wedding / proposal / corporate). ⚠confirm amounts.',                                             true),
  ('optimize_expert_review','flat', 49.99, 'AI + Expert Review',        'Optimize-gate tier: AI plan polished by an expert (the ai_plan_polish offering). Same fulfillment path; do not build a second one.',   true)
ON CONFLICT (band_key) DO NOTHING;

-- ─── Deposit rate (preserve booking_fee_configs.platform_deposit_rate live value) ─
-- Semantic note: this band stores a FRACTION OF BOOKING TOTAL due at checkout
-- — not a "platform take". Description column makes the distinction explicit.
INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
SELECT 'platform_deposit', 'percent',
  COALESCE(
    (SELECT CAST(platform_fee_percent AS NUMERIC) / 100
     FROM booking_fee_configs WHERE category = 'platform_deposit_rate' AND is_active = true LIMIT 1),
    0.25),
  NULL, NULL,
  'Platform deposit rate',
  'FEE-3: portion of total booking due at checkout. SEMANTIC EXCEPTION — NOT a platform take. Replaces booking_fee_configs.platform_deposit_rate read by pricing.service.ts.',
  true
WHERE NOT EXISTS (SELECT 1 FROM fee_bands WHERE band_key = 'platform_deposit');

-- ─── platform_settings: policy flag + forward-flag fallback ───────────────────
-- active_provider_commission_policy controls the provider-side resolver branch.
-- 'beta_flat' → resolver reads fee_bands.beta_flat (current FEE-2 behavior).
-- 'tiered'    → resolver reads service_categories.commission_band_key → fee_bands.
INSERT INTO platform_settings (setting_key, setting_value, description)
VALUES
  ('active_provider_commission_policy', 'beta_flat',
   'Controls the provider resolver branch. Flip to ''tiered'' post-beta to activate the seeded-dormant limited / moderate / commercial / premium bands.'),
  ('default_commission_band_key', 'beta_flat',
   'Forward flag (not wired in 1.3). Fallback band for tiered policy when a service_categories row has no commission_band_key. Prevents tiered-flip from leaving any category unpriced.')
ON CONFLICT (setting_key) DO NOTHING;
