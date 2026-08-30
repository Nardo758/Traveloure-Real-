-- Phase 2 insurance migration (FEE-2): relocate insurance config from
-- booking_fee_configs to platform_settings.
--
-- WHY: commission.ts:resolveInsuranceFromCategory was the only code path that
-- read insurance from booking_fee_configs. Moving it to platform_settings lets
-- the /api/admin/fee-config write endpoints be removed without stranding the reader.
-- booking_fee_configs is retained for its other readers (transport commission,
-- startup seed, tip commission in storage.ts — 7 live readers total).
--
-- BEHAVIOR-NEUTRAL: booking_fee_configs column defaults are
--   insurance_enabled BOOLEAN DEFAULT false
--   insurance_rate_percent NUMERIC DEFAULT 0.00
--   insurance_applies_to JSONB DEFAULT '[]'
-- The seeded values below match those defaults exactly.
--
-- INTERIM HOME: platform_settings is the interim source. When FEE-2 Phase 1
-- ships the admin-validated insurance_tier, commission.ts must be updated to
-- prefer insurance_tier over these keys. See CLAUDE.md §6.
--
-- IDEMPOTENCY: ON CONFLICT DO NOTHING — re-applying on dev (where 124 was
-- previously applied then the file was deleted) is a no-op. Prod runs it once.
-- No schema/CHECK change → no publish-time push trap.

INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
VALUES
  (
    'insurance_enabled',
    'false',
    'Global insurance feature flag (FEE-2 interim). Set to ''true'' to charge the insurance rate on applicable bookings. Superseded by admin-validated insurance_tier when FEE-2 Phase 1 ships — see CLAUDE.md §6.',
    NOW()
  ),
  (
    'insurance_rate_percent',
    '0',
    'Insurance rate as a percentage of booking subtotal (FEE-2 interim). E.g. ''2.5'' = 2.5%. Matches booking_fee_configs.insurance_rate_percent default of 0.00.',
    NOW()
  ),
  (
    'insurance_applies_to',
    '[]',
    'JSON array of booking-type slugs insurance applies to (FEE-2 interim). Empty array = all applicable types. E.g. ''["accommodation","tours"]''. Matches booking_fee_configs.insurance_applies_to default of [].',
    NOW()
  )
ON CONFLICT (setting_key) DO NOTHING;
