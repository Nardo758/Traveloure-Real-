-- Phase 1.5 — Neutrality gap fix: seed tip_handling band.
--
-- The Phase 1.3 neutrality script caught a real divergence:
--   booking_fee_configs.tip → 5 % platform / 95 % expert (admin-set legacy)
--   new fee_bands resolver  → 25 % platform / 75 % expert (expert_standard fallback)
--
-- Root cause: storage.ts:2722 calls resolveCommissionRates({ category: 'tip' }).
-- The new resolver only knows about fee_bands keys; 'tip' wasn't seeded, so the
-- decideBandKey helper falls through to expert_standard. A 20-point overcharge
-- on every tip — caught by the proof script before merge. Working as designed.
--
-- Fix: add a tip_handling band, preserving the live 5 % from booking_fee_configs.tip.
-- commission.ts.decideBandKey will map category='tip' → 'tip_handling' in the
-- companion code change.

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
SELECT 'tip_handling', 'percent',
  COALESCE(
    (SELECT CAST(platform_fee_percent AS NUMERIC) / 100
     FROM booking_fee_configs WHERE category = 'tip' AND is_active = true LIMIT 1),
    0.05),  -- legacy fallback if booking_fee_configs.tip is missing
  NULL, NULL,
  'Expert tip handling',
  'Platform take on traveler-to-expert tips. Legacy default 0.05 (5 % platform, 95 % expert). Preserved from booking_fee_configs.tip via Phase 1.5 migration.',
  true
WHERE NOT EXISTS (SELECT 1 FROM fee_bands WHERE band_key = 'tip_handling');
