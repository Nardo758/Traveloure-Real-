-- Phase 1.5 explicit seed — 8 service-category fee bands.
--
-- WHY EXPLICIT (not delegated to 046_phase1_5_enumerate_legacy_bands.sql):
--   Migration 046 enumerates bands from booking_fee_configs rows that already
--   exist at migration time. On a blank CI database booking_fee_configs is
--   empty (seeded at runtime, not at schema-push time), so 046 seeds nothing.
--   These 8 category bands therefore have no guaranteed home in the chain.
--   Without them, commission.ts throws on any booking whose category resolves
--   to one of these names — which breaks server startup on a fresh DB.
--
-- CONVENTION: percent bands store the PLATFORM TAKE as a fraction.
--   0.25 means platform keeps 25 %, expert/provider keeps 75 %.
--   All 8 bands use expert_standard rate (0.25) as a sensible default.
--   Admin can edit per-band via the platform settings UI; ON CONFLICT DO NOTHING
--   preserves any admin-edited values on existing DBs.
--
-- CATEGORIES: the 9 values used by service_categories.category and passed
--   as the `category` argument to commission.ts resolveProviderCommissionRates.
--   'dining' added alongside 'food' — both slugs appear in seeds, routes, and
--   the fee-parity gate (verify-fee-config-parity.ts). Missing 'dining' causes
--   resolveCommissionRates to throw "commission band missing" on a fresh DB.

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES
  ('activities',     'percent', 0.25, 0.15, 0.40, 'Category: activities',     'Service-category band for activities bookings. Platform take = 0.25; expert/provider keeps 0.75. Explicit seed — see 087 comment.',     true),
  ('transport',      'percent', 0.25, 0.15, 0.40, 'Category: transport',      'Service-category band for transport bookings. Platform take = 0.25; expert/provider keeps 0.75. Explicit seed — see 087 comment.',      true),
  ('accommodation',  'percent', 0.25, 0.15, 0.40, 'Category: accommodation',  'Service-category band for accommodation bookings. Platform take = 0.25; expert/provider keeps 0.75. Explicit seed — see 087 comment.',  true),
  ('food',           'percent', 0.25, 0.15, 0.40, 'Category: food',           'Service-category band for food bookings. Platform take = 0.25; expert/provider keeps 0.75. Explicit seed — see 087 comment.',           true),
  ('dining',         'percent', 0.25, 0.15, 0.40, 'Category: dining',         'Service-category band for dining bookings. Platform take = 0.25; expert/provider keeps 0.75. Explicit seed — see 087 comment.',         true),
  ('entertainment',  'percent', 0.25, 0.15, 0.40, 'Category: entertainment',  'Service-category band for entertainment bookings. Platform take = 0.25; expert/provider keeps 0.75. Explicit seed — see 087 comment.',  true),
  ('shopping',       'percent', 0.25, 0.15, 0.40, 'Category: shopping',       'Service-category band for shopping bookings. Platform take = 0.25; expert/provider keeps 0.75. Explicit seed — see 087 comment.',       true),
  ('sightseeing',    'percent', 0.25, 0.15, 0.40, 'Category: sightseeing',    'Service-category band for sightseeing bookings. Platform take = 0.25; expert/provider keeps 0.75. Explicit seed — see 087 comment.',    true),
  ('culture',        'percent', 0.25, 0.15, 0.40, 'Category: culture',        'Service-category band for culture bookings. Platform take = 0.25; expert/provider keeps 0.75. Explicit seed — see 087 comment.',        true)
ON CONFLICT (band_key) DO NOTHING;
