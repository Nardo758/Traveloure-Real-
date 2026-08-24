-- Migration 108: has_insurance attestation on the provider record
-- (Structural consolidation brief, Phase 1b — decision D4-split.)
--
-- The provider application form collects a "has insurance" checkbox and then
-- silently drops it at submit (audit finding #9 / services-provider.tsx). The
-- brief's D4 decision keeps this field and gives it a real column; the other
-- dropped listing-level inputs (capacity, priceRange, amenities) are removed
-- from the form instead, and taxId is dropped entirely (tax identity defers
-- to Stripe Connect onboarding).
--
-- Table choice (per-brief grep confirm): service_provider_forms is the
-- provider-entity record —
--  • it is the row the signup submit writes (POST /api/provider-application →
--    insertServiceProviderFormSchema → service_provider_forms),
--  • it already carries the provider's verification evidence
--    (identity_verification_status, business_verification_status) read by the
--    public-verification endpoint, and
--  • the FEE-2 provider-insurance-tier brief (docs/planning/
--    fee-2-provider-insurance-tier-brief.md D1) designates this same table as
--    the home of the admin-validated insurance_tier + evidence columns that
--    the per-category insurance band resolution will read. has_insurance is
--    the applicant's self-attestation those richer columns will sit beside.
-- The category-side band requirement itself stays on
-- service_categories.insurance_band (read by checkProviderPublishGate); this
-- column is the provider-side input to that resolution.
--
-- Nullable BOOLEAN (not NOT NULL DEFAULT FALSE): rows predating this
-- migration mean "never asked", which must stay distinguishable from an
-- explicit "no".

DO $$
BEGIN
  IF to_regclass('service_provider_forms') IS NULL THEN
    RAISE EXCEPTION
      'Migration 108 REFUSED: service_provider_forms does not exist — refusing to half-apply';
  END IF;
END $$;

ALTER TABLE service_provider_forms
  ADD COLUMN IF NOT EXISTS has_insurance BOOLEAN;

-- Reversal (manual, safe — column is nullable and additive):
--   ALTER TABLE service_provider_forms DROP COLUMN IF EXISTS has_insurance;
