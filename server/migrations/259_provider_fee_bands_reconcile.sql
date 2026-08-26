-- Migration 259: provider fee-band reconciliation
--
-- Migration 033 was recorded as applied in production but its four provider
-- tier bands are absent. Migration 178 then correctly assumed they existed
-- when it made category commission-band resolution fail loud. Reconcile the
-- missing seed rows here without changing an administrator's existing value
-- or activation decision.
--
-- The values and row shape are ratified in migration 033:
-- limited 0.12, moderate 0.08, commercial 0.06, premium 0.04.

INSERT INTO fee_bands (
  band_key,
  rate_type,
  default_rate,
  min_rate,
  max_rate,
  display_name,
  description,
  is_active
)
VALUES
  (
    'limited',
    'percent',
    0.1200,
    NULL,
    NULL,
    'Tiered: limited',
    'Tiered provider band: 12 % platform take. Reconciled from the migration 033 ratified seed.',
    true
  ),
  (
    'moderate',
    'percent',
    0.0800,
    NULL,
    NULL,
    'Tiered: moderate',
    'Tiered provider band: 8 % platform take. Reconciled from the migration 033 ratified seed.',
    true
  ),
  (
    'commercial',
    'percent',
    0.0600,
    NULL,
    NULL,
    'Tiered: commercial',
    'Tiered provider band: 6 % platform take. Reconciled from the migration 033 ratified seed.',
    true
  ),
  (
    'premium',
    'percent',
    0.0400,
    NULL,
    NULL,
    'Tiered: premium',
    'Tiered provider band: 4 % platform take. Reconciled from the migration 033 ratified seed.',
    true
  )
ON CONFLICT (band_key) DO NOTHING;