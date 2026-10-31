-- 421 — DATA ONLY. Kyoto discover seed cleanup (row 300a).
--
-- Fresh boots insert the cleaned copy from server/seeds/popular-cities-content.seed.ts.
-- This file writes the same strings onto rows that already exist. Match is city +
-- place_name, and a copy column changes only while it still holds the prior text,
-- so a hand edit is left alone. A second run changes nothing.
--
-- Ginkaku-ji hours, admission, source_url and fact_checked_on are the seeded fact.
-- They are realigned while any of the four differs, the same posture migration 400
-- uses for this card. The autumn viewing period cites the temple event page inside
-- the hours line. The fee and the regular hours cite the access page.
-- Checked 2026-10-31.
--   https://www.shokoku-ji.jp/en/ginkakuji/access/
--   https://www.shokoku-ji.jp/ginkakuji/event/
-- Admission and the autumn viewing sentence are HELD wording.
--
-- Photo credits that row 299a did not cover. Tenryu-ji and the bamboo grove keep
-- their file and gain a credit that names the Commons file page and the license URL.
-- Ippodo, Nishiki Market and Kanga-an replace the known Unsplash URL only.
-- Any other stored URL is left alone. Constants: shared/kyoto-seed-cleanup.ts.
--
-- HELD for Leon's comment before merge. The citation form is in
-- server/migrations/AUTHORING.md. This file does not carry that sentence.
--
-- DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT, no DELETE, no INSERT.

UPDATE travel_pulse_hidden_gems
SET address = $n0$59-1 Yoshida Shimooji-cho$n0$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Yoshida Sanso Ryokan'
  AND address = $p0$59-1 Yoshida Shimoadachi-cho, Sakyo Ward, Kyoto$p0$;

UPDATE travel_pulse_hidden_gems
SET description = $n1$The lower torii tunnel photographed empty, backlit by the first sun slicing through the orange gates.$n1$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Fushimi Inari Torii Tunnel at Dawn'
  AND description = $p1$The lower torii tunnel photographed empty at 5am, backlit by the first sun slicing through the orange gates. Arguably the best photo opportunity in all of Japan.$p1$;

UPDATE travel_pulse_hidden_gems
SET why_locals_love_it = $n2$At dawn it is yours alone and lit like a film set.$n2$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Fushimi Inari Torii Tunnel at Dawn'
  AND why_locals_love_it = $p2$By 9am this exact spot has 200 people queuing. At dawn it is yours alone and lit like a film set.$p2$;

UPDATE travel_pulse_hidden_gems
SET description = $n3$The canal-side path connecting Nanzen-ji to Ginkaku-ji. The red maple canopy over the water is arguably more beautiful than sakura season.$n3$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Philosopher''s Path Canal in Autumn'
  AND description = $p3$The canal-side path connecting Nanzen-ji to Ginkaku-ji. Less visited in autumn than spring, the red maple canopy over the water is arguably more beautiful than sakura season.$p3$;

UPDATE travel_pulse_hidden_gems
SET description = $n4$The 10,000 torii path is magical. Arriving at 4:30am means walking the full summit trail in mist and candlelight.$n4$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Fushimi Inari Pre-Dawn Hike'
  AND description = $p4$The 10,000 torii path is magical but overcrowded by 8am. Arriving at 4:30am means walking the full summit trail completely alone in mist and candlelight.$p4$;

UPDATE travel_pulse_hidden_gems
SET why_locals_love_it = $n5$Dawn at the summit is a genuinely spiritual experience.$n5$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Fushimi Inari Pre-Dawn Hike'
  AND why_locals_love_it = $p5$Dawn at the summit is a genuinely spiritual experience. Most tourists only do the first 30 minutes.$p5$;

UPDATE travel_pulse_hidden_gems
SET why_locals_love_it = NULL
WHERE city ILIKE 'kyoto'
  AND place_name = 'Pontocho Alley Evening Stroll'
  AND why_locals_love_it = $p6$The pre-dinner golden hour with lanterns just lit and no crowds is the most photogenic moment in all Kyoto.$p6$;

UPDATE travel_pulse_hidden_gems
SET best_for = (
  SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(best_for, '[]'::jsonb)) WITH ORDINALITY AS listed(elem, ord)
  WHERE elem #>> '{}' <> 'avoiding crowds'
)
WHERE city ILIKE 'kyoto'
  AND place_name = 'Fushimi Inari Pre-Dawn Hike'
  AND best_for @> $tag$["avoiding crowds"]$tag$::jsonb;

UPDATE travel_pulse_hidden_gems
SET hours = $hrs$Mar–Nov 8:30–17:00; Dec–Feb 9:00–16:30. Autumn viewing Nov 1 – Dec 5 (https://www.shokoku-ji.jp/ginkakuji/event/)$hrs$,
    admission = $adm$Adult ¥1,000; elementary and junior high ¥500$adm$,
    source_url = 'https://www.shokoku-ji.jp/en/ginkakuji/access/',
    fact_checked_on = DATE '2026-10-31'
WHERE city ILIKE 'kyoto'
  AND place_name = 'Ginkaku-ji'
  AND (
    hours IS DISTINCT FROM $hrs$Mar–Nov 8:30–17:00; Dec–Feb 9:00–16:30. Autumn viewing Nov 1 – Dec 5 (https://www.shokoku-ji.jp/ginkakuji/event/)$hrs$
    OR admission IS DISTINCT FROM $adm$Adult ¥1,000; elementary and junior high ¥500$adm$
    OR source_url IS DISTINCT FROM 'https://www.shokoku-ji.jp/en/ginkakuji/access/'
    OR fact_checked_on IS DISTINCT FROM DATE '2026-10-31'
  );

UPDATE travel_pulse_hidden_gems
SET image_credit = $cred$Marco Almbauer / Wikimedia Commons, CC BY-SA 4.0. Source: https://commons.wikimedia.org/wiki/File:Tenryū-ji_Garten.jpg License: https://creativecommons.org/licenses/by-sa/4.0/$cred$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Tenryu-ji'
  AND (
    image_url = $m$https://upload.wikimedia.org/wikipedia/commons/c/c7/Tenry%C5%AB-ji_Garten.jpg$m$
  )
  AND image_credit IS DISTINCT FROM $cred$Marco Almbauer / Wikimedia Commons, CC BY-SA 4.0. Source: https://commons.wikimedia.org/wiki/File:Tenryū-ji_Garten.jpg License: https://creativecommons.org/licenses/by-sa/4.0/$cred$
  AND (
    image_credit IS NULL
    OR btrim(image_credit) = ''
    OR image_credit = $old$Marco Almbauer / Wikimedia Commons, CC BY-SA 4.0$old$
  )
;

UPDATE travel_pulse_hidden_gems
SET image_credit = $cred$Erol Ahmed / Wikimedia Commons, CC0. Source: https://commons.wikimedia.org/wiki/File:Arashiyama_Bamboo_Grove_(Unsplash).jpg License: https://creativecommons.org/publicdomain/zero/1.0/$cred$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Arashiyama Bamboo Grove'
  AND (
    image_url = $m$https://upload.wikimedia.org/wikipedia/commons/e/ef/Arashiyama_Bamboo_Grove_%28Unsplash%29.jpg$m$
  )
  AND image_credit IS DISTINCT FROM $cred$Erol Ahmed / Wikimedia Commons, CC0. Source: https://commons.wikimedia.org/wiki/File:Arashiyama_Bamboo_Grove_(Unsplash).jpg License: https://creativecommons.org/publicdomain/zero/1.0/$cred$
  AND (
    image_credit IS NULL
    OR btrim(image_credit) = ''
  )
;

UPDATE travel_pulse_hidden_gems
SET image_url = $url$https://upload.wikimedia.org/wikipedia/commons/1/1a/Japanese_tea_established_shop_by_yomi955_in_Kyoto.jpg$url$,
    image_credit = $cred$yomi955 / Wikimedia Commons, CC BY 2.0. Source: https://commons.wikimedia.org/wiki/File:Japanese_tea_established_shop_by_yomi955_in_Kyoto.jpg License: https://creativecommons.org/licenses/by/2.0/$cred$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Ippodo Tea Kaboku Tearoom'
  AND (
    image_url = $m$https://upload.wikimedia.org/wikipedia/commons/1/1a/Japanese_tea_established_shop_by_yomi955_in_Kyoto.jpg$m$
    OR
    image_url = $m$https://images.unsplash.com/photo-1569144157591-c60f3f82f137?auto=format&fit=crop&w=800&q=80$m$
  )
  AND (
    image_url IS DISTINCT FROM $url$https://upload.wikimedia.org/wikipedia/commons/1/1a/Japanese_tea_established_shop_by_yomi955_in_Kyoto.jpg$url$
    OR image_credit IS DISTINCT FROM $cred$yomi955 / Wikimedia Commons, CC BY 2.0. Source: https://commons.wikimedia.org/wiki/File:Japanese_tea_established_shop_by_yomi955_in_Kyoto.jpg License: https://creativecommons.org/licenses/by/2.0/$cred$
  )
;

UPDATE travel_pulse_hidden_gems
SET image_url = $url$https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/A_view_of_Nishiki_Market%2C_Kyoto%2C_Japan.jpg/960px-A_view_of_Nishiki_Market%2C_Kyoto%2C_Japan.jpg$url$,
    image_credit = $cred$Joli Rumi / Wikimedia Commons, CC BY-SA 4.0. Source: https://commons.wikimedia.org/wiki/File:A_view_of_Nishiki_Market,_Kyoto,_Japan.jpg License: https://creativecommons.org/licenses/by-sa/4.0/$cred$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Nishiki Market Side Alleys'
  AND (
    image_url = $m$https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/A_view_of_Nishiki_Market%2C_Kyoto%2C_Japan.jpg/960px-A_view_of_Nishiki_Market%2C_Kyoto%2C_Japan.jpg$m$
    OR
    image_url = $m$https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=800&q=80$m$
  )
  AND (
    image_url IS DISTINCT FROM $url$https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/A_view_of_Nishiki_Market%2C_Kyoto%2C_Japan.jpg/960px-A_view_of_Nishiki_Market%2C_Kyoto%2C_Japan.jpg$url$
    OR image_credit IS DISTINCT FROM $cred$Joli Rumi / Wikimedia Commons, CC BY-SA 4.0. Source: https://commons.wikimedia.org/wiki/File:A_view_of_Nishiki_Market,_Kyoto,_Japan.jpg License: https://creativecommons.org/licenses/by-sa/4.0/$cred$
  )
;

UPDATE travel_pulse_hidden_gems
SET image_url = $url$https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Kanga-an_Zuishizan_%28Kyoto_Kita-Ku%29_Temple_hdsr_S5_05.jpg/960px-Kanga-an_Zuishizan_%28Kyoto_Kita-Ku%29_Temple_hdsr_S5_05.jpg$url$,
    image_credit = $cred$Hyppolyte de Saint-Rambert / Wikimedia Commons, CC BY 4.0. Source: https://commons.wikimedia.org/wiki/File:Kanga-an_Zuishizan_(Kyoto_Kita-Ku)_Temple_hdsr_S5_05.jpg License: https://creativecommons.org/licenses/by/4.0/$cred$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Kanga-an Temple Shojin Ryori'
  AND (
    image_url = $m$https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Kanga-an_Zuishizan_%28Kyoto_Kita-Ku%29_Temple_hdsr_S5_05.jpg/960px-Kanga-an_Zuishizan_%28Kyoto_Kita-Ku%29_Temple_hdsr_S5_05.jpg$m$
    OR
    image_url = $m$https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=800&q=80$m$
  )
  AND (
    image_url IS DISTINCT FROM $url$https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Kanga-an_Zuishizan_%28Kyoto_Kita-Ku%29_Temple_hdsr_S5_05.jpg/960px-Kanga-an_Zuishizan_%28Kyoto_Kita-Ku%29_Temple_hdsr_S5_05.jpg$url$
    OR image_credit IS DISTINCT FROM $cred$Hyppolyte de Saint-Rambert / Wikimedia Commons, CC BY 4.0. Source: https://commons.wikimedia.org/wiki/File:Kanga-an_Zuishizan_(Kyoto_Kita-Ku)_Temple_hdsr_S5_05.jpg License: https://creativecommons.org/licenses/by/4.0/$cred$
  )
;

UPDATE travel_pulse_hidden_gems
SET image_credit = $cred$Carles Tomás Martí / Wikimedia Commons, CC BY 2.0. Source: https://commons.wikimedia.org/wiki/File:Kusho_Myōjin_shrine,_Ninna-ji_temple,_Kyoto_-_Oct_25,_2009.jpg License: https://creativecommons.org/licenses/by/2.0/$cred$
WHERE city ILIKE 'kyoto'
  AND place_name = 'Kusho Myōjin Shrine at Ninna-ji'
  AND (
    image_url = $m$https://upload.wikimedia.org/wikipedia/commons/1/15/Kusho_My%C5%8Djin_shrine%2C_Ninna-ji_temple%2C_Kyoto_-_Oct_25%2C_2009.jpg$m$
  )
  AND image_credit IS DISTINCT FROM $cred$Carles Tomás Martí / Wikimedia Commons, CC BY 2.0. Source: https://commons.wikimedia.org/wiki/File:Kusho_Myōjin_shrine,_Ninna-ji_temple,_Kyoto_-_Oct_25,_2009.jpg License: https://creativecommons.org/licenses/by/2.0/$cred$
  AND (
    image_credit IS NULL
    OR btrim(image_credit) = ''
  )
;
