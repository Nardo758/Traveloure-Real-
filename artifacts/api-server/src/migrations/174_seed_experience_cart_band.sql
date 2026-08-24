-- 174: Move the last hardcoded commission rates into fee_bands (DECISIONS.md ruling 25;
-- standing fee-literal follow-up filed when phase2-fee-gate was wired in ruling 27).
--
-- (a) experience_cart_checkout — the EXPERIENCE_CART display/preview rate in
--     server/utils/commissionCalculator.ts was a `0.30` code literal annotated
--     fee-literal-ok. This seeds it as an admin-editable percent band (platform-take
--     fraction, migration-033 convention); the calculator now REQUIRES the rate to be
--     passed in, resolved via requireExperienceCartRate() in server/services/commission.ts.
--     Fail-loud on missing band (same posture as requireConciergeBookingRate).
--     NOTE: the actual checkout CHARGE path (payments.routes.ts) already resolves rates
--     per item via resolveCommissionRates(); this band backs the typed display breakdown.
--
-- (b) expert_standard — ruling 25: "Expert-favorable 0.75 fallback moves into fee_bands
--     as a default row (safety net lives in the single source of truth)". The band was
--     first seeded in 033 conditional on booking_fee_configs; this idempotent re-seed
--     guarantees the default row exists on any DB (e.g. fresh bootstrap where 033's
--     WHERE NOT EXISTS path could have raced booking_fee_configs contents). The
--     EXPERT_SHARE_RATE / PLATFORM_FEE_RATE code constants survive only as the
--     documented last-resort data-model defaults for unset revenueShareRate.
--
-- Behavior-neutral on apply: values match the pre-174 literals; idempotent
-- ON CONFLICT DO NOTHING — never overwrites an admin-tuned value. No schema change.

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES
  ('experience_cart_checkout', 'percent', 0.30, 0.00, 1.00,
   'Experience cart checkout',
   'Platform take on the EXPERIENCE_CART catalog-checkout surface (typed display breakdown in commissionCalculator). Default matches the pre-174 hardcoded 30% rate.',
   true),
  ('expert_standard', 'percent', 0.25, 0.15, 0.25,
   'Expert (standard)',
   'Established-expert split. Platform take = 0.25; expert keeps 0.75. Default for expert line items. Re-seeded per ruling 25 so the 75/25 safety net lives in fee_bands.',
   true)
ON CONFLICT (band_key) DO NOTHING;
