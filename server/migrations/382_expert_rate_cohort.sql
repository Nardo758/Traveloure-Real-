-- FE-2 (ledger 2026-10-16-fe2-beta-cohort). Decision-maker rulings, Oct 16, 2026.
--
-- 1. Three additive, nullable columns on users, with no DEFAULT, CHECK, index or FK, and no
--    backfill here (the backfill is migration 383, held separately). Declared in
--    shared/models/auth.ts. NULL rate_cohort = no cohort, so the ordinary expert band applies.
-- 2. The beta-cohort band expert_beta_2026: platform take 0.15 (expert keeps 0.85), bounds
--    0.15 to 0.25. Inserted only when missing, so a second run changes nothing and an admin
--    edit made before a cohort member exists is never overwritten.
-- 3. Three settings, inserted only when missing: the cohort end date (blank = no end; Leon
--    sets it), the notice days (30) and the cohort a newly approved expert joins (beta_2026).
--
-- No schema change beyond the three columns, so nothing new for the publish-time push to
-- drop or recreate.

ALTER TABLE users ADD COLUMN IF NOT EXISTS rate_cohort varchar(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS rate_locked_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rate_notice_sent_at timestamp;

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
SELECT
  'expert_beta_2026',
  'percent',
  0.15,
  0.15,
  0.25,
  'Expert (beta cohort 2026)',
  'Beta-cohort expert commission on planning fees: platform take 0.15, expert keeps 0.85. Paid by experts whose users.rate_cohort is beta_2026, until expert_beta_end_date. Its rate cannot be edited while any expert is in the cohort; create a new cohort instead.',
  true
WHERE NOT EXISTS (SELECT 1 FROM fee_bands WHERE band_key = 'expert_beta_2026');

INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
VALUES
  ('expert_beta_end_date', '',
   'Last day the beta_2026 expert cohort rate applies (YYYY-MM-DD). Blank = no end date. After it, cohort experts pay the ordinary expert band.',
   now()),
  ('expert_rate_change_notice_days', '30',
   'Days of written notice an expert gets before a change to their cohort rate.',
   now()),
  ('expert_approval_rate_cohort', 'beta_2026',
   'The rate cohort a newly approved expert joins (travel_expert, local_expert, event_planner). Blank = none.',
   now())
ON CONFLICT (setting_key) DO NOTHING;
