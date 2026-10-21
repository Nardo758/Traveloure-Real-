-- 400 — Kyoto feed cleanup (ledger `2026-10-20-kyoto-feed-cleanup`).
--
-- HELD FOR LEON'S COMMENT on the PR before merge:
--   Migration 400 SQL approved — Leon
--
-- ALTER: travel_pulse_hidden_gems gains hidden_at, hours, admission, source_url, image_credit,
-- fact_checked_on. Each is nullable, with no DEFAULT, no CHECK and no index. Declared in
-- shared/schema.ts. hidden_at NULL = the card stays on the traveler feed. discovery_status is
-- unchanged (it is a popularity label, not visibility).
--
-- DATA, idempotent:
--   · hide the 28 Kyoto gems whose cleanup action starts with HIDE, by exact place_name, only
--     while hidden_at is still null. Card 36 (Gion's back alleys) is NOT in that list: it is
--     renamed "Gion's old streets" and reworded. The CSV marks 36 KEEP.
--   · strip geisha / back alley(s) / hidden gem(s) from other Kyoto description and
--     why_locals_love_it text. A second run matches nothing because the phrases are gone.
--   · Arashiyama centroid 35.0158, 135.6745, radius 2.20 km, only when a value differs.
--   · insert Ginkaku-ji & Philosopher's Path and Kurama & Kibune. Kurama/Kibune CARDS stay
--     city-wide (neighbourhood NULL), per the area mapping, not the new slug.
--   · three cards (Tenryu-ji, Arashiyama Bamboo Grove, Ginkaku-ji), inserted only when that
--     place_name is absent in Kyoto, then aligned while any approved field still differs.
--   · withdraw the Kyoto Uchida event (ticket sales closed) and hide a Kyoto gem whose name
--     or description contains Uchida. Matched by name, not by a UUID, so every environment
--     hits the same row. Nothing is deleted.
--   · hide the happening-now row titled "Sakura Light-Up at Meguro River" by exact title.
--     The row is not deleted. #1603 removes it from the seeds; this UPDATE covers a database
--     that already ran the old seed. Hide count is 29: the 28 Kyoto gems plus this title.
--
-- This file is migration 400 and merges before #1606 (that PR's geocode-cache migration is 401).
--
-- No street address is written. New cards do not invent latitude or longitude.

ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS hidden_at timestamp;
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS hours text;
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS admission text;
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS image_credit text;
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS fact_checked_on date;
ALTER TABLE travel_pulse_happening_now ADD COLUMN IF NOT EXISTS hidden_at timestamp;

-- Happening-now. Exact title. The row stays.
UPDATE travel_pulse_happening_now
SET hidden_at = now()
WHERE hidden_at IS NULL
  AND title = 'Sakura Light-Up at Meguro River';

UPDATE travel_pulse_hidden_gems
SET hidden_at = now()
WHERE hidden_at IS NULL
  AND city ILIKE 'kyoto'
  AND place_name IN (
    'Fushimi Inari Pre-Dawn Hike',
    'Kagurazaka Ishikawa',
    'Kishiwada',
    'Tetsugaku-no-Michi (Philosopher''s Path)',
    'Tofuku-ji Temple during autumn',
    'Nishiki Market alley stalls',
    'Kaguraden Cafe',
    'Yoshida-ya',
    'Nishiki Market Alley',
    'Kibune Village',
    'Nishiki Market',
    'Philosopher''s Path',
    'Ganko Tako',
    'Nishiki Market side alleys',
    'Ganko Takoichi',
    'Omen Cafe',
    'Ninen-zaka and Sannen-zaka',
    'Ninenzaka and Sannenzaka',
    'Ganko Takoyaki',
    'Omen Gion',
    'Omen Arashiyama',
    'Ganko Takao Honten',
    'Gion''s private tea ceremony',
    'Philosopher''s Path at dusk',
    'Ninen-zaka & Sannen-zaka',
    'Pontocho evening walk',
    'Kishiwada Cafe',
    'Otagi Nenbutsu-ji'
  );

-- Uchida gems (G-01). The known card is the city event below; a gem that names Uchida is hidden too.
UPDATE travel_pulse_hidden_gems
SET hidden_at = now()
WHERE hidden_at IS NULL
  AND city ILIKE 'kyoto'
  AND (
    place_name ILIKE '%Uchida%'
    OR coalesce(description, '') ILIKE '%Uchida%'
    OR coalesce(why_locals_love_it, '') ILIKE '%Uchida%'
  );

-- Uchida event. source_id mitsuko-uchida-kyoto-2026 is the stable key; the UUID differs by database.
UPDATE city_events
SET withdrawn_at = now()
WHERE withdrawn_at IS NULL
  AND city ILIKE 'kyoto'
  AND (
    title ILIKE '%Uchida%'
    OR venue ILIKE '%Uchida%'
    OR source_id ILIKE '%uchida%'
    OR coalesce(billed_artists, '') ILIKE '%Uchida%'
    OR coalesce(blurb, '') ILIKE '%Uchida%'
  );

-- Card 36. why_locals_love_it is cleared when it still contains a banned phrase, because the card
-- prefers that field over description. A clean why-text is left as the host wrote it.
UPDATE travel_pulse_hidden_gems
SET place_name = 'Gion''s old streets',
    description = $gion$Walk the lanes of Gion, Kyoto's historic teahouse district, with its wooden machiya townhouses.$gion$,
    neighborhood = 'gion',
    why_locals_love_it = CASE
      WHEN why_locals_love_it ~* '\m(geishas?|back[[:space:]]+alleys?|hidden[[:space:]]+gems?)\M' THEN NULL
      ELSE why_locals_love_it
    END
WHERE city ILIKE 'kyoto'
  AND place_name IN ('Gion''s back alleys', 'Gion''s old streets')
  AND (
    place_name IS DISTINCT FROM 'Gion''s old streets'
    OR description IS DISTINCT FROM $gion$Walk the lanes of Gion, Kyoto's historic teahouse district, with its wooden machiya townhouses.$gion$
    OR neighborhood IS DISTINCT FROM 'gion'
    OR why_locals_love_it ~* '\m(geishas?|back[[:space:]]+alleys?|hidden[[:space:]]+gems?)\M'
  );

-- Same replacements as rewordKyotoBannedCopy (shared/kyoto-gem-copy.ts). Only rows that still
-- contain a banned phrase are written, so a second run changes nothing.
UPDATE travel_pulse_hidden_gems
SET description = NULLIF(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        description,
        '\mgeisha[[:space:]]+district\M', 'district', 'gi'),
        '\m(?:a|an|the)[[:space:]]+hidden[[:space:]]+gems?\M', '', 'gi'),
        '\mhidden[[:space:]]+gems?\M', '', 'gi'),
        '\mback[[:space:]]+alleys\M', 'lanes', 'gi'),
        '\mback[[:space:]]+alley\M', 'lane', 'gi'),
        '\mgeishas?\M', '', 'gi'),
      '[[:space:]]+([.,;:!?])', '\1', 'g'),
      '[[:space:]]{2,}', ' ', 'g'),
      '^[[:punct:][:space:]]+$', '', 'g')), '')
WHERE city ILIKE 'kyoto'
  AND description ~* '\m(geishas?|back[[:space:]]+alleys?|hidden[[:space:]]+gems?)\M';

UPDATE travel_pulse_hidden_gems
SET why_locals_love_it = NULLIF(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        why_locals_love_it,
        '\mgeisha[[:space:]]+district\M', 'district', 'gi'),
        '\m(?:a|an|the)[[:space:]]+hidden[[:space:]]+gems?\M', '', 'gi'),
        '\mhidden[[:space:]]+gems?\M', '', 'gi'),
        '\mback[[:space:]]+alleys\M', 'lanes', 'gi'),
        '\mback[[:space:]]+alley\M', 'lane', 'gi'),
        '\mgeishas?\M', '', 'gi'),
      '[[:space:]]+([.,;:!?])', '\1', 'g'),
      '[[:space:]]{2,}', ' ', 'g'),
      '^[[:punct:][:space:]]+$', '', 'g')), '')
WHERE city ILIKE 'kyoto'
  AND why_locals_love_it ~* '\m(geishas?|back[[:space:]]+alleys?|hidden[[:space:]]+gems?)\M';

UPDATE city_neighborhoods
SET centroid_lat = 35.0158,
    centroid_lng = 135.6745,
    radius_km = 2.20,
    updated_at = now()
WHERE city = 'Kyoto'
  AND country = 'Japan'
  AND slug = 'arashiyama'
  AND (
    centroid_lat IS DISTINCT FROM 35.0158
    OR centroid_lng IS DISTINCT FROM 135.6745
    OR radius_km IS DISTINCT FROM 2.20
  );

INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng, radius_km, description)
VALUES
  ('kyoto-nb-ginkaku-ji', 'Kyoto', 'Japan', 'Ginkaku-ji & Philosopher''s Path', 'ginkaku-ji-philosophers-path', 35.0225, 135.7925, 0.90, 'Ginkaku-ji and the northern end of the Philosopher''s Path.'),
  ('kyoto-nb-kurama-kibune', 'Kyoto', 'Japan', 'Kurama & Kibune', 'kurama-kibune', 35.1200, 135.7700, 0.80, 'The northern villages of Kurama and Kibune.')
ON CONFLICT ON CONSTRAINT city_neighborhoods_city_country_slug_uniq DO UPDATE
SET name = EXCLUDED.name,
    centroid_lat = EXCLUDED.centroid_lat,
    centroid_lng = EXCLUDED.centroid_lng,
    radius_km = EXCLUDED.radius_km,
    updated_at = now()
WHERE city_neighborhoods.name IS DISTINCT FROM EXCLUDED.name
   OR city_neighborhoods.centroid_lat IS DISTINCT FROM EXCLUDED.centroid_lat
   OR city_neighborhoods.centroid_lng IS DISTINCT FROM EXCLUDED.centroid_lng
   OR city_neighborhoods.radius_km IS DISTINCT FROM EXCLUDED.radius_km;

UPDATE travel_pulse_hidden_gems
SET neighborhood = 'fushimi'
WHERE city ILIKE 'kyoto'
  AND place_name IN ('Fushimi Inari Torii Tunnel at Dawn', 'Tofuku-ji Temple')
  AND neighborhood IS DISTINCT FROM 'fushimi';

UPDATE travel_pulse_hidden_gems
SET neighborhood = 'higashiyama'
WHERE city ILIKE 'kyoto'
  AND place_name IN ('Sannenzaka & Ninenzaka', 'Kiyomizu-dera back paths', 'Yasaka Koshindo Temple')
  AND neighborhood IS DISTINCT FROM 'higashiyama';

UPDATE travel_pulse_hidden_gems
SET neighborhood = 'gion'
WHERE city ILIKE 'kyoto'
  AND place_name IN ('Gion''s back alleys', 'Gion''s old streets')
  AND neighborhood IS DISTINCT FROM 'gion';

UPDATE travel_pulse_hidden_gems
SET neighborhood = 'kawaramachi-sanjo'
WHERE city ILIKE 'kyoto'
  AND place_name IN ('Ippodo Tea Kaboku Tearoom', 'Nishiki Market Side Alleys')
  AND neighborhood IS DISTINCT FROM 'kawaramachi-sanjo';

UPDATE travel_pulse_hidden_gems
SET neighborhood = 'pontocho'
WHERE city ILIKE 'kyoto'
  AND place_name = 'Pontocho Alley Evening Stroll'
  AND neighborhood IS DISTINCT FROM 'pontocho';

-- City-wide. Philosopher's Path Canal in Autumn stays here and is not moved to ginkaku-ji-philosophers-path.
-- Kurama-dera, Kibune, Kurama Onsen and Kibune Shrine are not assigned to kurama-kibune.
UPDATE travel_pulse_hidden_gems
SET neighborhood = NULL
WHERE city ILIKE 'kyoto'
  AND place_name IN (
    'Yoshida Sanso Ryokan',
    'Kanga-an Temple Shojin Ryori',
    'Kurama-dera Temple',
    'Kibune',
    'Omen',
    'Otagi Nenbutsu-ji Temple',
    'Kyoto Botanical Gardens',
    'Kurama Onsen',
    'Kibune Shrine',
    'Philosopher''s Path Canal in Autumn'
  )
  AND neighborhood IS NOT NULL;

INSERT INTO travel_pulse_hidden_gems (
  id, city, country, place_name, place_type, description, neighborhood,
  image_url, image_credit, hours, admission, source_url, fact_checked_on,
  why_locals_love_it, price_range, gem_score, ai_generated,
  source_class, reuse_class, author_label, verified_at
)
SELECT
  'kyoto-gem-tenryu-ji', 'Kyoto', 'Japan', 'Tenryu-ji', 'temple',
  $tenryu$A Zen temple in Arashiyama, with a pond garden set against the western hills.$tenryu$,
  'arashiyama',
  'https://upload.wikimedia.org/wikipedia/commons/c/c7/Tenry%C5%AB-ji_Garten.jpg',
  'Marco Almbauer / Wikimedia Commons, CC BY-SA 4.0',
  $hrs$Garden 8:30–17:00, last entry 16:50 (opens 7:30 Nov 14–30)$hrs$,
  $adm$Garden ¥500 adult; buildings +¥300$adm$,
  'https://www.tenryuji.com/en/',
  DATE '2026-10-20',
  NULL, NULL, 80, false,
  'local', 'reusable', 'Traveloure team', now()
WHERE NOT EXISTS (
  SELECT 1 FROM travel_pulse_hidden_gems WHERE city ILIKE 'kyoto' AND place_name = 'Tenryu-ji'
);

UPDATE travel_pulse_hidden_gems
SET place_type = 'temple',
    description = $tenryu$A Zen temple in Arashiyama, with a pond garden set against the western hills.$tenryu$,
    neighborhood = 'arashiyama',
    image_url = 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Tenry%C5%AB-ji_Garten.jpg',
    image_credit = 'Marco Almbauer / Wikimedia Commons, CC BY-SA 4.0',
    hours = $hrs$Garden 8:30–17:00, last entry 16:50 (opens 7:30 Nov 14–30)$hrs$,
    admission = $adm$Garden ¥500 adult; buildings +¥300$adm$,
    source_url = 'https://www.tenryuji.com/en/',
    fact_checked_on = DATE '2026-10-20',
    why_locals_love_it = NULL,
    price_range = NULL,
    country = 'Japan'
WHERE city ILIKE 'kyoto'
  AND place_name = 'Tenryu-ji'
  AND (
    place_type IS DISTINCT FROM 'temple'
    OR description IS DISTINCT FROM $tenryu$A Zen temple in Arashiyama, with a pond garden set against the western hills.$tenryu$
    OR neighborhood IS DISTINCT FROM 'arashiyama'
    OR image_url IS DISTINCT FROM 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Tenry%C5%AB-ji_Garten.jpg'
    OR image_credit IS DISTINCT FROM 'Marco Almbauer / Wikimedia Commons, CC BY-SA 4.0'
    OR hours IS DISTINCT FROM $hrs$Garden 8:30–17:00, last entry 16:50 (opens 7:30 Nov 14–30)$hrs$
    OR admission IS DISTINCT FROM $adm$Garden ¥500 adult; buildings +¥300$adm$
    OR source_url IS DISTINCT FROM 'https://www.tenryuji.com/en/'
    OR fact_checked_on IS DISTINCT FROM DATE '2026-10-20'
    OR why_locals_love_it IS NOT NULL
    OR price_range IS NOT NULL
    OR country IS DISTINCT FROM 'Japan'
  );

INSERT INTO travel_pulse_hidden_gems (
  id, city, country, place_name, place_type, description, neighborhood,
  image_url, image_credit, hours, admission, source_url, fact_checked_on,
  why_locals_love_it, price_range, gem_score, ai_generated,
  source_class, reuse_class, author_label, verified_at
)
SELECT
  'kyoto-gem-arashiyama-bamboo-grove', 'Kyoto', 'Japan', 'Arashiyama Bamboo Grove', 'attraction',
  $bamboo$A public path through tall bamboo, a short walk from Tenryu-ji's north gate.$bamboo$,
  'arashiyama',
  'https://upload.wikimedia.org/wikipedia/commons/e/ef/Arashiyama_Bamboo_Grove_%28Unsplash%29.jpg',
  NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, 80, false,
  'local', 'reusable', 'Traveloure team', now()
WHERE NOT EXISTS (
  SELECT 1 FROM travel_pulse_hidden_gems WHERE city ILIKE 'kyoto' AND place_name = 'Arashiyama Bamboo Grove'
);

UPDATE travel_pulse_hidden_gems
SET place_type = 'attraction',
    description = $bamboo$A public path through tall bamboo, a short walk from Tenryu-ji's north gate.$bamboo$,
    neighborhood = 'arashiyama',
    image_url = 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Arashiyama_Bamboo_Grove_%28Unsplash%29.jpg',
    image_credit = NULL,
    hours = NULL,
    admission = NULL,
    source_url = NULL,
    fact_checked_on = NULL,
    why_locals_love_it = NULL,
    price_range = NULL,
    country = 'Japan'
WHERE city ILIKE 'kyoto'
  AND place_name = 'Arashiyama Bamboo Grove'
  AND (
    place_type IS DISTINCT FROM 'attraction'
    OR description IS DISTINCT FROM $bamboo$A public path through tall bamboo, a short walk from Tenryu-ji's north gate.$bamboo$
    OR neighborhood IS DISTINCT FROM 'arashiyama'
    OR image_url IS DISTINCT FROM 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Arashiyama_Bamboo_Grove_%28Unsplash%29.jpg'
    OR image_credit IS NOT NULL
    OR hours IS NOT NULL
    OR admission IS NOT NULL
    OR source_url IS NOT NULL
    OR fact_checked_on IS NOT NULL
    OR why_locals_love_it IS NOT NULL
    OR price_range IS NOT NULL
    OR country IS DISTINCT FROM 'Japan'
  );

INSERT INTO travel_pulse_hidden_gems (
  id, city, country, place_name, place_type, description, neighborhood,
  image_url, image_credit, hours, admission, source_url, fact_checked_on,
  why_locals_love_it, price_range, gem_score, ai_generated,
  source_class, reuse_class, author_label, verified_at
)
SELECT
  'kyoto-gem-ginkaku-ji', 'Kyoto', 'Japan', 'Ginkaku-ji', 'temple',
  $ginkaku$The Silver Pavilion temple, with a sand garden and moss paths at the start of the Philosopher's Path.$ginkaku$,
  'ginkaku-ji-philosophers-path',
  NULL, NULL,
  $hrs$Mar–Nov 8:30–17:00; Dec–Feb 9:00–16:30$hrs$,
  $adm$Adult ¥1,000; school ¥500$adm$,
  'https://www.shokoku-ji.jp/en/ginkakuji/',
  DATE '2026-10-20',
  NULL, NULL, 80, false,
  'local', 'reusable', 'Traveloure team', now()
WHERE NOT EXISTS (
  SELECT 1 FROM travel_pulse_hidden_gems WHERE city ILIKE 'kyoto' AND place_name = 'Ginkaku-ji'
);

UPDATE travel_pulse_hidden_gems
SET place_type = 'temple',
    description = $ginkaku$The Silver Pavilion temple, with a sand garden and moss paths at the start of the Philosopher's Path.$ginkaku$,
    neighborhood = 'ginkaku-ji-philosophers-path',
    image_url = NULL,
    image_credit = NULL,
    hours = $hrs$Mar–Nov 8:30–17:00; Dec–Feb 9:00–16:30$hrs$,
    admission = $adm$Adult ¥1,000; school ¥500$adm$,
    source_url = 'https://www.shokoku-ji.jp/en/ginkakuji/',
    fact_checked_on = DATE '2026-10-20',
    why_locals_love_it = NULL,
    price_range = NULL,
    country = 'Japan'
WHERE city ILIKE 'kyoto'
  AND place_name = 'Ginkaku-ji'
  AND (
    place_type IS DISTINCT FROM 'temple'
    OR description IS DISTINCT FROM $ginkaku$The Silver Pavilion temple, with a sand garden and moss paths at the start of the Philosopher's Path.$ginkaku$
    OR neighborhood IS DISTINCT FROM 'ginkaku-ji-philosophers-path'
    OR image_url IS NOT NULL
    OR image_credit IS NOT NULL
    OR hours IS DISTINCT FROM $hrs$Mar–Nov 8:30–17:00; Dec–Feb 9:00–16:30$hrs$
    OR admission IS DISTINCT FROM $adm$Adult ¥1,000; school ¥500$adm$
    OR source_url IS DISTINCT FROM 'https://www.shokoku-ji.jp/en/ginkakuji/'
    OR fact_checked_on IS DISTINCT FROM DATE '2026-10-20'
    OR why_locals_love_it IS NOT NULL
    OR price_range IS NOT NULL
    OR country IS DISTINCT FROM 'Japan'
  );
