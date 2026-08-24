-- Migration 100: Add expert_concierge fee band
--
-- The concierge-router.service.ts calls resolveCommissionRates({ source: 'expert',
-- category: 'expert_concierge' }) to get the platform/expert split for displaying
-- concierge pricing in the EscalationCTA quote.  Without this band, the call throws
-- "commission band missing: bandKey=expert_concierge" (500 on every /api/concierge/quote
-- request), which silently disables the availability check in EscalationCTA, causing
-- the traveler to always see the instant-confirm copy even when no expert exists.
--
-- Rate mirrors expert_standard (25 % platform take / 75 % expert keep) — the canonical
-- default for expert service lines.  Admin can update via the fee-band admin UI.

INSERT INTO fee_bands (
  id, band_key, rate_type, default_rate, min_rate, max_rate,
  display_name, description, is_active, created_at, updated_at
)
VALUES (
  gen_random_uuid(),
  'expert_concierge',
  'percent',
  0.2500,
  0.1500,
  0.4000,
  'Expert Concierge',
  'Platform commission split for expert concierge service bookings shown in the EscalationCTA quote. Platform take = 0.25; expert keeps 0.75. Mirrors expert_standard — update via fee-band admin UI if needed.',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (band_key) DO NOTHING;
