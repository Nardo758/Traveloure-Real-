-- 410 — DATA ONLY. Four popular-cities gems were stored with discovery_status
-- 'trending'. shared/gem-visibility.ts names hidden, emerging, and discovered.
--
-- HELD for Leon's comment before merge. The citation form is in
-- server/migrations/AUTHORING.md. This file is not that comment.
--
-- travel_pulse_hidden_gems has no slug column. The popular-cities seeder
-- identifies a row by (city, place_name) and skips a row that already exists,
-- so a database seeded earlier keeps 'trending' until this UPDATE. Neighborhood
-- is not the match: lien-chieu is shared with another gem.
--
-- Each match is that pair, and only while discovery_status is still 'trending'.
-- A second run changes nothing. A row already moved off 'trending' is left
-- alone. No other column is written.
--
-- DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT, no DELETE.

UPDATE travel_pulse_hidden_gems
SET discovery_status = 'emerging'
WHERE discovery_status = 'trending'
  AND (
    (city = 'Da Nang' AND place_name = 'Hai Van Pass north viewpoint')
    OR (city = 'Hoi An' AND place_name = 'Banh Mi Madam Khanh')
    OR (city = 'Hoi An' AND place_name = 'Cam Thanh coconut forest by basket boat')
    OR (city = 'Ho Chi Minh City' AND place_name = 'The Lunch Lady (Nguyen Thi Thanh)')
  );
