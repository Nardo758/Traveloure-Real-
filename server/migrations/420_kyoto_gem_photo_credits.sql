-- 420 — DATA ONLY. Four Kyoto discover gems whose photo area was blank.
--
-- Rechecked 2026-10-30 on production: Yoshida Sanso Ryokan, Fushimi Inari Torii
-- Tunnel at Dawn, and Philosopher's Path Canal in Autumn stored Unsplash URLs
-- that return 404 and a null image_credit. Ginkaku-ji was stored with image_url
-- NULL by migration 400. Each replacement is a Wikimedia Commons file (the same
-- host migration 400 already uses for Tenryu-ji) with the Commons artist and
-- license in image_credit. Constants: shared/kyoto-gem-photos.ts.
--
-- HELD for Leon's comment before merge. The citation form is in
-- server/migrations/AUTHORING.md. This file does not carry that sentence.
--
-- Match is city + place_name. image_url and image_credit are written only while
-- the stored URL is null, blank, the known-dead Unsplash URL, or already this
-- file's URL (so a missing credit can be filled). Any other URL is left alone.
-- A second run changes nothing. No other column is written.
--
-- DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT, no DELETE.

UPDATE travel_pulse_hidden_gems
SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Yoshida_Sanso_ac.JPG/960px-Yoshida_Sanso_ac.JPG',
    image_credit = 'Asturio Cantabrio / Wikimedia Commons, CC BY-SA 4.0'
WHERE city ILIKE 'kyoto'
  AND place_name = 'Yoshida Sanso Ryokan'
  AND (
    image_url IS NULL
    OR btrim(image_url) = ''
    OR image_url = 'https://images.unsplash.com/photo-1548165892-cd6be85a7f69?auto=format&fit=crop&w=800&q=80'
    OR image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Yoshida_Sanso_ac.JPG/960px-Yoshida_Sanso_ac.JPG'
  )
  AND (
    image_url IS DISTINCT FROM 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Yoshida_Sanso_ac.JPG/960px-Yoshida_Sanso_ac.JPG'
    OR image_credit IS DISTINCT FROM 'Asturio Cantabrio / Wikimedia Commons, CC BY-SA 4.0'
  );

UPDATE travel_pulse_hidden_gems
SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/KyotoFushimiInariLarge.jpg/960px-KyotoFushimiInariLarge.jpg',
    image_credit = 'Paul Vlaar / Wikimedia Commons, CC BY-SA 3.0'
WHERE city ILIKE 'kyoto'
  AND place_name = 'Fushimi Inari Torii Tunnel at Dawn'
  AND (
    image_url IS NULL
    OR btrim(image_url) = ''
    OR image_url = 'https://images.unsplash.com/photo-1580917922805-21d32edd27e3?auto=format&fit=crop&w=800&q=80'
    OR image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/KyotoFushimiInariLarge.jpg/960px-KyotoFushimiInariLarge.jpg'
  )
  AND (
    image_url IS DISTINCT FROM 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/KyotoFushimiInariLarge.jpg/960px-KyotoFushimiInariLarge.jpg'
    OR image_credit IS DISTINCT FROM 'Paul Vlaar / Wikimedia Commons, CC BY-SA 3.0'
  );

UPDATE travel_pulse_hidden_gems
SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/The_Philosophers_Walk_is_about_2km_long_and_runs_along_a_canal.jpg/960px-The_Philosophers_Walk_is_about_2km_long_and_runs_along_a_canal.jpg',
    image_credit = 'shankar s. / Wikimedia Commons, CC BY 2.0'
WHERE city ILIKE 'kyoto'
  AND place_name = 'Philosopher''s Path Canal in Autumn'
  AND (
    image_url IS NULL
    OR btrim(image_url) = ''
    OR image_url = 'https://images.unsplash.com/photo-1601823984263-6ec76b4c8aaf?auto=format&fit=crop&w=800&q=80'
    OR image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/The_Philosophers_Walk_is_about_2km_long_and_runs_along_a_canal.jpg/960px-The_Philosophers_Walk_is_about_2km_long_and_runs_along_a_canal.jpg'
  )
  AND (
    image_url IS DISTINCT FROM 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/The_Philosophers_Walk_is_about_2km_long_and_runs_along_a_canal.jpg/960px-The_Philosophers_Walk_is_about_2km_long_and_runs_along_a_canal.jpg'
    OR image_credit IS DISTINCT FROM 'shankar s. / Wikimedia Commons, CC BY 2.0'
  );

UPDATE travel_pulse_hidden_gems
SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Ginkaku-ji_Temple%2C_Kyoto%2C_20240820_1048_4992.jpg/960px-Ginkaku-ji_Temple%2C_Kyoto%2C_20240820_1048_4992.jpg',
    image_credit = 'Jakub Hałun / Wikimedia Commons, CC BY 4.0'
WHERE city ILIKE 'kyoto'
  AND place_name = 'Ginkaku-ji'
  AND (
    image_url IS NULL
    OR btrim(image_url) = ''
    OR image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Ginkaku-ji_Temple%2C_Kyoto%2C_20240820_1048_4992.jpg/960px-Ginkaku-ji_Temple%2C_Kyoto%2C_20240820_1048_4992.jpg'
  )
  AND (
    image_url IS DISTINCT FROM 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Ginkaku-ji_Temple%2C_Kyoto%2C_20240820_1048_4992.jpg/960px-Ginkaku-ji_Temple%2C_Kyoto%2C_20240820_1048_4992.jpg'
    OR image_credit IS DISTINCT FROM 'Jakub Hałun / Wikimedia Commons, CC BY 4.0'
  );
