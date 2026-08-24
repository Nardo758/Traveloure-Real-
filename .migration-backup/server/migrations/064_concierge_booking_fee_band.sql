-- Phase 3.1: Facilitation-fee config for the paid Booking Concierge.
--
-- Seeds ONE flat fee-AMOUNT band. `default_rate` stores DOLLARS (9.99), NOT a
-- split fraction. 9.99 is a PLACEHOLDER — fee_bands is the admin-editable rate
-- source, so the real amount is set in-app after seed.
--
-- Semantics (consumed in Phase 3.4, documented here):
--   * This band is the fee AMOUNT only. It is NOT an earning by itself.
--   * The 75/25 expert/platform split is applied SEPARATELY via
--     resolveCommissionRates on the expert band (expert_standard). A flat band
--     is never interpreted as a split (the resolver guards on rate_type).
--
-- Idempotent: ON CONFLICT (band_key) DO NOTHING (band_key is UNIQUE). Nothing
-- routes to this band yet (no category points at it; the resolver only maps the
-- new `booking_concierge` concern here), so this seed is rate-neutral for every
-- existing category. Mirrors the 045/046 fee_bands seed migrations.
INSERT INTO fee_bands
  (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES (
  'expert_concierge_booking',
  'flat',
  9.99,
  NULL,
  NULL,
  'Booking Concierge fee',
  'Flat facilitation fee for expert-assisted (Booking Concierge) off-site bookings. PLACEHOLDER 9.99 — admin-configurable. Fee AMOUNT only; the 75/25 split rides expert_standard (Phase 3.4).',
  true
)
ON CONFLICT (band_key) DO NOTHING;
