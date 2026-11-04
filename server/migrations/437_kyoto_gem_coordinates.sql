-- 437_kyoto_gem_coordinates.sql
-- A-18 (ledger 2026-11-05-lane1-guest-save-rail): editorial coordinates on four Kyoto gem rows, from the sheet
-- "Kyoto gem coordinates 2026-11-04". DATA ONLY. Each row fills a gem that has NO point; a point already stored is never
-- changed. No Google Places coordinate is written to a gem row. The same rows are the seed
-- (server/seeds/kyoto-gem-coordinates.seed.ts), which later rows extend; kyoto-gem-coordinates.test.ts pins the two equal.
-- Expected rowcount per statement: 1 where the gem exists and has no point, else 0.

-- Hanami Koji Street — source: https://www.openstreetmap.org/way/470237770 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.0058500, longitude = 135.7752580
  WHERE city ILIKE 'kyoto' AND place_name = 'Hanami Koji Street' AND latitude IS NULL AND longitude IS NULL;

-- Sannenzaka Shopping Street — source: https://www.openstreetmap.org/way/526198271 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 34.9975290, longitude = 135.7810620
  WHERE city ILIKE 'kyoto' AND place_name = 'Sannenzaka Shopping Street' AND latitude IS NULL AND longitude IS NULL;

-- Arashiyama Bamboo Grove — source: https://www.openstreetmap.org/way/105574212 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.0176200, longitude = 135.6744450
  WHERE city ILIKE 'kyoto' AND place_name = 'Arashiyama Bamboo Grove' AND latitude IS NULL AND longitude IS NULL;

-- Togetsukyo Bridge — source: https://www.openstreetmap.org/way/28640677 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.0128710, longitude = 135.6777620
  WHERE city ILIKE 'kyoto' AND place_name = 'Togetsukyo Bridge' AND latitude IS NULL AND longitude IS NULL;
