-- 367 — transport fees become fee bands (ledger `2026-10-10-tc0-transport-commission-band`; LD 8).
-- DATA ONLY: no DDL, no CHECK, no index, nothing to declare.
-- APPROVED by Leon on the TC-0 PR (#1394), Oct 10, 2026. Values are Leon's.
--
-- Two percent bands read BY NAME (no rate literal in code), each declared optional in
-- RESOLVER_FEE_BAND_REQUIREMENTS with fallback 0 (nothing claimed):
--   transport_platform_commission  the platform's commission on a platform-booked transport leg (10%)
--   affiliate_transport_margin     the margin shown on the route-search partners — 12Go, Omio,
--                                  DiscoverCars, Kiwi — one band for all four (6%)
-- Insert-if-missing: an admin-tuned row is never overwritten; a second run is a no-op. The old
-- `booking_fee_configs` rows (platform_transport_commission, affiliate_margin_*) stay, read by nothing.
INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES
  ('transport_platform_commission', 'percent', 0.10, NULL, NULL, 'Transport — platform commission',
   'Commission on a platform-booked transport leg (taxi, private driver, transfer, shuttle). Shown on the leg''s booking options. Off ⇒ no commission claimed.', true),
  ('affiliate_transport_margin', 'percent', 0.06, NULL, NULL, 'Transport — affiliate route-search margin',
   'Margin shown on route-search partner options (12Go, Omio, DiscoverCars, Kiwi) on a leg''s booking options. Display only; partner reports set the real payout. Off ⇒ no margin claimed.', true)
ON CONFLICT (band_key) DO NOTHING;
