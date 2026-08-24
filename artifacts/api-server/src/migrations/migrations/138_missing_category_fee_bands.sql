-- 138: R1 (revenue-model review F5) — seed the four fee-category bands that
-- serviceCategorySlugToFeeCategory() can emit but no migration ever seeded:
-- transportation, flights, car_rental, insurance. resolveCommissionRates deliberately
-- THROWS on a missing band (no silent fallback), so a cart containing a service in any of
-- these categories 500'd the whole checkout. Seeded at the same 0.25 default / 0.15–0.40
-- bounds as the 087 category siblings; admin-editable; ON CONFLICT DO NOTHING never
-- overwrites admin-tuned values. Seed-only, no CHECK — no publish-push trap.

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, description, is_active)
VALUES
  ('transportation', 'percent', 0.25, 0.15, 0.40, 'Category band: transportation (fee-category slug; F5 gap-closer).', true),
  ('flights',        'percent', 0.25, 0.15, 0.40, 'Category band: flights (fee-category slug; F5 gap-closer).', true),
  ('car_rental',     'percent', 0.25, 0.15, 0.40, 'Category band: car_rental (fee-category slug; F5 gap-closer).', true),
  ('insurance',      'percent', 0.25, 0.15, 0.40, 'Category band: insurance (fee-category slug; F5 gap-closer).', true)
ON CONFLICT (band_key) DO NOTHING;
