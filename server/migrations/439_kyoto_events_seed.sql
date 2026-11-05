-- 439_kyoto_events_seed.sql
-- Kyoto events seed (ledger 2026-11-05-kyoto-events-seed). DATA ONLY: one INSERT per event, keyed on the existing
-- UNIQUE (source, source_id) index `city_events_source_uniq`; ON CONFLICT DO NOTHING, so a rerun inserts nothing and a
-- row already stored is never changed. Source of truth: the sheet "Kyoto gem coordinates 2026-11-04", tab "factcheck" —
-- a row with a date line is confirmed and seeded; a blank row is held (not here).
-- Titles are ours. venue_locality = 'Kyoto' on every row: the venues are in the city, so placement is
-- inside Kyoto (LD 59 — venue_locality names the town only when it is not the market city). The ward links through
-- city_neighborhoods by slug where one matches exactly (Higashiyama); Minami (To-ji) and Sakyo (Eikando) have no Kyoto
-- neighbourhood row, so those rows carry none. Dates are the days the source states, at Kyoto midnight; no time of day
-- is claimed (start_time_known = false); nights is derived as the seeder derives it (deriveNights). Expected rowcount per statement: 1 on first apply, 0 on rerun. 7 rows.

-- Autumn evenings at Kodai-ji — 2026-10-23 to 2026-12-13 — source: https://www.kodaiji.com/
-- factcheck, date text as shown: 2026年の「秋の夜間特別拝観」は10月23日（金）〜12月13日（日）です。
INSERT INTO city_events (id, source, source_id, title, city, venue, venue_locality, neighbourhood_id, starts_at, ends_at, nights, start_time_known, ticket_url)
VALUES ('kyoto-ev-kodaiji-autumn-night-2026', 'manual', 'kodaiji-autumn-night-2026', 'Autumn evenings at Kodai-ji', 'Kyoto', 'Kodai-ji', 'Kyoto', (SELECT id FROM city_neighborhoods WHERE city ILIKE 'kyoto' AND slug = 'higashiyama' LIMIT 1),
        '2026-10-23T00:00:00+09:00', '2026-12-13T00:00:00+09:00', 52, false, 'https://www.kodaiji.com/')
ON CONFLICT (source, source_id) DO NOTHING;

-- To-ji halls open after dark — 2026-10-31 to 2026-12-13 — source: https://toji.or.jp/
-- factcheck, date text as shown: 2026年10月31日（土）〜12月13日（日）
INSERT INTO city_events (id, source, source_id, title, city, venue, venue_locality, neighbourhood_id, starts_at, ends_at, nights, start_time_known, ticket_url)
VALUES ('kyoto-ev-toji-autumn-night-2026', 'manual', 'toji-autumn-night-2026', 'To-ji halls open after dark', 'Kyoto', 'To-ji', 'Kyoto', NULL,
        '2026-10-31T00:00:00+09:00', '2026-12-13T00:00:00+09:00', 44, false, 'https://toji.or.jp/')
ON CONFLICT (source, source_id) DO NOTHING;

-- Chion-in lit for autumn — 2026-11-17 to 2026-12-06 — source: https://www.chion-in.or.jp/event/event/1489/
-- factcheck, date text as shown: 2026年11月17日(火) ～ 12月6日(日)
INSERT INTO city_events (id, source, source_id, title, city, venue, venue_locality, neighbourhood_id, starts_at, ends_at, nights, start_time_known, ticket_url)
VALUES ('kyoto-ev-chionin-autumn-lightup-2026', 'manual', 'chionin-autumn-lightup-2026', 'Chion-in lit for autumn', 'Kyoto', 'Chion-in', 'Kyoto', (SELECT id FROM city_neighborhoods WHERE city ILIKE 'kyoto' AND slug = 'higashiyama' LIMIT 1),
        '2026-11-17T00:00:00+09:00', '2026-12-06T00:00:00+09:00', 20, false, 'https://www.chion-in.or.jp/event/event/1489/')
ON CONFLICT (source, source_id) DO NOTHING;

-- Eikando open on autumn evenings — 2026-11-20 to 2026-12-06 — source: https://www.eikando.or.jp/haikan.html
-- factcheck, date text as shown: 令和8年11月20日(金) ～ 12月6日(日)
INSERT INTO city_events (id, source, source_id, title, city, venue, venue_locality, neighbourhood_id, starts_at, ends_at, nights, start_time_known, ticket_url)
VALUES ('kyoto-ev-eikando-autumn-night-2026', 'manual', 'eikando-autumn-night-2026', 'Eikando open on autumn evenings', 'Kyoto', 'Eikando (Zenrin-ji)', 'Kyoto', NULL,
        '2026-11-20T00:00:00+09:00', '2026-12-06T00:00:00+09:00', 17, false, 'https://www.eikando.or.jp/haikan.html')
ON CONFLICT (source, source_id) DO NOTHING;

-- Kiyomizu-dera open late in autumn — 2026-11-21 to 2026-11-30 — source: https://www.kiyomizudera.or.jp/event/yakan.php
-- factcheck, date text as shown: 開催日程 : 2026年 / 11月21日〜11月30日
INSERT INTO city_events (id, source, source_id, title, city, venue, venue_locality, neighbourhood_id, starts_at, ends_at, nights, start_time_known, ticket_url)
VALUES ('kyoto-ev-kiyomizudera-autumn-night-2026', 'manual', 'kiyomizudera-autumn-night-2026', 'Kiyomizu-dera open late in autumn', 'Kyoto', 'Kiyomizu-dera', 'Kyoto', (SELECT id FROM city_neighborhoods WHERE city ILIKE 'kyoto' AND slug = 'higashiyama' LIMIT 1),
        '2026-11-21T00:00:00+09:00', '2026-11-30T00:00:00+09:00', 10, false, 'https://www.kiyomizudera.or.jp/event/yakan.php')
ON CONFLICT (source, source_id) DO NOTHING;

-- Kaomise kabuki at Minamiza — 2026-12-01 to 2026-12-24 — source: https://www.shochiku.co.jp/play/schedules/detail/kaomise2026/
-- factcheck, date text as shown: 2026年12月1日（火）～24日（木）
INSERT INTO city_events (id, source, source_id, title, city, venue, venue_locality, neighbourhood_id, starts_at, ends_at, nights, start_time_known, ticket_url)
VALUES ('kyoto-ev-minamiza-kaomise-2026', 'manual', 'minamiza-kaomise-2026', 'Kaomise kabuki at Minamiza', 'Kyoto', 'Minamiza', 'Kyoto', (SELECT id FROM city_neighborhoods WHERE city ILIKE 'kyoto' AND slug = 'higashiyama' LIMIT 1),
        '2026-12-01T00:00:00+09:00', '2026-12-24T00:00:00+09:00', 24, false, 'https://www.shochiku.co.jp/play/schedules/detail/kaomise2026/')
ON CONFLICT (source, source_id) DO NOTHING;

-- New Year's Eve bell at Chion-in — 2026-12-31 to 2026-12-31 — source: https://www.chion-in.or.jp/event/event/1510/
-- factcheck, date text as shown: 2026年12月31日(木)
INSERT INTO city_events (id, source, source_id, title, city, venue, venue_locality, neighbourhood_id, starts_at, ends_at, nights, start_time_known, ticket_url)
VALUES ('kyoto-ev-chionin-new-years-eve-bell-2026', 'manual', 'chionin-new-years-eve-bell-2026', 'New Year''s Eve bell at Chion-in', 'Kyoto', 'Chion-in', 'Kyoto', (SELECT id FROM city_neighborhoods WHERE city ILIKE 'kyoto' AND slug = 'higashiyama' LIMIT 1),
        '2026-12-31T00:00:00+09:00', '2026-12-31T00:00:00+09:00', 1, false, 'https://www.chion-in.or.jp/event/event/1510/')
ON CONFLICT (source, source_id) DO NOTHING;

