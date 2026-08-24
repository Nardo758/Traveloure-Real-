-- Seed the 'dining' fee_band row that resolveCommissionRates expects.
--
-- WHY A SEPARATE MIGRATION (not just editing 087):
--   Migration 087 seeds 8 category bands but omitted 'dining'. On existing
--   deployments where 087 is already marked applied in schema_migrations,
--   re-running 087 would be a no-op. This migration closes the gap for all
--   environments — fresh CI (where 087 now includes it too, so this is
--   redundant but harmless via ON CONFLICT DO NOTHING) and live deployments
--   where only 088 will run.
--
-- CONTEXT: The verify-fee-config-parity.ts CI gate checks category='dining'.
--   commission.ts decideBandKey() returns the category name directly when it
--   is not a known semantic mapping, so the resolver looks for band_key='dining'
--   in fee_bands. Without this row resolveCommissionRates throws:
--     "commission band missing: bandKey=dining, source=null, category=dining"
--   which exits the gate non-zero.
--
-- CONVENTION: percent bands store PLATFORM TAKE as a fraction.
--   0.25 = platform keeps 25%, expert/provider keeps 75%.

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES
  ('dining', 'percent', 0.25, 0.15, 0.40, 'Category: dining',
   'Service-category band for dining bookings. Platform take = 0.25; expert/provider keeps 0.75.',
   true)
ON CONFLICT (band_key) DO NOTHING;
