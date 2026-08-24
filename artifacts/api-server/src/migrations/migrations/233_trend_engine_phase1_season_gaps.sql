-- Migration 232: Trend Engine Phase 1 — Season gap rows (Leon-approved close-out)
-- Approved via TREND_ENGINE_PHASE1_CLOSEOUT_DISPATCH 2026-08-16.
-- Inserts two rows that close calendar coverage gaps found during corrective gate:
--   kyoto: 04-21 → 06-06 (Spring Shoulder; Golden Week sits inside the window)
--   edinburgh: 09-01 → 10-31 (Autumn Shoulder; post-Festival cooldown above winter floor)
-- Basis: Leon-approved estimate —
--   kyoto spring_shoulder held at 1.10 because Golden Week (late Apr–early May) sits inside the window;
--   Edinburgh autumn_shoulder 0.90 as post-Festival cooldown above winter floor.

INSERT INTO market_season_calendars
  (market_key, season_key, display_name, start_month_day, end_month_day, expected_demand_multiplier)
VALUES
  ('kyoto',     'spring_shoulder', 'Spring Shoulder', '04-21', '06-06', 1.100),
  ('edinburgh', 'autumn_shoulder', 'Autumn Shoulder', '09-01', '10-31', 0.900)
ON CONFLICT (market_key, season_key) DO NOTHING;
