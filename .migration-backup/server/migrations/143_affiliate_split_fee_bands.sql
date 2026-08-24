-- 143: R4 (F7 of the revenue-model review) — affiliate-earning internal split → fee_bands.
-- Wires `createAffiliateEarning` at the agent-booking confirm site (server/routes/content.routes.ts
-- PATCH /api/affiliate-booking-requests/:id) so affiliate reconciliation finally has a ledger spine
-- (previously affiliate_earnings had zero writers). The internal platform/expert split on an
-- affiliate-facilitated booking's commission (NOT the partner's own commission %, which is unknown
-- until the partner reports it — recorded honestly as 0 pending reconciliation, never fabricated,
-- per §13) was a hardcoded constant pair in server/services/commission.ts
-- (AFFILIATE_PLATFORM_FEE=0.70 / AFFILIATE_EXPERT_SHARE=0.30, Tier 2 of resolveCommissionRates).
-- This seeds an admin-editable band; resolveCommissionRates now reads it and falls back to the same
-- code constants when the row is absent/inactive/invalid (the coordination-floor safe-failure
-- posture, §8) — the constants survive only as the documented fallback (fee-literal-ok).
-- Percent band stores the PLATFORM TAKE as a fraction (matches expert_standard/migration-033
-- convention: expert share = 1 - default_rate).
-- Idempotent ON CONFLICT DO NOTHING — never overwrites an admin-tuned value. No CHECK/schema
-- change → no publish-time push trap.

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, description, is_active)
VALUES
  ('affiliate_standard', 'percent', 0.70, 0.00, 1.00,
   'Platform share of an affiliate-facilitated booking''s internal commission split; expert share is the remainder (default 30%). Fallback default matches the pre-143 AFFILIATE_PLATFORM_FEE/AFFILIATE_EXPERT_SHARE code constants.', true)
ON CONFLICT (band_key) DO NOTHING;
