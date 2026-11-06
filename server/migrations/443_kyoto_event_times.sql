-- 443_kyoto_event_times.sql
-- FU-R4-11 (ledger 2026-11-06-kyoto-event-times): the published opening and closing times of four of the seven Kyoto
-- events migration 439 seeded, from the sheet "Kyoto gem coordinates 2026-11-04", tab "factcheck" (the time text as the
-- source page shows it is quoted beside each statement). DATA ONLY. Times are Kyoto wall clock (Asia/Tokyo).
--   · A start is filled only while its time of day is not stated (start_time_known not true, local time 00:00), and
--     start_time_known becomes true in the same statement; an end only while its local time is 00:00.
--   · The DATE is never changed: each value is the row's own local date plus the published time.
--   · A blank open or close is not written (Kiyomizu-dera has no opening time, the Chion-in bell no closing time);
--     Kodai-ji, To-ji and Kaomise publish no times and are not touched.
--   · Idempotent: a second run matches nothing. Expected: 4 rows changed on first apply (6 statements), 0 on rerun.

-- Chion-in autumn light-up — https://www.chion-in.or.jp/event/event/1489/ — "午後5時30分～午後9時30分" (17:30–21:30)
UPDATE city_events
  SET starts_at = (((starts_at AT TIME ZONE 'Asia/Tokyo')::date + time '17:30') AT TIME ZONE 'Asia/Tokyo'), start_time_known = true
  WHERE source = 'manual' AND source_id = 'chionin-autumn-lightup-2026'
    AND start_time_known IS NOT TRUE AND (starts_at AT TIME ZONE 'Asia/Tokyo')::time = time '00:00';
UPDATE city_events
  SET ends_at = (((ends_at AT TIME ZONE 'Asia/Tokyo')::date + time '21:30') AT TIME ZONE 'Asia/Tokyo')
  WHERE source = 'manual' AND source_id = 'chionin-autumn-lightup-2026'
    AND ends_at IS NOT NULL AND (ends_at AT TIME ZONE 'Asia/Tokyo')::time = time '00:00';

-- Eikando autumn night — https://www.eikando.or.jp/haikan.html — "午後5時30分～午後8時30分" (17:30–20:30)
UPDATE city_events
  SET starts_at = (((starts_at AT TIME ZONE 'Asia/Tokyo')::date + time '17:30') AT TIME ZONE 'Asia/Tokyo'), start_time_known = true
  WHERE source = 'manual' AND source_id = 'eikando-autumn-night-2026'
    AND start_time_known IS NOT TRUE AND (starts_at AT TIME ZONE 'Asia/Tokyo')::time = time '00:00';
UPDATE city_events
  SET ends_at = (((ends_at AT TIME ZONE 'Asia/Tokyo')::date + time '20:30') AT TIME ZONE 'Asia/Tokyo')
  WHERE source = 'manual' AND source_id = 'eikando-autumn-night-2026'
    AND ends_at IS NOT NULL AND (ends_at AT TIME ZONE 'Asia/Tokyo')::time = time '00:00';

-- Kiyomizu-dera autumn night — https://www.kiyomizudera.or.jp/event/yakan.php — "21:30まで開門時間を延長" (close 21:30; no opening time)
UPDATE city_events
  SET ends_at = (((ends_at AT TIME ZONE 'Asia/Tokyo')::date + time '21:30') AT TIME ZONE 'Asia/Tokyo')
  WHERE source = 'manual' AND source_id = 'kiyomizudera-autumn-night-2026'
    AND ends_at IS NOT NULL AND (ends_at AT TIME ZONE 'Asia/Tokyo')::time = time '00:00';

-- Chion-in Joya no Kane — https://www.chion-in.or.jp/event/event/1510/ — "午後10時20分～" (open 22:20; no closing time)
UPDATE city_events
  SET starts_at = (((starts_at AT TIME ZONE 'Asia/Tokyo')::date + time '22:20') AT TIME ZONE 'Asia/Tokyo'), start_time_known = true
  WHERE source = 'manual' AND source_id = 'chionin-new-years-eve-bell-2026'
    AND start_time_known IS NOT TRUE AND (starts_at AT TIME ZONE 'Asia/Tokyo')::time = time '00:00';
