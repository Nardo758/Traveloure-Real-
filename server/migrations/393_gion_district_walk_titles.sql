-- 393 — two saved Gion plan items renamed "Gion District Walk" (LG-2 Ask 9; ledger `2026-10-18-lg2-banned-phrases`).
--
-- Why: "geisha spotting" is a banned phrase in generated titles. Two production items carry it:
--   18754d33-b5ca-4b8f-9f29-65531362f829  "Gion District Walking & Geisha Spotting"
--   92049500-6c56-40b7-9816-967a8a3cc977  "Gion District Stroll & Geisha Spotting"
-- The decision-maker approved both becoming "Gion District Walk". Other items whose titles mention geisha are
-- legitimate and are NOT touched.
--
-- DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT. Each row is matched by its FULL id AND only while its current
-- title still contains "geisha spotting" (case-insensitive), so a row someone already retitled is left alone and a
-- second run changes nothing (the new title no longer contains the phrase). A database without these rows (CI, dev)
-- updates nothing.
-- founder comment: #1562 2026-10-18T23:44:58Z
UPDATE itinerary_items
SET title = 'Gion District Walk'
WHERE id IN ('18754d33-b5ca-4b8f-9f29-65531362f829', '92049500-6c56-40b7-9816-967a8a3cc977')
  AND title ILIKE '%geisha spotting%';
