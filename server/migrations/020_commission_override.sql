-- EXP-OVR.P1: Per-expert commission override.
-- Single nullable column on users; resolved server-side in
-- commission.ts:resolveCommissionRates BEFORE the booking_fee_configs lookup.
-- NULL = use category default. Honors §6.9 beta-recruitment terms
-- ("reduced commissions (20% vs 25%)").

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS commission_override_expert_share_percent NUMERIC(5,2);

COMMENT ON COLUMN users.commission_override_expert_share_percent IS
  'Per-expert commission override (expert keeps this %, platform takes 100-x%). NULL = use booking_fee_configs category default. Range enforced in app code at [0,100]. Resolves in commission.ts:resolveCommissionRates.';
