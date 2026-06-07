-- Migration 031: Transport Commerce Fee Config
-- Seeds booking_fee_configs with transport-specific commission and affiliate
-- margin rates. All rates are admin-editable via the Fee Config admin UI after
-- this migration runs.
--
-- platform_transport_commission: Traveloure keeps 10% on platform-booked legs
--   (provider earns 90%). Within the spec range of 4-12%.
-- affiliate_margin_*: Platform's expected revenue share from each affiliate
--   program. These are reference rates only — actual payouts depend on partner
--   agreements. Stored so the admin can adjust without a code deploy.
--
-- ON CONFLICT DO NOTHING makes this migration idempotent and safe to re-run.

INSERT INTO booking_fee_configs (category, platform_fee_percent, expert_share_percent, is_active)
VALUES
  ('platform_transport_commission', 10.00, 90.00, true),
  ('affiliate_margin_12go',         12.00,  0.00, true),
  ('affiliate_margin_omio',          8.00,  0.00, true),
  ('affiliate_margin_discovercars', 10.00,  0.00, true),
  ('affiliate_margin_kiwi',          6.00,  0.00, true)
ON CONFLICT (category) DO NOTHING;
