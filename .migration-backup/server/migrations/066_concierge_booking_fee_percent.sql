-- Migration 066: Update expert_concierge_booking fee band from flat $9.99 placeholder
-- to the agreed-upon 5 % facilitation rate (stored as 0.05, rate_type = 'percent').
--
-- Percent semantics (same as other percent bands):
--   0.05 = 5 % of the off-site booking value charged as the concierge facilitation fee.
--
-- The 75/25 expert/platform revenue split continues to ride expert_standard separately;
-- this band is the USER-FACING fee amount only (Phase 3.4 resolver semantics unchanged).
--
-- Idempotent: UPDATE is safe to re-run (sets the same values if already applied).
UPDATE fee_bands
SET
  rate_type    = 'percent',
  default_rate = 0.05,
  min_rate     = NULL,
  max_rate     = NULL,
  display_name = 'Booking Concierge fee',
  description  = '5 % facilitation fee charged on off-site bookings assisted by an expert via the Booking Concierge. Stored as a fraction (0.05 = 5 %). The expert/platform revenue split is applied separately via the expert_standard band.'
WHERE band_key = 'expert_concierge_booking';
