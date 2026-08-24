-- Phase 1.6: Early-adopter provider commission gate.
--
-- Adds early_adopter_cutoff_date to platform_settings.
-- The commission resolver reads this to decide which fee band a provider gets:
--   registered BEFORE cutoff  →  beta_flat (10% platform take)
--   registered ON/AFTER cutoff →  expert_standard (25% platform take)
--
-- Set to an empty string to disable the gate (all providers get beta_flat).
-- The date format is ISO-8601 (YYYY-MM-DD). Update via the admin platform
-- settings UI or directly in the DB before launch.

INSERT INTO platform_settings (setting_key, setting_value, description)
VALUES
  ('early_adopter_cutoff_date', '2026-09-30',
   'ISO date (YYYY-MM-DD). Providers who registered before this date receive the beta_flat rate (10% platform take / 90% provider). Those registering on or after this date receive the expert_standard rate (25% platform take / 75% provider). Set to empty string to disable the gate — all providers keep beta_flat.')
ON CONFLICT (setting_key) DO NOTHING;
