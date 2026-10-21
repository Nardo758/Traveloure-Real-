-- 402 — dinner-host category and the licence attestation.
-- Ledger `2026-10-21-supply-registration-fixes`.
-- HELD until Leon comments on the PR: Migration 402 SQL approved — Leon
--
-- (1) service_provider_forms.has_license — nullable boolean, NO DEFAULT, NO CHECK,
--     NO index. NULL = not answered. true = the applicant says they hold the licences
--     and permits. false = Not applicable. A blank and Not applicable stay different
--     answers. info_confirmation is a different flag (it defaults to false) and is
--     not this column.
-- (2) The Dinner host category (`dinner_host`) and one offering of the same key, so
--     /become-provider can offer it and a listing can be filed under it. The
--     commission_band_key reuses the existing `moderate` band. This file writes no rate.
--
-- Idempotent. The column is additive. The inserts do nothing when the slug or the
-- offering key is already there, and they do not overwrite an admin-tuned row.

ALTER TABLE service_provider_forms
  ADD COLUMN IF NOT EXISTS has_license BOOLEAN;

INSERT INTO service_categories
  (name, slug, description, category_type, verification_required, is_active, sort_order,
   category_key, source_type, launch_tier, commission_band_key, insurance_band,
   risk_profile, requires_background_check)
VALUES
  ('Dinner host', 'dinner-host',
   'Someone who hosts dinners for a small group at their own table.',
   'service_provider', false, true, 106,
   'dinner_host', 'platform_provider', 'segment', 'moderate', 2, 'moderate', false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('dinner_host', 'dinner_host', 'Dinner host', 'Host a dinner for a small group.', false, 232)
ON CONFLICT (offering_type_key) DO NOTHING;
