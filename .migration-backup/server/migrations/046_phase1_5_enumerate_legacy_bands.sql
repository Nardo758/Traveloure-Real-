-- Phase 1.5 — Complete-by-construction band coverage for booking_fee_configs.
--
-- The `tip` divergence the neutrality script caught was reactive: we patched
-- the one category we knew about. This migration enumerates EVERY active row
-- in booking_fee_configs and seeds a preserving band for any category that
-- doesn't already have a known semantic mapping in fee_bands.
--
-- Net effect: any admin-set per-category rate flows through unchanged — no
-- "did we think to test this one" risk. The neutrality script's job becomes
-- confirmation, not discovery.
--
-- Skipped (already semantically mapped by Phases 1.2–1.5):
--   default                       → expert_standard
--   provider_commission_percent   → beta_flat
--   platform_deposit_rate         → platform_deposit  (pricing.service.ts reads directly)
--   tip                           → tip_handling (Phase 1.5)
-- All other active booking_fee_configs rows get band_key = their category name,
-- preserving platform_fee_percent as default_rate (fraction). The companion
-- commission.ts.decideBandKey update routes unknown categories to a direct
-- lookup, so the resolver auto-picks up these preserved values.

INSERT INTO fee_bands (band_key, rate_type, default_rate, display_name, description, is_active)
SELECT
  bfc.category AS band_key,
  'percent'    AS rate_type,
  CAST(bfc.platform_fee_percent AS NUMERIC) / 100 AS default_rate,
  CONCAT('Legacy bridge: ', bfc.category) AS display_name,
  CONCAT(
    'Preserves booking_fee_configs.', bfc.category,
    ' platform_fee_percent at migration time (Phase 1.5 enumeration). ',
    'Resolver picks this up via decideBandKey''s direct-category fallback. ',
    'Phase 8 will migrate the admin UI to write to fee_bands directly; ',
    'until then this band and the legacy booking_fee_configs row drift independently.'
  ) AS description,
  bfc.is_active
FROM booking_fee_configs bfc
WHERE bfc.is_active = true
  AND bfc.platform_fee_percent IS NOT NULL
  -- Skip categories already mapped by Phases 1.2–1.5 semantic bridges:
  AND bfc.category NOT IN (
    'default',
    'provider_commission_percent',
    'platform_deposit_rate',
    'tip'
  )
ON CONFLICT (band_key) DO NOTHING;  -- idempotent on re-run
