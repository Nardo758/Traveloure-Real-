-- Phase 2 insurance migration: move insurance configuration from booking_fee_configs
-- to platform_settings. booking_fee_configs.insurance_* columns default to disabled
-- (insurance_enabled=false, insurance_rate_percent=0, insurance_applies_to=[]) so the
-- seeded defaults here match the prior behavior exactly.
--
-- ON CONFLICT DO NOTHING — preserves any values already set by an admin and is safe
-- to re-run on environments where the keys already exist.
INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
VALUES
  ('insurance_enabled',      'false', 'Global insurance feature flag. Set to ''true'' to charge the insurance fee on applicable bookings.', NOW()),
  ('insurance_rate_percent', '0',     'Insurance rate as a percentage of the booking subtotal (e.g. ''2.5'' = 2.5%).', NOW()),
  ('insurance_applies_to',   '[]',    'JSON array of booking-type slugs insurance applies to (e.g. ''["accommodation","tours"]''). Empty array = all types.', NOW())
ON CONFLICT (setting_key) DO NOTHING;
