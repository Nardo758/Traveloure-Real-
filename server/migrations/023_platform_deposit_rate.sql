-- FEE-3: seed the pricing.service.ts deposit rate into booking_fee_configs.
--
-- platform_fee_percent is reused as a generic single-rate carrier here;
-- expert_share_percent is zero since the "expert share" semantic does not
-- apply to a deposit rate. Seeded at 25 to preserve day-one behavior
-- (matches the previous hardcoded depositRate = 0.25); admin can edit via
-- /admin/fee-config without a redeploy. Resolver in pricing.service.ts
-- falls back to 0.25 if this row is missing/unseeded, so checkout cannot
-- silently drop to a 0 deposit.

INSERT INTO booking_fee_configs (category, platform_fee_percent, expert_share_percent, is_active)
VALUES ('platform_deposit_rate', 25, 0, true)
ON CONFLICT (category) DO NOTHING;
