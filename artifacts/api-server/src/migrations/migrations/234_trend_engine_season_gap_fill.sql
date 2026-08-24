-- Migration 234: Trend Engine — fill three season calendar gaps (Leon-approved 2026-08-16)
--
-- Bogotá dry_primary: extend end_month_day 02-28 → 02-29 (covers leap-year Feb 29, still dry season)
-- Kyoto early_autumn: new row 09-07→10-19, multiplier 1.000 (neutral shoulder between summer and momiji)
-- Porto autumn_shoulder: new row 10-01→10-31, multiplier 1.100 (harvest-season city-break shoulder)
--
-- Bases: Leon-approved estimates —
--   bogota/dry_primary extended to 02-29 because Feb 29 is climatically identical to the dry window
--   kyoto/early_autumn 1.000: early autumn transition, typhoon tail softens late-Sep, Oct pre-foliage rising
--   porto/autumn_shoulder 1.100: harvest-season shoulder, post-summer but warm, popular city-break month

UPDATE market_season_calendars
SET end_month_day = '02-29'
WHERE market_key = 'bogota'
  AND season_key  = 'dry_primary';

INSERT INTO market_season_calendars
  (market_key, season_key, display_name, start_month_day, end_month_day, expected_demand_multiplier)
VALUES
  ('kyoto', 'early_autumn',   'Early Autumn',   '09-07', '10-19', 1.000),
  ('porto', 'autumn_shoulder','Autumn Shoulder', '10-01', '10-31', 1.100)
ON CONFLICT (market_key, season_key) DO NOTHING;
