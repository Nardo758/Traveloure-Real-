-- 369 — TC-3 ride seed: Sagano Romantic Train, Hozugawa river boat, Eizan Railway "Kirara"
-- (ledger `2026-10-11-tc3-ride-seed`; brief docs/planning/briefs/tc-3a-ride-item.md "Migration 369").
-- HELD: merges only with "Migration 369 SQL approved — Leon" on its PR. Runs after 368 (which creates
-- service_transport_facts).
--
-- SOURCE OF EVERY VALUE: docs/planning/briefs/tc-3-reads/nine-site-read-2026-10-10-v2.md (§1–3 + the decision-maker's addendum) (the
-- official reads, fetched 2026-10-10 19:46–19:53 ET; Sagano's per-seat fare and operating calendar
-- rendered in a real browser ~20:10 ET). A field is set ONLY from a row in that file, and every set field
-- names its row in `fact_sources` (field → {url, quote}). Anything the read marks NOT ON SITE stays NULL.
-- Values are our own structured English; the operators' text and images are never stored (Eizan's terms
-- forbid adapting its content) — only the short verbatim quote and the link, as evidence.
--
-- Decision-maker rulings (Oct 11, 2026), applied here:
--   1. Coordinates come only from OpenStreetMap node ids read by Chrome (openstreetmap.org, 2026-10-10) and
--      are seeded with the row — never a boot-time resolve. Each route point carries its node id
--      (`service_route_points.osm_node_id`, added here) and "© OpenStreetMap contributors" applies
--      (`osm_attribution = true`). The rides seed located and ACTIVE.
--   2. This migration adds `fact_sources` and `notes` (jsonb, nullable, no DEFAULT) — schema + data.
--   3. Refresh interval: none on the ride row (the three operators join /admin/content-sources by hand).
--   4. booking_mode='hidden', approved; never in /services browse or the cart (server/services/ride-listings.ts).
--
-- Deterministic and idempotent: fixed ids, ON CONFLICT DO NOTHING everywhere; a second run inserts nothing.
-- No CHECK, no index, no FK on an existing table; declared in shared/schema.ts (deploy-push durability).

-- ── 1. Schema ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE service_transport_facts ADD COLUMN IF NOT EXISTS fact_sources JSONB;
ALTER TABLE service_transport_facts ADD COLUMN IF NOT EXISTS notes JSONB;
-- The OSM node a route point's coordinates were read from (nullable; NULL = not from an OSM node).
ALTER TABLE service_route_points ADD COLUMN IF NOT EXISTS osm_node_id BIGINT;

-- ── 2. The operator account: "Traveloure Transport" ──────────────────────────────────────────────
-- A reserved owner for catalog rides the platform lists on an operator's behalf (the migration-313
-- shape): fixed uuid-shaped id, NULL password (never a login), an internal non-delivering email, NO
-- handle (so there is no storefront), no provider form. It sells nothing: every ride it owns is
-- booking_mode='hidden' and the operator's own site takes the booking.
INSERT INTO users (id, email, password, first_name, last_name, role, created_at, updated_at)
VALUES ('00000000-0000-4000-a000-00007472616e', 'transport@traveloure.internal', NULL,
        'Traveloure Transport', NULL, 'service_provider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── 3. The rides (one catalog row per direction: first route point = boarding, last = exit) ──────
-- price is NULL on purpose: provider_services carries no currency, and a yen fare in that column would
-- be read as dollars. Fares live in notes.fare with currency 'JPY'.
INSERT INTO provider_services (
  id, user_id, service_name, short_description, description, delivery_method, city, location,
  service_timezone, duration_minutes, cancellation_policy, status, approval_status, booking_mode,
  show_price, created_via, source_ref, created_at, updated_at
) VALUES
  ('00000000-0000-4000-c369-000000000001', '00000000-0000-4000-a000-00007472616e',
   'Sagano Romantic Train — Saga to Kameoka', 'Scenic trolley train along the Hozu gorge, downstream to Kameoka.',
   'Scenic trolley train along the Hozu gorge, Torokko Saga to Torokko Kameoka.', 'in_person', 'Kyoto', 'Kyoto',
   'Asia/Tokyo', 25, 'Free cancellation until 23:59 JST the day before travel; no refund on the travel day.',
   'active', 'approved', 'hidden', false, 'migration', '369_tc3_ride_seed.sql', NOW(), NOW()),
  ('00000000-0000-4000-c369-000000000002', '00000000-0000-4000-a000-00007472616e',
   'Sagano Romantic Train — Kameoka to Saga', 'Scenic trolley train along the Hozu gorge, upstream to Saga.',
   'Scenic trolley train along the Hozu gorge, Torokko Kameoka to Torokko Saga.', 'in_person', 'Kyoto', 'Kyoto',
   'Asia/Tokyo', 25, 'Free cancellation until 23:59 JST the day before travel; no refund on the travel day.',
   'active', 'approved', 'hidden', false, 'migration', '369_tc3_ride_seed.sql', NOW(), NOW()),
  ('00000000-0000-4000-c369-000000000003', '00000000-0000-4000-a000-00007472616e',
   'Hozugawa river boat — Kameoka to Arashiyama', 'Hand-poled boat down the Hozu river, about 16 km.',
   'Hand-poled boat down the Hozu river from Kameoka to Arashiyama, about 16 km.', 'in_person', 'Kyoto', 'Kyoto',
   'Asia/Tokyo', 100, 'Cancel or change on the booking site you used; when the operator cancels, online bookings are refunded in full automatically.',
   'active', 'approved', 'hidden', false, 'migration', '369_tc3_ride_seed.sql', NOW(), NOW()),
  ('00000000-0000-4000-c369-000000000004', '00000000-0000-4000-a000-00007472616e',
   'Eizan Railway "Kirara" — Demachiyanagi to Kurama', 'Panorama train on the Kurama Line; no reservation, regular fare.',
   'Panorama train "Kirara" on the Eizan Kurama Line, Demachiyanagi to Kurama.', 'in_person', 'Kyoto', 'Kyoto',
   'Asia/Tokyo', 31, NULL,
   'active', 'approved', 'hidden', false, 'migration', '369_tc3_ride_seed.sql', NOW(), NOW()),
  ('00000000-0000-4000-c369-000000000005', '00000000-0000-4000-a000-00007472616e',
   'Eizan Railway "Kirara" — Kurama to Demachiyanagi', 'Panorama train on the Kurama Line; no reservation, regular fare.',
   'Panorama train "Kirara" on the Eizan Kurama Line, Kurama to Demachiyanagi.', 'in_person', 'Kyoto', 'Kyoto',
   'Asia/Tokyo', 31, NULL,
   'active', 'approved', 'hidden', false, 'migration', '369_tc3_ride_seed.sql', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── 4. Route points — located from OpenStreetMap nodes (read 2026-10-10; © OpenStreetMap contributors) ─
-- Torokko-Kameoka is a railway=stop node (OSM has no station node); Demachiyanagi is the Eizan node
-- (operator 叡山電鉄), not the Keihan one; the Hozugawa points are the 乗船場 (boarding) and 下船場 (landing)
-- nodes, the landing about 570 m upstream of Togetsukyo.
INSERT INTO service_route_points (id, service_id, position, name, latitude, longitude, osm_node_id) VALUES
  ('00000000-0000-4000-d369-000000000011', '00000000-0000-4000-c369-000000000001', 1, 'Torokko Saga Station', 35.0185888, 135.6807067, 12997335828),
  ('00000000-0000-4000-d369-000000000012', '00000000-0000-4000-c369-000000000001', 2, 'Torokko Kameoka Station', 35.0131065, 135.6068310, 538973298),
  ('00000000-0000-4000-d369-000000000021', '00000000-0000-4000-c369-000000000002', 1, 'Torokko Kameoka Station', 35.0131065, 135.6068310, 538973298),
  ('00000000-0000-4000-d369-000000000022', '00000000-0000-4000-c369-000000000002', 2, 'Torokko Saga Station', 35.0185888, 135.6807067, 12997335828),
  ('00000000-0000-4000-d369-000000000031', '00000000-0000-4000-c369-000000000003', 1, 'Hozugawa boat boarding (Kameoka)', 35.0175747, 135.5873099, 4174041189),
  ('00000000-0000-4000-d369-000000000032', '00000000-0000-4000-c369-000000000003', 2, 'Arashiyama landing', 35.0135421, 135.6714667, 4539039690),
  ('00000000-0000-4000-d369-000000000041', '00000000-0000-4000-c369-000000000004', 1, 'Demachiyanagi Station (Eizan)', 35.0304955, 135.7732355, 335671845),
  ('00000000-0000-4000-d369-000000000042', '00000000-0000-4000-c369-000000000004', 2, 'Kurama Station', 35.1128960, 135.7722690, 7886699754),
  ('00000000-0000-4000-d369-000000000051', '00000000-0000-4000-c369-000000000005', 1, 'Kurama Station', 35.1128960, 135.7722690, 7886699754),
  ('00000000-0000-4000-d369-000000000052', '00000000-0000-4000-c369-000000000005', 2, 'Demachiyanagi Station (Eizan)', 35.0304955, 135.7732355, 335671845)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Transport facts ───────────────────────────────────────────────────────────────────────────
-- Sagano (both directions share one set of facts; the down/up difference is the departures and stops).
INSERT INTO service_transport_facts (
  id, service_id, weather_rule, weather_fallback_mode, luggage_rule, pass_validity, payment_constraints,
  official_link, official_source, verified_at, booking_window_days, osm_attribution, fact_sources, notes
)
SELECT v.fid, v.sid,
  NULL, NULL,
  'Bags up to about 120 cm (sum of three sides) ride free; nothing longer than 1 m. No bicycles; strollers folded; pets in a carrier for a ¥260 hand-luggage fee.',
  'JR Pass and Seishun 18 tickets are not valid.',
  'Online: Visa, Mastercard, American Express, JCB or Diners cards with 3-D Secure (debit cards accepted). Station window: cash, cards, or transit IC cards (not PiTaPa). One-way tickets only; the QR e-ticket on a phone is the ticket — printed vouchers are not valid.',
  'https://www.sagano-kanko.co.jp/ticket/',
  'https://www.sagano-kanko.co.jp/',
  TIMESTAMP '2026-10-11 00:10:00', NULL, TRUE,
  $fs${
    "service_name": {"url": "https://www.sagano-kanko.co.jp/train-info/", "quote": "始発駅：嵯峨　終着駅：亀岡"},
    "duration_minutes": {"url": "https://www.sagano-kanko.co.jp/about/", "quote": "片道約7kmおよそ25分の間、"},
    "cancellation_policy": {"url": "https://www.sagano-kanko.co.jp/faq/", "quote": "乗車日前日の23時59分まで無手数料でキャンセル可能です（ただし乗車日の当日払い戻しは不可）。"},
    "luggage_rule": {"url": "https://www.sagano-kanko.co.jp/faq/", "quote": "3辺の合計が120cm程度までのものは無料で車内にお持ち込み可能です。 なお、長さが1mを超えるお荷物は車内にお持ち込みいただけませんので、あらかじめご了承ください。", "also": {"url": "https://www.sagano-kanko.co.jp/seat/", "quote": "※別途「有料手回り品」料金２６０円を申し受けます。"}},
    "pass_validity": {"url": "https://www.sagano-kanko.co.jp/faq/", "quote": "また、JR PASS、青春18きっぷもご利用いただけません。"},
    "payment_constraints": {"url": "https://www.sagano-kanko.co.jp/faq/", "quote": "3Dセキュア登録のないカードはご利用いただけません。", "also": {"url": "https://www.sagano-kanko.co.jp/faq/", "quote": "バウチャーではご乗車できません。スマートフォンでEチケットのQRコードを改札口で呈示して有効となります。"}},
    "official_link": {"url": "https://www.sagano-kanko.co.jp/ticket/", "quote": "2. 乗車人数を入力してください。合計8人までの予約が可能です。"},
    "route_point.saga": {"url": "https://www.openstreetmap.org/node/12997335828", "quote": "node 12997335828 — 35.0185888, 135.6807067", "attribution": "© OpenStreetMap contributors"},
    "route_point.kameoka": {"url": "https://www.openstreetmap.org/node/538973298", "quote": "node 538973298 (railway=stop) — 35.0131065, 135.6068310", "attribution": "© OpenStreetMap contributors"},
    "osm_attribution": {"url": "https://www.openstreetmap.org/copyright", "quote": "© OpenStreetMap contributors"},
    "route_points": {"url": "https://www.sagano-kanko.co.jp/train-info/", "quote": "亀岡方面ゆき【下り】 / 始発駅：嵯峨　終着駅：亀岡 … 嵯峨方面ゆき【上り】 / 始発駅：亀岡　終着駅：嵯峨"},
    "slots": {"url": "https://www.sagano-kanko.co.jp/cms/wp-content/uploads/2026/03/2026年列車運転時刻表日-4.pdf", "quote": "トロッコ嵯峨 (発) 9:02 10:02 11:02 12:02 13:02 14:02 15:02 16:02", "also": {"url": "https://www.sagano-kanko.co.jp/cms/wp-content/uploads/2026/03/2026年運転計画カレンダー4月11日臨時列車追加日本語-1.pdf", "quote": "・・・通常ダイヤ運行日 ・・・全便運休日(1/1～2/28,12/30～12/31は冬期運休日)"}},
    "notes.fare": {"url": "https://www.sagano-kanko.co.jp/ticket/", "quote": "こちらは片道の普通運賃になります。 ※乗車区間にかかわらず均一 一般 | 880円 | 440円"},
    "notes.onlineMaxPerBooking": {"url": "https://www.sagano-kanko.co.jp/faq/", "quote": "1回のご購入につき、最大8枚までです。"},
    "notes.infantRule": {"url": "https://www.sagano-kanko.co.jp/ticket/", "quote": "※幼児は乗車券保有者1名につき1名無料（幼児が席を利用する場合は小児料金）"},
    "notes.bookingWindow": {"url": "https://www.sagano-kanko.co.jp/faq/", "quote": "乗車日の1か月前の午前0時(日本時間)から購入可能です。"},
    "notes.sameDayTickets": {"url": "https://www.sagano-kanko.co.jp/faq/", "quote": "当日券は、トロッコ列車各駅窓口にてご購入いただけます。(トロッコ保津峡駅を除く)"},
    "notes.alsoBoardAt": {"url": "https://www.sagano-kanko.co.jp/faq/", "quote": "1-6 「トロッコ嵯峨駅 → トロッコ亀岡駅」のチケットで、トロッコ嵐山駅から乗車できますか？ はい、ご乗車いただけます。"},
    "notes.trainCancelledRefund": {"url": "https://www.sagano-kanko.co.jp/faq/", "quote": "5-20 予約した列車が運休になった場合、どのように返金されますか 登録した決済カードへ自動的に返金となります。"},
    "notes.calendarCaveat": {"url": "https://www.sagano-kanko.co.jp/cms/wp-content/uploads/2026/03/2026年運転計画カレンダー4月11日臨時列車追加日本語-1.pdf", "quote": "※運休日及び臨時列車の運転日は、お客様の動向を踏まえて今後追加、変更する場合があります。"},
    "notes.extraTrains": {"url": "https://www.sagano-kanko.co.jp/cms/wp-content/uploads/2026/03/2026年運転計画カレンダー4月11日臨時列車追加日本語-1.pdf", "quote": "・・・臨時列車運転日(嵯峨野81号及び82号) / ・・・臨々列車運転日(嵯峨野91号及び92号)", "also": {"url": "https://www.sagano-kanko.co.jp/cms/wp-content/uploads/2026/03/2026年列車運転時刻表日-4.pdf", "quote": "〇臨時列車(運転日注意) トロッコ嵯峨 (発) 17:10 18:26 ; トロッコ亀岡 (発) 17:43 18:59"}}
  }$fs$::jsonb,
  $nt${
    "fare": {"currency": "JPY", "adult": 880, "child": 440, "basis": "one-way regular fare, the same for any section", "renderedAt": "2026-10-10T20:10-04:00"},
    "onlineMaxPerBooking": 8,
    "infantRule": "One infant (under school age) per ticket holder rides free on a lap; a child fare applies if the infant takes a seat.",
    "bookingWindow": "Advance tickets go on sale at 00:00 JST one calendar month before the travel date.",
    "sameDayTickets": "Same-day tickets at every station window except Torokko Hozukyo, even when online sales are full.",
    "alsoBoardAt": "A Saga→Kameoka ticket can also board at Torokko Arashiyama.",
    "trainCancelledRefund": "If a booked train is cancelled, the payment card is refunded automatically.",
    "calendarCaveat": "The operator may add or change suspension days and extra-train days; check before travel.",
    "extraTrains": {
      "departures": {"down": ["17:10", "18:26"], "up": ["17:43", "18:59"]},
      "trainNumberToTime": null,
      "trainNumberToTimeReason": "The read does not say which extra departure is 81/82 and which is 91/92, so no extra-train slots are seeded.",
      "81/82": ["2026-10-11", "2026-10-12", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-26", "2026-12-27"],
      "91/92": ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-05", "2026-12-06"],
      "unconfirmed": ["2026-10-17", "2026-11-07", "2026-12-12", "2026-12-13", "2026-12-19", "2026-12-20"],
      "unconfirmedNote": "Extra-train status unconfirmed (two readings disagree); the regular trains run on these days regardless."
    }
  }$nt$::jsonb
FROM (VALUES
  ('00000000-0000-4000-e369-000000000001', '00000000-0000-4000-c369-000000000001'),
  ('00000000-0000-4000-e369-000000000002', '00000000-0000-4000-c369-000000000002')
) AS v(fid, sid)
ON CONFLICT (id) DO NOTHING;

-- The up-direction row's route_points quote names its own start/end (same sentence; the read gives both).

-- Hozugawa
INSERT INTO service_transport_facts (
  id, service_id, weather_rule, weather_fallback_mode, luggage_rule, pass_validity, payment_constraints,
  official_link, official_source, verified_at, booking_window_days, osm_attribution, fact_sources, notes
) VALUES (
  '00000000-0000-4000-e369-000000000003', '00000000-0000-4000-c369-000000000003',
  'Runs in rain under an awning; cancelled for storms or high water, and may be cancelled for strong wind even in fine weather. Decided on the day. Online bookings are refunded in full automatically.',
  'routed',
  NULL,
  NULL,
  'At the window: credit cards (Visa, Mastercard, JCB, American Express, Diners Club, UnionPay — shown as logos). Online through LINKTIVITY, KKday or Tiqets; cancel or change on the site you booked.',
  'https://www.hozugawakudari.jp/tickets/reservation',
  'https://www.hozugawakudari.jp/',
  TIMESTAMP '2026-10-10 23:53:00', NULL, TRUE,
  $fs${
    "service_name": {"url": "https://www.hozugawakudari.jp/", "quote": "丹波の国「亀岡」から京の名勝「嵐山」までの約16キロの旅。"},
    "duration_minutes": {"url": "https://www.hozugawakudari.jp/faq", "quote": "川の水位によって前後しますが、所要時間は約100分です。"},
    "cancellation_policy": {"url": "https://www.hozugawakudari.jp/tickets/for_individual", "quote": "※キャンセルや変更については、購入された予約サイトで行ってください。", "also": {"url": "https://www.hozugawakudari.jp/faq", "quote": "オンライン予約は自動的に全額返金となりますので、お客様ご自身でのお手続きは不要です。"}},
    "weather_rule": {"url": "https://www.hozugawakudari.jp/tickets", "quote": "雨天の時は、船にテントを張り、通常通り運航します。 暴風雨および増水の場合は、運航を中止します。", "also": {"url": "https://www.hozugawakudari.jp/faq", "quote": "また、晴天時であっても強風などの理由により、運航を中止する場合がございます。 運航可否の判断は、基本的に当日の状況を確認したうえで決定いたします。"}},
    "weather_fallback_mode": {"url": "https://www.hozugawakudari.jp/faq", "quote": "着船場～ＪＲ嵯峨嵐山駅までどのくらいですか？ 徒歩で15分から20分程です。", "ruling": "decision-maker, Oct 10 2026: when the boat is cancelled the traveler is routed (JR Sagano line)"},
    "payment_constraints": {"url": "https://www.hozugawakudari.jp/faq", "quote": "カード支払は可能ですか？ 下記のクレジットカードがご利用頂けます。", "also": {"url": "https://www.hozugawakudari.jp/tickets/reservation", "quote": "予約中のエラーや支払い、ネット予約のお手続きに関するお問合せは、 恐れ入りますが直接ブッキングサイト（LINKTIVITY）へご連絡をお願いいたします。"}},
    "official_link": {"url": "https://www.hozugawakudari.jp/tickets/reservation", "quote": "10名様以上はお電話でのご予約、10名様未満のお客様はオンラインでのご予約となります。"},
    "route_point.boarding": {"url": "https://www.openstreetmap.org/node/4174041189", "quote": "乗船場 node 4174041189 — 35.0175747, 135.5873099", "attribution": "© OpenStreetMap contributors"},
    "route_point.landing": {"url": "https://www.openstreetmap.org/node/4539039690", "quote": "下船場 node 4539039690 — 35.0135421, 135.6714667", "attribution": "© OpenStreetMap contributors"},
    "osm_attribution": {"url": "https://www.openstreetmap.org/copyright", "quote": "© OpenStreetMap contributors"},
    "route_points": {"url": "https://www.hozugawakudari.jp/", "quote": "丹波の国「亀岡」から京の名勝「嵐山」までの約16キロの旅。"},
    "slots": {"url": "https://www.hozugawakudari.jp/service/timetable", "quote": "◆2026/3/10（火）　～　2026/12/13 （日） 営業時間　９：００〜１５：００まで 平日（定期運航） ９：００／１０：００ ／１１：００／１２：００／１３：００ ／１４：００／１５：００ 土・日・祝日（随時運航） ※土・日・祝は定員がお集まり次第出船します。", "also": {"url": "https://www.hozugawakudari.jp/service/timetable", "quote": "運休日 年末年始 12/29～1/4 安全点検日 2026　/2/1（日）・2/4（水）・9/2（水）"}},
    "notes.fare": {"url": "https://www.hozugawakudari.jp/tickets", "quote": "大人 / 1名 6,000円 子供 / 1名（幼児～小学生） 4,500円", "also": {"url": "https://www.hozugawakudari.jp/tickets", "quote": "料金・時刻表ページの表示価格は全て税込みです。"}},
    "notes.duration": {"url": "https://www.hozugawakudari.jp/faq", "quote": "多水位時は60分程度〜、少水位時は110分ほどかかります。", "also": {"url": "https://www.hozugawakudari.jp/tickets", "quote": "所要時間は約2時間（水量により多少の早遅があります）"}},
    "notes.childMinHeightCm": {"url": "https://www.hozugawakudari.jp/faq", "quote": "ご年齢に関わらず、身長 80cm未満の方はご乗船いただけません。", "also": {"url": "https://www.hozugawakudari.jp/faq", "quote": "80cm以下の方は抱っこでのご乗船もできませんので、あらかじめご了承ください。"}},
    "notes.sharedBoatCapacity": {"url": "https://www.hozugawakudari.jp/tickets", "quote": "定期乗合船 定員 / 24名 ; 定員は、水量により変更する場合がございます。"},
    "notes.sharedBoatCapacityVaries": {"url": "https://www.hozugawakudari.jp/tickets", "quote": "定員は、水量により変更する場合がございます。"},
    "notes.childOnLap": {"url": "https://www.hozugawakudari.jp/faq", "quote": "80cm以下の方は抱っこでのご乗船もできませんので、あらかじめご了承ください。"},
    "notes.lifeJacket": {"url": "https://www.hozugawakudari.jp/faq", "quote": "着用に同意されないお客様および着用できない方につきましては乗船をお断りしております。"},
    "notes.lastCheckIn": {"url": "https://www.hozugawakudari.jp/tickets/reservation", "quote": "※最終便（15時出船）の乗船受付は、15時までにお済ませください。（12月第2月曜日から3月9日までは最終船14時30分）"},
    "notes.winterTimes2026": {"url": "https://www.hozugawakudari.jp/service/timetable", "quote": "2026/1/5 （月） ～ 2026/3/9 （月） 営業時間　１０：００〜１４：３０まで 定期運航 １０：００ ／１１：３０ ／１３：００ ／１４：３０"},
    "notes.closedDays": {"url": "https://www.hozugawakudari.jp/service/timetable", "quote": "運休日 年末年始 12/29～1/4 安全点検日 2026　/2/1（日）・2/4（水）・9/2（水）"},
    "notes.onlineBookingCloses": {"url": "https://www.hozugawakudari.jp/tickets/reservation", "quote": "※オンライン予約は前日までの締切です。当日の場合は当日券でお越しください。"},
    "notes.landingToStation": {"url": "https://www.hozugawakudari.jp/faq", "quote": "着船場～ＪＲ嵯峨嵐山駅までどのくらいですか？ 徒歩で15分から20分程です。"},
    "notes.pairing": {"url": "https://www.hozugawakudari.jp/tickets/reservation", "quote": "※トロッコ列車と接続される方は、トロッコに乗られた約1時間後のお時間でご予約下さい。"},
    "notes.weekendDepartures": {"url": "https://www.hozugawakudari.jp/service/timetable", "quote": "土・日・祝日（随時運航） ※土・日・祝は定員がお集まり次第出船します。"}
  }$fs$::jsonb,
  $nt${
    "fare": {"currency": "JPY", "adult": 6000, "child": 4500, "childBand": "infant to elementary school", "taxIncluded": true},
    "duration": {"typicalMinutes": 100, "rangeMinutes": [60, 110], "byWaterLevel": "about 60 min at high water, about 110 min at low water", "conflict": "The site's own figures disagree: the FAQ says about 100 min (60–110), the tickets page says about 2 hours. The FAQ range is stored."},
    "childMinHeightCm": 80,
    "childOnLap": false,
    "sharedBoatCapacity": 24,
    "sharedBoatCapacityVaries": "The capacity may change with the water level.",
    "lifeJacket": "Required; anyone who will not or cannot wear one is refused.",
    "lastCheckIn": {"regular": "15:00", "winter": "14:30", "winterPeriod": "second Monday of December to March 9"},
    "winterTimes2026": {"period": ["2026-01-05", "2026-03-09"], "departures": ["10:00", "11:30", "13:00", "14:30"]},
    "closedDays": {"newYear": "Dec 29 – Jan 4", "inspection2026": ["2026-02-01", "2026-02-04", "2026-09-02"]},
    "onlineBookingCloses": "the day before travel; same-day riders buy on site",
    "landingToStation": {"station": "JR Saga-Arashiyama", "walkMinutes": [15, 20]},
    "pairing": {"withServiceIds": ["00000000-0000-4000-c369-000000000001"], "bookMinutesAfterTrain": 60, "note": "Coming from the Sagano train, book a boat about an hour after the train."},
    "weekendDepartures": "Weekends and holidays: boats leave whenever they fill (no fixed times)."
  }$nt$::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Eizan "Kirara" (both directions share one set of facts)
INSERT INTO service_transport_facts (
  id, service_id, weather_rule, weather_fallback_mode, luggage_rule, pass_validity, payment_constraints,
  official_link, official_source, verified_at, booking_window_days, osm_attribution, fact_sources, notes
)
SELECT v.fid, v.sid,
  NULL, NULL,
  'Two items ride free, each up to 250 cm total dimensions (2 m long) and 30 kg.',
  'JR Pass is not valid. The Eizan 1-day ticket covers the whole line.',
  'No credit cards or cashless payment for tickets. Transit IC cards accepted (PiTaPa, ICOCA, Suica and other national cards). Ticket machines at Demachiyanagi (all day) and Kurama (9:30–16:20); elsewhere take a boarding certificate and pay on getting off.',
  NULL,
  'https://eizandensha.co.jp/',
  TIMESTAMP '2026-10-10 23:53:00', NULL, TRUE,
  $fs${
    "service_name": {"url": "https://eizandensha.co.jp/en/", "quote": "For the Kurama Line to Kibuneguchi and Kurama stations, we have a special scenic train called “KIRARA”."},
    "duration_minutes": {"url": "https://eizandensha.co.jp/guide/station/demachiyanagi.html", "quote": "鞍馬 | 31分 ; ※昼間時間帯の標準的な所要時分ですので、列車により多少異なる場合があります。"},
    "luggage_rule": {"url": "https://eizandensha.co.jp/guide/tickets/temawari.html", "quote": "縦・横・高さの合計が250cm以内（長さは2m以内）で重量が30kg以内のもの2個まで"},
    "pass_validity": {"url": "https://eizandensha.co.jp/en/", "quote": "JAPAN RAIL PASS cannot be used for Eizan Railway.", "also": {"url": "https://eizandensha.co.jp/good-value/", "quote": "【叡山電車】全線乗り降り自由"}},
    "payment_constraints": {"url": "https://eizandensha.co.jp/guide/faq/", "quote": "申し訳ございませんが、クレジットカードやキャッシュレス決済はご利用いただけません。", "also": {"url": "https://eizandensha.co.jp/guide/tickets/ic_card.html", "quote": "叡山電車では交通系ICカードの全国相互利用サービスに対応しておりPiTaPaの他、ICOCA、Kitaca、Suica、PASUMO、TOICA、manaca、SUGOCA、はやかけん、nimocaの各カードがご利用になれます。"}},
    "route_point.demachiyanagi": {"url": "https://www.openstreetmap.org/node/335671845", "quote": "node 335671845 (operator 叡山電鉄) — 35.0304955, 135.7732355", "attribution": "© OpenStreetMap contributors"},
    "route_point.kurama": {"url": "https://www.openstreetmap.org/node/7886699754", "quote": "node 7886699754 — 35.1128960, 135.7722690", "attribution": "© OpenStreetMap contributors"},
    "osm_attribution": {"url": "https://www.openstreetmap.org/copyright", "quote": "© OpenStreetMap contributors"},
    "route_points": {"url": "https://eizandensha.co.jp/guide/station/demachiyanagi.html", "quote": "鞍馬 | 31分"},
    "notes.fare": {"url": "https://eizandensha.co.jp/en/", "quote": "Demachiyanagi Sta. → Kibuneguchi Sta., Kurama Sta. （Adult: 470 yen  Child: 240 yen）", "also": {"url": "https://eizandensha.co.jp/wp-content/uploads/2023/04/01-fare_2023.04.01-b.pdf", "quote": "5 区 間 470 240"}},
    "notes.noReservation": {"url": "https://eizandensha.co.jp/guide/faq/", "quote": "予約は必要ありません。 ; 別料金は必要ありません。普通運賃のみでご乗車いただけます。"},
    "notes.noBookingLink": {"url": "https://eizandensha.co.jp/guide/faq/", "quote": "予約は必要ありません。"},
    "notes.timetables": {"url": "https://eizandensha.co.jp/uploads/499_file_path1.pdf", "quote": "展望列車「きらら」時刻表 Panorama Train “KIRARA” Timetable 2026年8月22日変更 ; 備考欄に◆印がついてる列車は、水曜日と木曜日の運行はございません。"},
    "notes.timetableCaveat": {"url": "https://eizandensha.co.jp/uploads/499_file_path1.pdf", "quote": "車両点検等の都合により予告なく運転時刻を変更する場合があります。"},
    "notes.fireFestival": {"url": "https://eizandensha.co.jp/guide/", "quote": "2026年10月22日（木）は「鞍馬の火祭」が行われるため、「火祭ダイヤ」で運行いたします。 ; 最終列車は23:24発"},
    "notes.childFare": {"url": "https://eizandensha.co.jp/guide/tickets/", "quote": "幼児は、「おとな」または「こども」のお客さま1人につき、2人まで無料です。3人目からこども運賃をいただきます。"}
  }$fs$::jsonb,
  $nt${
    "fare": {"currency": "JPY", "adult": 470, "child": 240, "basis": "regular fare Demachiyanagi–Kurama (revised 2023-04-01)"},
    "noReservation": true,
    "noBookingLink": true,
    "timetables": {
      "weekday": "https://eizandensha.co.jp/uploads/499_file_path1.pdf",
      "weekendHoliday": "https://eizandensha.co.jp/uploads/499_file_path2.pdf",
      "revised": "2026-08-22",
      "diamondTrains": "Trains marked ◆ do not run on Wednesdays or Thursdays.",
      "slotsNotSeededReason": "Which weekday trains carry ◆ is printed only in the PDF's remarks column, and which dates are holidays (weekend timetable) is not in the read, so no departures are seeded."
    },
    "timetableCaveat": "Times may change without notice for vehicle inspections.",
    "fireFestival": {"date": "2026-10-22", "timetable": "special fire-festival timetable", "lastTrainFromKurama": "23:24"},
    "childFare": "Child (6–11) half the adult fare rounded up to ¥10; up to two infants ride free per paying passenger."
  }$nt$::jsonb
FROM (VALUES
  ('00000000-0000-4000-e369-000000000004', '00000000-0000-4000-c369-000000000004'),
  ('00000000-0000-4000-e369-000000000005', '00000000-0000-4000-c369-000000000005')
) AS v(fid, sid)
ON CONFLICT (id) DO NOTHING;

-- ── 6. Departures (vendor_availability_slots) ────────────────────────────────────────────────────
-- A closed day is ONE row with status 'blocked' and no start time, so the ride offers no departure that
-- day (`rideDepartures`: a date with slot rows answers only from them). A date with no rows at all offers
-- nothing either, because earliest_start_time is left NULL. capacity NULL where the read states none;
-- minimum_notice NULL (the column's '24 hours' default is not an operator fact).

-- Sagano, 2026-10-11 … 2026-12-31. Regular timetable every day the calendar does not suspend.
-- Suspended: Oct 14, Oct 21, Dec 16; winter closure Dec 30–31. Extra trains are not seeded (see notes).
INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, status, minimum_notice, confirmation_method)
SELECT md5(s.sid || d::date::text || t.dep)::uuid::text, s.sid, '00000000-0000-4000-a000-00007472616e', d::date, t.dep, t.arr, NULL, 'available', NULL, NULL
FROM generate_series(DATE '2026-10-11', DATE '2026-12-29', INTERVAL '1 day') AS d
CROSS JOIN (VALUES ('00000000-0000-4000-c369-000000000001')) AS s(sid)
CROSS JOIN (VALUES ('09:02','09:25'),('10:02','10:25'),('11:02','11:25'),('12:02','12:25'),
                   ('13:02','13:25'),('14:02','14:25'),('15:02','15:25'),('16:02','16:25')) AS t(dep, arr)
WHERE d::date NOT IN (DATE '2026-10-14', DATE '2026-10-21', DATE '2026-12-16')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, status, minimum_notice, confirmation_method)
SELECT md5(s.sid || d::date::text || t.dep)::uuid::text, s.sid, '00000000-0000-4000-a000-00007472616e', d::date, t.dep, t.arr, NULL, 'available', NULL, NULL
FROM generate_series(DATE '2026-10-11', DATE '2026-12-29', INTERVAL '1 day') AS d
CROSS JOIN (VALUES ('00000000-0000-4000-c369-000000000002')) AS s(sid)
CROSS JOIN (VALUES ('09:30','09:56'),('10:30','10:56'),('11:30','11:56'),('12:30','12:56'),
                   ('13:30','13:56'),('14:30','14:56'),('15:30','15:56'),('16:30','17:04')) AS t(dep, arr)
WHERE d::date NOT IN (DATE '2026-10-14', DATE '2026-10-21', DATE '2026-12-16')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, status, minimum_notice, confirmation_method)
SELECT md5(s.sid || b.d::text || 'blocked')::uuid::text, s.sid, '00000000-0000-4000-a000-00007472616e', b.d, NULL, NULL, NULL, 'blocked', NULL, NULL
FROM (VALUES ('00000000-0000-4000-c369-000000000001'), ('00000000-0000-4000-c369-000000000002')) AS s(sid)
CROSS JOIN (VALUES (DATE '2026-10-14'), (DATE '2026-10-21'), (DATE '2026-12-16'), (DATE '2026-12-30'), (DATE '2026-12-31')) AS b(d)
WHERE NOT EXISTS (SELECT 1 FROM vendor_availability_slots x WHERE x.service_id = s.sid AND x.date = b.d);

-- Hozugawa, 2026-10-11 … 2026-12-13 (the stated Mar 10 – Dec 13 regime).
--   Weekdays: hourly 09:00–15:00, shared boat of 24.
--   Saturdays and Sundays: ONE window slot 09:00–15:00 — boats leave whenever they fill (no fixed times).
--   Public holidays: the site sails them "as boats fill", but which dates are holidays is not in the read,
--   so the seed does not know them — a weekday holiday carries the weekday rows (flagged in the PR).
--   Dec 14–28: winter boats, whose times for December 2026 the read does not state — nothing seeded.
--   Dec 29–31: closed (New Year).
INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, status, minimum_notice, confirmation_method)
SELECT md5('00000000-0000-4000-c369-000000000003' || d::date::text || t.dep)::uuid::text, '00000000-0000-4000-c369-000000000003', '00000000-0000-4000-a000-00007472616e', d::date, t.dep, NULL, 24, 'available', NULL, NULL
FROM generate_series(DATE '2026-10-11', DATE '2026-12-13', INTERVAL '1 day') AS d
CROSS JOIN (VALUES ('09:00'),('10:00'),('11:00'),('12:00'),('13:00'),('14:00'),('15:00')) AS t(dep)
WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, status, minimum_notice, confirmation_method, special_requirements)
SELECT md5('00000000-0000-4000-c369-000000000003' || d::date::text || 'window')::uuid::text, '00000000-0000-4000-c369-000000000003', '00000000-0000-4000-a000-00007472616e', d::date, '09:00', '15:00', NULL, 'available', NULL, NULL,
       '["Boats leave whenever they fill (weekends and holidays) — no fixed departure times."]'::jsonb
FROM generate_series(DATE '2026-10-11', DATE '2026-12-13', INTERVAL '1 day') AS d
WHERE EXTRACT(ISODOW FROM d) IN (6, 7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, status, minimum_notice, confirmation_method)
SELECT md5('00000000-0000-4000-c369-000000000003' || b.d::text || 'blocked')::uuid::text, '00000000-0000-4000-c369-000000000003', '00000000-0000-4000-a000-00007472616e', b.d, NULL, NULL, NULL, 'blocked', NULL, NULL
FROM (VALUES (DATE '2026-12-29'), (DATE '2026-12-30'), (DATE '2026-12-31')) AS b(d)
WHERE NOT EXISTS (SELECT 1 FROM vendor_availability_slots x WHERE x.service_id = '00000000-0000-4000-c369-000000000003' AND x.date = b.d);

-- Eizan: no departures seeded (notes.timetables.slotsNotSeededReason).
