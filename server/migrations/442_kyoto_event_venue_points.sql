-- 442_kyoto_event_venue_points.sql
-- Venue points for the seven Kyoto events migration 439 seeded (ledger 2026-11-06-kyoto-event-venue-points; LD 59
-- amended by that row). DATA ONLY. Source of truth: the sheet "Kyoto gem coordinates 2026-11-04", tab "Kyoto event
-- venues"; every point is an OpenStreetMap feature, never Google Places and never hand-placed. Each statement fills one
-- manual row, keyed on (source, source_id), and only while BOTH venue_lat and venue_lng are NULL: a point already stored
-- (by the seeder's lookup or an admin edit) is never changed, and nothing else on the row is touched.
-- Expected rowcount per statement: 1 on first apply where the row exists with no point, else 0. 7 statements.

-- Kodai-ji — source: https://www.openstreetmap.org/node/7142807562 — © OpenStreetMap contributors, ODbL 1.0
UPDATE city_events SET venue_lat = 35.000734, venue_lng = 135.780791
  WHERE source = 'manual' AND source_id = 'kodaiji-autumn-night-2026' AND venue_lat IS NULL AND venue_lng IS NULL;

-- To-ji — source: https://www.openstreetmap.org/way/359935527 — © OpenStreetMap contributors, ODbL 1.0
UPDATE city_events SET venue_lat = 34.979589, venue_lng = 135.747702
  WHERE source = 'manual' AND source_id = 'toji-autumn-night-2026' AND venue_lat IS NULL AND venue_lng IS NULL;

-- Chion-in — source: https://www.openstreetmap.org/way/186983976 — © OpenStreetMap contributors, ODbL 1.0
UPDATE city_events SET venue_lat = 35.004790, venue_lng = 135.781812
  WHERE source = 'manual' AND source_id = 'chionin-autumn-lightup-2026' AND venue_lat IS NULL AND venue_lng IS NULL;

-- Eikando (Zenrin-ji) — source: https://www.openstreetmap.org/way/316011148 — © OpenStreetMap contributors, ODbL 1.0
UPDATE city_events SET venue_lat = 35.014660, venue_lng = 135.793900
  WHERE source = 'manual' AND source_id = 'eikando-autumn-night-2026' AND venue_lat IS NULL AND venue_lng IS NULL;

-- Kiyomizu-dera — source: https://www.openstreetmap.org/way/102164608 — © OpenStreetMap contributors, ODbL 1.0
UPDATE city_events SET venue_lat = 34.995428, venue_lng = 135.783338
  WHERE source = 'manual' AND source_id = 'kiyomizudera-autumn-night-2026' AND venue_lat IS NULL AND venue_lng IS NULL;

-- Minamiza theatre — source: https://www.openstreetmap.org/way/273471468 — © OpenStreetMap contributors, ODbL 1.0
UPDATE city_events SET venue_lat = 35.003482, venue_lng = 135.772379
  WHERE source = 'manual' AND source_id = 'minamiza-kaomise-2026' AND venue_lat IS NULL AND venue_lng IS NULL;

-- Chion-in (bell) — source: https://www.openstreetmap.org/way/191036774 — © OpenStreetMap contributors, ODbL 1.0
UPDATE city_events SET venue_lat = 35.004248, venue_lng = 135.783966
  WHERE source = 'manual' AND source_id = 'chionin-new-years-eve-bell-2026' AND venue_lat IS NULL AND venue_lng IS NULL;
