-- 227: purge chōme address-block rows from city_neighborhoods (D-14, ledger row 119).
--
-- Japanese cities tag every numbered city block — chōme (丁目) — as place=quarter/neighbourhood
-- in OSM, so the admin "Add market" neighborhood extract (locked decision 20(b) vocabulary:
-- place=suburb|neighbourhood|quarter) dumped thousands of address blocks (万代一丁目,
-- 三先二丁目, …) into the picker meant for a curated neighborhood list. Live instance: Osaka.
-- A chōme is an address component, not a neighborhood a traveler files a listing under.
--
-- The extractor now skips these at source (market-extract.service.ts CHOME_BLOCK_PATTERN);
-- this migration cleans up rows already on disk. Idempotent by construction (a deleted row
-- stays deleted). A provider_services.neighborhood slug pointing at a deleted row is left
-- as-is: the column is a plain text slug (no FK), the picker renders the raw slug chip for an
-- unknown value, and re-picking writes a valid one — no listing breaks.
--
-- Pattern mirrors CHOME_BLOCK_PATTERN: one or more kanji/arabic/full-width numerals + 丁目 at
-- the end of the name.
DELETE FROM city_neighborhoods
WHERE name ~ '[0-9０-９一二三四五六七八九十百]+丁目$';
