-- 407 — DATA ONLY. Drop tips on the Japan country-level Koyo season band.
--
-- HELD for "Migration 407 SQL approved — Leon".
--
-- Architect, Oct 22, 2026, 11:30 PM ET: country-level bands carry no tips. Same match as
-- migration 405's Hanami row: exact title + country, and only a country-level row (city null
-- or blank). A city row entered in admin is left alone.
--
-- Clears tips only. The title and every other column stay as they are. The statement matches
-- only while the old tips text is still present, so a second run changes nothing and a tips
-- string someone has edited is not cleared.
--
-- DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT.

UPDATE destination_events
SET tips = NULL
WHERE country = 'Japan'
  AND title = 'Autumn Foliage Season (Koyo)'
  AND tips = $old$Kyoto's temples and Tokyo's gardens are spectacular during this time.$old$
  AND (city IS NULL OR btrim(city) = '');
