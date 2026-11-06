-- 441_kyoto_gem_coordinates_2.sql
-- A-18 follow-up (ledger 2026-11-05-kyoto-gem-coordinates-441): editorial coordinates on fourteen more Kyoto gem rows,
-- from the sheet "Kyoto gem coordinates 2026-11-04", rows 22–35. Same shape as 437: DATA ONLY; each statement fills a gem
-- that has NO point, keyed on place_name; a point already stored is never changed, so a second run changes nothing. All
-- fourteen were read from OpenStreetMap; no Google Places coordinate is written to a gem row. The same rows extend the
-- seed list (server/seeds/kyoto-gem-coordinates.seed.ts), which lane1-guest-save.test.ts L5 pins equal to 437 + 441.
-- Expected rowcount per statement: 1 where the gem exists and has no point, else 0 (fourteen statements).

-- Ginkaku-ji — source: https://www.openstreetmap.org/way/353574388 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.0271510, longitude = 135.7976990
  WHERE city ILIKE 'kyoto' AND place_name = 'Ginkaku-ji' AND latitude IS NULL AND longitude IS NULL;

-- Gion's old streets — source: https://www.openstreetmap.org/way/190891725 (centre of street/path) — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.0057800, longitude = 135.7750240
  WHERE city ILIKE 'kyoto' AND place_name = 'Gion''s old streets' AND latitude IS NULL AND longitude IS NULL;

-- Kibune — source: https://www.openstreetmap.org/way/1467036701 (centre of street/path) — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.1235820, longitude = 135.7638910
  WHERE city ILIKE 'kyoto' AND place_name = 'Kibune' AND latitude IS NULL AND longitude IS NULL;

-- Kibune Shrine — source: https://www.openstreetmap.org/way/343853160 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.1218890, longitude = 135.7629360
  WHERE city ILIKE 'kyoto' AND place_name = 'Kibune Shrine' AND latitude IS NULL AND longitude IS NULL;

-- Kiyomizu-dera back paths — source: https://www.openstreetmap.org/way/339351648 (centre of street/path) — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 34.9951360, longitude = 135.7845500
  WHERE city ILIKE 'kyoto' AND place_name = 'Kiyomizu-dera back paths' AND latitude IS NULL AND longitude IS NULL;

-- Kurama Onsen — source: https://www.openstreetmap.org/way/319198717 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.1192450, longitude = 135.7765430
  WHERE city ILIKE 'kyoto' AND place_name = 'Kurama Onsen' AND latitude IS NULL AND longitude IS NULL;

-- Kurama-dera Temple — source: https://www.openstreetmap.org/way/1243730752 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.1178740, longitude = 135.7706520
  WHERE city ILIKE 'kyoto' AND place_name = 'Kurama-dera Temple' AND latitude IS NULL AND longitude IS NULL;

-- Kyoto Botanical Gardens — source: https://www.openstreetmap.org/way/98106475 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.0482930, longitude = 135.7629830
  WHERE city ILIKE 'kyoto' AND place_name = 'Kyoto Botanical Gardens' AND latitude IS NULL AND longitude IS NULL;

-- Omen — source: https://www.openstreetmap.org/node/4406335492 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.0261640, longitude = 135.7949500
  WHERE city ILIKE 'kyoto' AND place_name = 'Omen' AND latitude IS NULL AND longitude IS NULL;

-- Otagi Nenbutsu-ji Temple — source: https://www.openstreetmap.org/way/1230442951 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.0311600, longitude = 135.6612340
  WHERE city ILIKE 'kyoto' AND place_name = 'Otagi Nenbutsu-ji Temple' AND latitude IS NULL AND longitude IS NULL;

-- Sannenzaka & Ninenzaka — source: https://www.openstreetmap.org/way/526198271 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 34.9975290, longitude = 135.7810620
  WHERE city ILIKE 'kyoto' AND place_name = 'Sannenzaka & Ninenzaka' AND latitude IS NULL AND longitude IS NULL;

-- Tenryu-ji — source: https://www.openstreetmap.org/way/319572984 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 35.0158990, longitude = 135.6765080
  WHERE city ILIKE 'kyoto' AND place_name = 'Tenryu-ji' AND latitude IS NULL AND longitude IS NULL;

-- Tofuku-ji Temple — source: https://www.openstreetmap.org/way/768987591 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 34.9771710, longitude = 135.7745750
  WHERE city ILIKE 'kyoto' AND place_name = 'Tofuku-ji Temple' AND latitude IS NULL AND longitude IS NULL;

-- Yasaka Koshindo Temple — source: https://www.openstreetmap.org/way/1316622873 — © OpenStreetMap contributors, ODbL 1.0
UPDATE travel_pulse_hidden_gems SET latitude = 34.9983690, longitude = 135.7787630
  WHERE city ILIKE 'kyoto' AND place_name = 'Yasaka Koshindo Temple' AND latitude IS NULL AND longitude IS NULL;
