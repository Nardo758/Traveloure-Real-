-- Ledger 2026-10-02-beta-rollout-fees (R273).
-- DATA plus one additive nullable column. No CHECK, no DEFAULT, no index, no backfill.
--
-- Ruling 49 (migration 178) deactivated beta_flat and pointed the provider policy at
-- tiered. The beta period amends that: while active_provider_commission_policy is
-- beta_flat, provider commission is the beta_flat row. The four tier bands stay
-- active so an admin can flip the policy to tiered without a deploy.
--
-- Predicate-guarded. A second run does not clobber a rate an admin already set on
-- an active beta_flat row, and does not overwrite a policy that is no longer the
-- tiered value migration 178 wrote. No service_bookings, service_quotes amounts,
-- or earnings rows are rewritten.

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

-- Owner share pinned when a quote is issued. NULL means the quote was issued
-- before this column and accept resolves the live band. Never backfilled.
ALTER TABLE service_quotes
  ADD COLUMN IF NOT EXISTS owner_share_rate numeric(7, 6);
