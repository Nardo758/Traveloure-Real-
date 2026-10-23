-- 405 — DATA ONLY. H-19 season-band copy for the Japan country rows.
--
-- HELD for "Migration 405 SQL approved — Leon". The new title is held for "Wording approved — Leon".
--
-- event_type is varchar(30), not a DB enum and not a CHECK, and the app list already includes
-- 'season' (shared/schema.ts destinationEventTypeEnum). No ALTER.
--
-- Match is exact title + country, and only a country-level row (city null or blank). A city row
-- Leon entered in admin is left alone, including one that still carries the old title.
-- Each statement matches only while the old text is still present, so a second run changes nothing
-- and a title someone has edited is not rewritten.
--
-- DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT. No season-window dates.

UPDATE destination_events
SET title = 'Cherry blossom season (Hanami)',
    event_type = 'season',
    tips = NULL
WHERE country = 'Japan'
  AND title = 'Cherry Blossom Festival (Hanami)'
  AND (city IS NULL OR btrim(city) = '');

UPDATE destination_events
SET event_type = 'season',
    tips = NULL
WHERE country = 'Japan'
  AND title = 'Autumn Foliage Season (Koyo)'
  AND tips = $old$Kyoto's temples and Tokyo's gardens are spectacular during this time.$old$
  AND (city IS NULL OR btrim(city) = '');
