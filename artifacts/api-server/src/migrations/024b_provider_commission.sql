-- FEE-2 (beta): flat 10% provider commission via config.
-- Providers get 90% of service price; platform keeps 10%.
-- Seeded at 90% expert_share to preserve semantic (same split math as expert rates).
INSERT INTO booking_fee_configs (category, platform_fee_percent, expert_share_percent, is_active)
VALUES ('provider_commission_percent', 10, 90, true)
ON CONFLICT (category) DO NOTHING;
