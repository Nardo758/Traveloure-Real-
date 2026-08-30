-- Migration 234: Trend Engine Phase 1 — Residual season gap rows (Leon-approved close-out)
-- Approved via L-CLS-1 amendment 2026-08-16.
-- Closes the three remaining calendar gaps found during the 366-day leap-year coverage scan
-- across all 8 operating markets:
--
--   bogota  dry_primary  end extended from 02-28 → 02-29 (leap-year day; same season, same multiplier 1.10)
--   kyoto   autumn_shoulder  09-07 → 10-19  (shoulder between summer and momiji; multiplier 0.90)
--   porto   autumn           10-01 → 10-31  (October fully unassigned; shoulder multiplier 1.00)
--
-- Basis: Leon-approved estimates —
--   Bogotá 02-29 is the last day of the existing dry primary season; 1.10 unchanged.
--   Kyoto autumn_shoulder at 0.90 — pre-foliage shoulder sits above summer floor (0.80) but
--     well below momiji peak (1.80); conservative estimate pending BestTime.app calibration.
--   Porto autumn at 1.00 — October remains pleasant (highs ~22 °C) but crowds drop from the
--     summer peak (1.65); neutral index pending BestTime.app calibration.

-- Bogotá: extend dry_primary to cover Feb 29 in leap years
UPDATE market_season_calendars
SET    end_month_day = '02-29'
WHERE  market_key = 'bogota'
  AND  season_key = 'dry_primary'
  AND  end_month_day = '02-28';

-- Kyoto: autumn shoulder (Sep 7 – Oct 19)
INSERT INTO market_season_calendars
  (market_key, season_key, display_name, start_month_day, end_month_day, expected_demand_multiplier)
VALUES
  ('kyoto', 'autumn_shoulder', 'Autumn Shoulder', '09-07', '10-19', 0.900)
ON CONFLICT (market_key, season_key) DO NOTHING;

-- Porto: October (Oct 1 – Oct 31)
INSERT INTO market_season_calendars
  (market_key, season_key, display_name, start_month_day, end_month_day, expected_demand_multiplier)
VALUES
  ('porto', 'autumn', 'Autumn', '10-01', '10-31', 1.000)
ON CONFLICT (market_key, season_key) DO NOTHING;
