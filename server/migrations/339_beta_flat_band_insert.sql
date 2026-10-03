-- Ledger 2026-10-03-beta-flat-band-insert (R276).
-- DATA ONLY. No DEFAULT, no CHECK, no index, no FK, no other schema change.
--
-- Migration 338 updates fee_bands where band_key = 'beta_flat' and is_active = false.
-- Production never had that row. Migration 051, the ledger bootstrap, stamped
-- 001–050 as applied without running their bodies, so 033's seed never ran there
-- and 338's UPDATE matched nothing.
--
-- Insert the row only when it is missing. The column list is the one 033 used
-- for this seed (not created_at/updated_at — those are 031's NOW() defaults).
-- Rates are fractions, as 033 stored them: 0.10 is 10%, not 10.
-- min_rate, max_rate and display_name are 033's seed values for beta_flat.
-- The description is the sentence 338 writes when it repairs an inactive row,
-- so a database that never had the row lands on the same text as one 338 repaired.
-- (033's own description was the FEE-2 sentence; 338 replaces that only when
-- is_active is false, which a row born here is not.)
--
-- Then 338's guarded UPDATE and policy upsert, unchanged. A second run inserts
-- nothing, does not rewrite an already-active band (an admin-set rate stays),
-- and does not overwrite a policy that is no longer 'tiered'.

INSERT INTO fee_bands (
  band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active
)
SELECT
  'beta_flat',
  'percent',
  0.10,
  0.05,
  0.15,
  'Provider beta flat',
  'Beta provider commission. Governs while active_provider_commission_policy is beta_flat. The four tier bands stay defined for a later tiered policy.',
  true
WHERE NOT EXISTS (SELECT 1 FROM fee_bands WHERE band_key = 'beta_flat');

UPDATE fee_bands
   SET is_active = true,
       default_rate = 0.10,
       description = 'Beta provider commission. Governs while active_provider_commission_policy is beta_flat. The four tier bands stay defined for a later tiered policy.',
       updated_at = now()
 WHERE band_key = 'beta_flat'
   AND is_active = false;

INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
VALUES (
  'active_provider_commission_policy',
  'beta_flat',
  'Which provider commission policy governs new bookings: beta_flat or tiered.',
  now()
)
ON CONFLICT (setting_key) DO UPDATE
  SET setting_value = 'beta_flat',
      updated_at = now()
  WHERE platform_settings.setting_value = 'tiered';
