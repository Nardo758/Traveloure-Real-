<!-- §1–3 of the official read (the three TC-3 operators), committed as the evidence for migration 369. Sites 4–9 (SS-1a) are not part of this seed and are not reproduced here. -->

# TC3 operator source check (Sagano Romantic Train, Hozugawa boat ride, Eizan Railway "Kirara")

- **Fetched:** Sat 2026-10-10, 19:46–19:53 ET (America/New_York). All pages were requested with a plain HTTP GET (curl with a Chrome desktop user-agent; one WebFetch of the Sagano /ticket/ page).
- **Scope:** read-only. No logins, forms, booking flows, or POSTs. robots.txt was checked first on every site, and every page fetched is allowed by it.
- **Rules:** quotes are copied exactly from the source. PDF quotes come from `pdftotext -layout`, with runs of layout spaces collapsed to one space. Anything the site does not state is marked **NOT ON SITE**. "(image only)" means the information appears only in a graphic, not as text.
- Sites' server clocks showed 2026-10-11 JST at the time of fetch, so "today" widgets on the sites show Oct 11.

---

## 1. Sagano Romantic Train (嵯峨野観光鉄道) — https://www.sagano-kanko.co.jp/

### (a) robots.txt — https://www.sagano-kanko.co.jp/robots.txt (HTTP 200)
```
User-agent: *
Disallow: /cms/wp-admin/
Allow: /cms/wp-admin/admin-ajax.php

Sitemap: https://www.sagano-kanko.co.jp/wp-sitemap.xml
```

### (b) Terms / copyright
| Item | URL | Verbatim (original) | English gloss |
|---|---|---|---|
| Terms of use / site policy / copyright page | — | **NOT ON SITE.** The only policy page in the sitemap and footer is the privacy policy (https://www.sagano-kanko.co.jp/policy/ ; EN https://www.sagano-kanko.co.jp/en/policy). Footer text: "© Sagano Scenic Railway Co.,Ltd." | No terms or copyright page exists, only a privacy policy and a © line. |
| Reproduction (複製/転載) | — | **NOT ON SITE** | — |
| Automated access (クロール/スクレイピング/自動) | — | **NOT ON SITE** | — |
| Data use (privacy policy, nearest relevant text) | https://www.sagano-kanko.co.jp/policy/ | "当社サイトへのアクセスはお客様の自由意思によるものとし、当社サイトの利用に関しての責任はお客様にあるものとします。" | Users access the site at their own will and are responsible for how they use it. |
| Data use (privacy policy) | https://www.sagano-kanko.co.jp/policy/ | "なお、取得した個人情報はお客様の事前の承諾なしに改変することはありません。また、上記以外の目的で利用することはありません。" | Personal data collected is not altered without consent and is used only for the stated purposes. This covers the operator's handling of visitors' personal data, not reuse of site content. |

### (c) Facts
| Fact | Value | Exact page URL | Source sentence (verbatim) + gloss |
|---|---|---|---|
| Boarding / alighting stations | Saga (トロッコ嵯峨) ↔ Kameoka (トロッコ亀岡), with intermediate stops at Arashiyama and Hozukyo | https://www.sagano-kanko.co.jp/train-info/ | "亀岡方面ゆき【下り】" / "始発駅：嵯峨　終着駅：亀岡" … "嵯峨方面ゆき【上り】" / "始発駅：亀岡　終着駅：嵯峨" — Down trains start at Saga and end at Kameoka; up trains start at Kameoka and end at Saga. |
| Boarding flexibility | A Saga→Kameoka ticket can also board at Arashiyama | https://www.sagano-kanko.co.jp/faq/ | "1-6 「トロッコ嵯峨駅 → トロッコ亀岡駅」のチケットで、トロッコ嵐山駅から乗車できますか？ はい、ご乗車いただけます。" — Yes, you can board at Arashiyama with a Saga→Kameoka ticket. |
| Departures (regular, down) | Saga departs 9:02, then hourly (:02) through 16:02; Kameoka arrives at :25 | PDF: https://www.sagano-kanko.co.jp/cms/wp-content/uploads/2026/03/2026年列車運転時刻表日-4.pdf (linked from /train-info/) | "嵯峨野トロッコ列車時刻表 (2026/3/14改正)" ; "トロッコ嵯峨 (発) 9:02 10:02 11:02 12:02 13:02 14:02 15:02 16:02" ; "トロッコ亀岡 (着) 9:25 10:25 11:25 12:25 13:25 14:25 15:25 16:25" — Timetable revised 2026-03-14; Saga departure and Kameoka arrival times. |
| Departures (regular, up) | Kameoka departs 9:30, then hourly (:30) through 16:30 | same PDF | "トロッコ亀岡 (発) 9:30 10:30 11:30 12:30 13:30 14:30 15:30 16:30" ; "トロッコ嵯峨 (着) 9:56 10:56 11:56 12:56 13:56 14:56 15:56 17:04" — Kameoka departure and Saga arrival times. |
| Departures (extra trains) | Down 17:10 and 18:26; up 17:43 and 18:59, on specified days only | same PDF | "〇臨時列車(運転日注意)" ; "トロッコ嵯峨 (発) 17:10 18:26" ; "トロッコ亀岡 (発) 17:43 18:59" ; "※嵯峨野81号、82号および91号、92号の営業日については、当社HPの「運行スケジュール」をご参照ください。" — Extra trains run only on certain days; check the online schedule. |
| Journey time | About 25 min over about 7 km | https://www.sagano-kanko.co.jp/about/ (EN: https://www.sagano-kanko.co.jp/en/about) | "片道約7kmおよそ25分の間、" — about 25 minutes for the roughly 7 km one way. EN: "It takes approximately 25 minutes to cover the whole 7 km long trail." |
| Operating calendar / winter closure | All trains suspended Jan 1–Feb 28 and Dec 30–31 (winter closure). Which other days run is shown only by colour on the PDF calendar, and the colours cannot be read as text. | PDF: https://www.sagano-kanko.co.jp/cms/wp-content/uploads/2026/03/2026年運転計画カレンダー4月11日臨時列車追加日本語-1.pdf | "2026年 嵯峨野トロッコ列車運行予定日" ; "・・・通常ダイヤ運行日 ・・・全便運休日(1/1～2/28,12/30～12/31は冬期運休日)" ; "※運休日及び臨時列車の運転日は、お客様の動向を踏まえて今後追加、変更する場合があります。" — Legend reads "regular-schedule day / all-trains-suspended day (Jan 1–Feb 28 and Dec 30–31 are winter closure days)". Closure days and extra-train days may be added or changed. |
| Calendar legend (read visually from PDF) | White = 「・・・通常ダイヤ運行日」; peach with red slash = 「・・・全便運休日(1/1～2/28,12/30～12/31は冬期運休日)」; bright blue = 「・・・臨時列車運転日(嵯峨野81号及び82号)」; pale lavender = 「・・・臨々列車運転日(嵯峨野91号及び92号)」 | same PDF (rendered at 400 dpi, Sat 2026-10-10 ~20:10 ET) | Legend text verbatim as listed; footnote 「※運休日及び臨時列車の運転日は、お客様の動向を踏まえて今後追加、変更する場合があります。」 |
| All-trains-suspended, Oct 11–Dec 29 2026 | Oct 14, Oct 21, Dec 16 (Nov none). Dec 30–31 winter closure. | same PDF | Read from colour (peach + slash); no ambiguous cells. |
| Extra trains 臨時 81/82, Oct 11–Dec 29 2026 | Oct 11, 12, 24–31; Nov 1–13; Dec 1–4, 7–13, 26, 27 | same PDF | Read from colour (bright blue). |
| Extra trains 臨々 91/92, Oct 11–Dec 29 2026 | Oct none; Nov 14–30; Dec 5, 6 | same PDF | Read from colour (pale lavender). All other dates in range white (regular). |
| Weather / cancellation rule | No general weather-cancellation rule is published. The site covers only rain on open car No. 5 and refunds when a train is cancelled. | https://www.sagano-kanko.co.jp/faq/ | "なお、雨天の場合でも、当日の払い戻し・座席変更・他の列車への変更はできかねます。" — Even if it rains, same-day refunds and seat or train changes are not possible (Q1-9, Rich car). "5-20 予約した列車が運休になった場合、どのように返金されますか 登録した決済カードへ自動的に返金となります。" — If a booked train is cancelled, the payment card is refunded automatically. A general weather threshold or rule is **NOT ON SITE**. |
| Cancellation / refund (customer) | Free until 23:59 the day before; no same-day refund | https://www.sagano-kanko.co.jp/faq/ | "乗車日前日の23時59分まで無手数料でキャンセル可能です（ただし乗車日の当日払い戻しは不可）。" — Free cancellation until 23:59 the day before travel; no refund on the travel day. |
| Booking window | Advance sales open at 00:00 JST, one month before the travel date | https://www.sagano-kanko.co.jp/faq/ | "前売り券は、ご乗車日の１ヶ月前の午前0時から、当社ホームページの右にある「チケット予約はこちら」よりお買い求めいただけます。" — Advance tickets go on sale at midnight one month before travel via the site's booking button. Also: "乗車日の1か月前の午前0時(日本時間)から購入可能です。" |
| Where tickets sell | Online (official booking site), plus same-day sales at station windows (not Hozukyo) | https://www.sagano-kanko.co.jp/faq/ ; https://www.sagano-kanko.co.jp/train-info/ | "当日券は、トロッコ列車各駅窓口にてご購入いただけます。(トロッコ保津峡駅を除く)" — Same-day tickets are sold at station windows, except Hozukyo. "※WEBでの乗車券が満席の場合でも、各駅（保津峡駅は除く）の窓口で当日販売いたしますのでご乗車いただくことが可能です。" — Even when online sales are full, stations sell same-day tickets. |
| Same-day window opening | Saga ~8:35, Arashiyama ~8:50, Kameoka ~9:10 | https://www.sagano-kanko.co.jp/ticket/ | "当日乗車券・販売開始時間 トロッコ嵯峨駅　午前8時35分頃 トロッコ嵐山駅　午前8時50分頃 トロッコ亀岡駅　午前9時10分頃" — Same-day sales start times by station. |
| Standing tickets | Sold only after reserved seats sell out, in limited numbers | https://www.sagano-kanko.co.jp/ticket/ | "※立席券は指定席完売後、枚数に制限をして販売をいたします。" — Standing tickets are sold in limited numbers once reserved seats are sold out. |
| Party limit (online) | Max 8 per transaction | https://www.sagano-kanko.co.jp/ticket/ ; https://www.sagano-kanko.co.jp/faq/ | "2. 乗車人数を入力してください。合計8人までの予約が可能です。" — Up to 8 people per booking. "1回のご購入につき、最大8枚までです。" |
| Groups | 15+ people book through travel agents, 1 year to 1 month ahead | https://www.sagano-kanko.co.jp/faq/ | "人数が１５名以上の団体のお客様はご乗車の１年前～１カ月前までに全国の主な旅行会社にてお申し込みを承ります。" — Groups of 15+ apply via major travel agencies, 1 year to 1 month before travel. |
| Luggage | Suitcases up to ~120 cm (sum of 3 sides) free; items over 1 m not allowed | https://www.sagano-kanko.co.jp/faq/ | "3辺の合計が120cm程度までのものは無料で車内にお持ち込み可能です。 なお、長さが1mを超えるお荷物は車内にお持ち込みいただけませんので、あらかじめご了承ください。" — Bags up to about 120 cm total dimensions ride free; anything longer than 1 m is not allowed. |
| Luggage: bicycles / strollers / pets | No bicycles; strollers folded; pets in a carrier for ¥260 | https://www.sagano-kanko.co.jp/seat/ | "自転車 持ち込めません。" ; "ベビーカー 折りたたんでのご乗車をお願いいたします。" ; "※別途「有料手回り品」料金２６０円を申し受けます。" — No bikes; fold strollers; pets carry a ¥260 hand-luggage fee. |
| JR Pass validity | Not valid | https://www.sagano-kanko.co.jp/faq/ (EN: https://www.sagano-kanko.co.jp/en/faq/) | "また、JR PASS、青春18きっぷもご利用いただけません。" — JR Pass and Seishun 18 tickets cannot be used. EN: "JR PASS and Seishun 18 Kippu cannot be used to ride the train." |
| Price per seat (individual) | Adult ¥880 / child ¥440 one-way, any section (general). Disability-ID holders ¥440 / ¥220. **Rendered in browser** Sat 2026-10-10 ~20:10 ET; script-loaded, not in served HTML. | https://www.sagano-kanko.co.jp/ticket/ | Section 「個人のお客様」: "こちらは片道の普通運賃になります。" ; "※乗車区間にかかわらず均一" ; rendered row 「一般 \| 880円 \| 440円」 ; disability rows 「440円 \| 220円」 — One-way regular fare, same for any section: adult ¥880, child ¥440. No date shown beside the table. |
| Price per seat (group, 15+) | Adult ¥800 / child ¥400 (general group); ¥710 / ¥360 (school group) | https://www.sagano-kanko.co.jp/ticket/ | "こちらは片道の団体運賃（15名以上）になります。" ; "一般団体 800 円 400 円" ; "学生団体 710 円 360 円" ; "※季節により変更あり" — One-way group fare for 15+; general ¥800/¥400, students ¥710/¥360; may change by season. |
| Child / infant rule | Under 6 ride free on a lap (1 per ticket holder); a child fare applies if the infant uses a seat | https://www.sagano-kanko.co.jp/ticket/ | "※幼児は乗車券保有者1名につき1名無料（幼児が席を利用する場合は小児料金）" — One infant per ticket holder rides free; child fare if the infant takes a seat. |
| Payment: online | Credit cards (5 brands), 3-D Secure required; debit cards accepted | https://www.sagano-kanko.co.jp/faq/ | "クレジットカードがご利用いただけます。利用できる種類は次の5種類となります。 （Visa、MasterCard、アメリカン・エクスプレス、JCB,ダイナースクラブ）" ; "3Dセキュア登録のないカードはご利用いただけません。" ; "6-6 デビットカードも使えますか。 はい、ご利用いただけます。" — Online accepts 5 card brands; cards without 3-D Secure are refused; debit cards OK. |
| Payment: station window | Cash, credit cards, transit IC cards (not PiTaPa) | https://www.sagano-kanko.co.jp/faq/ | "現金、クレジットカード（VISA、MASTER、JCB、ダイナース、アメリカンエキスプレス、ディスカバーカード）と交通系ICカード（ICOCA、Suicaなど）がご利用いただけます。ただし、PiTaPaはご利用いただけません。" — Cash, 6 card brands and IC cards are accepted; PiTaPa is not. |
| Payment: other constraints | No round-trip tickets; tickets are e-tickets shown on a phone; printed vouchers not accepted | https://www.sagano-kanko.co.jp/faq/ | "往復券のご用意はありません。片道ずつご購入ください。" ; "バウチャーではご乗車できません。スマートフォンでEチケットのQRコードを改札口で呈示して有効となります。" — Buy each direction separately; the QR e-ticket on a phone is required and printed vouchers are not valid. |

---

## 2. Hozugawa river boat ride (保津川下り, 保津川遊船企業組合) — https://www.hozugawakudari.jp/

### (a) robots.txt — https://www.hozugawakudari.jp/robots.txt (HTTP 200)
```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
```

### (b) Terms / copyright
| Item | URL | Verbatim (original) | English gloss |
|---|---|---|---|
| Terms of use / site policy / copyright page | — | **NOT ON SITE.** The only policy page in the sitemap and footer is 個人情報の取り扱いについて (https://www.hozugawakudari.jp/privacy). Footer text: "Copyright © 保津川遊船企業組合 All rights reserved." | No terms page exists, only a privacy page and a copyright line. |
| Reproduction (複製/転載) | — | **NOT ON SITE** | — |
| Automated access (クロール/スクレイピング/自動) | — | **NOT ON SITE** | — |
| Data use (privacy page) | https://www.hozugawakudari.jp/privacy | "皆様の情報を正当な目的以外に無断で利用することはありません。また、お預かりしている個人情報をご本人の許可なく、企業または第三者に、提供、開示することは一切ございません。" | Personal data is not used beyond legitimate purposes and is never given to third parties without consent. This covers visitors' personal data, not reuse of site content. |

### (c) Facts
| Fact | Value | Exact page URL | Source sentence (verbatim) + gloss |
|---|---|---|---|
| Boarding point / landing | Board at Kameoka, land at Arashiyama (about 16 km) | https://www.hozugawakudari.jp/ | "丹波の国「亀岡」から京の名勝「嵐山」までの約16キロの旅。" — A trip of about 16 km from Kameoka (Tanba) to Arashiyama. |
| Boarding point address | 京都府亀岡市保津町下中島2 | https://www.hozugawakudari.jp/ (footer, all pages) | "保津川遊船企業組合 621-0005 京都府亀岡市保津町下中島2" — Operator address at Kameoka. The page does not explicitly say this is the boarding dock (not stated). |
| Landing → JR station | Landing to JR Saga-Arashiyama Station: 15–20 min walk | https://www.hozugawakudari.jp/faq | "着船場～ＪＲ嵯峨嵐山駅までどのくらいですか？ 徒歩で15分から20分程です。" — Walk from the landing to JR Saga-Arashiyama takes about 15–20 minutes. |
| Departures (Mar 10–Dec 13, 2026) | 9:00–15:00 hourly on weekdays; on weekends and holidays boats leave whenever full | https://www.hozugawakudari.jp/service/timetable | "◆2026/3/10（火）　～　2026/12/13 （日） 営業時間　９：００〜１５：００まで 平日（定期運航） ９：００／１０：００ ／１１：００／１２：００／１３：００ ／１４：００／１５：００ 土・日・祝日（随時運航） ※土・日・祝は定員がお集まり次第出船します。" — Weekdays have hourly sailings 9:00–15:00; weekends and holidays sail as boats fill. |
| Departures (winter, Jan 5–Mar 9, 2026) | 10:00 / 11:30 / 13:00 / 14:30 | https://www.hozugawakudari.jp/service/timetable | "2026/1/5 （月） ～ 2026/3/9 （月） 営業時間　１０：００〜１４：３０まで 定期運航 １０：００ ／１１：３０ ／１３：００ ／１４：３０" — Winter schedule with 4 sailings. |
| Departure cut-off | Last boat 15:00 (14:30 in winter); check in by then | https://www.hozugawakudari.jp/tickets/reservation | "※最終便（15時出船）の乗船受付は、15時までにお済ませください。（12月第2月曜日から3月9日までは最終船14時30分）" — Check in by 15:00 for the last boat; in winter the last boat is 14:30. |
| Duration | About 2 hours (varies with water level). The FAQ also says ~100 min (60–110 min). | https://www.hozugawakudari.jp/tickets ; https://www.hozugawakudari.jp/faq | "所要時間は約2時間（水量により多少の早遅があります）" — About 2 hours, depending on water. FAQ: "川の水位によって前後しますが、所要時間は約100分です。 多水位時は60分程度〜、少水位時は110分ほどかかります。" — About 100 min; ~60 min at high water, ~110 min at low water. (The site's own figures are inconsistent; FAQ also says "乗船時間は約 90分".) |
| Season / closed days | Runs all year; closed Dec 29–Jan 4 and on safety-inspection days (2026: Feb 1, Feb 4, Sep 2) | https://www.hozugawakudari.jp/service/timetable ; https://www.hozugawakudari.jp/tickets | "運休日 年末年始 12/29～1/4 安全点検日 2026　/2/1（日）・2/4（水）・9/2（水）" — Closed for New Year Dec 29–Jan 4 and on inspection days. "2026年2月1日（日）・2026年2月4日（水）・2026年9月2日（水）は安全点検のため運休いたします。" |
| Winter boats | 2nd Monday of December to Mar 9 (open boat this winter) | https://www.hozugawakudari.jp/tickets | "定期乗合船　12月第2月曜日～3月9日※12⽉29⽇から1⽉4⽇まで運休　定員 / 24名" ; "今年の冬期は、船の囲いを取ったオープン船で運航致します。暖かい服装でお越しください。" — Winter shared boats run from the 2nd Monday of Dec to Mar 9 (closed Dec 29–Jan 4); this winter they are open boats, so dress warmly. |
| Weather / high-water cancellation | Runs in rain with an awning; cancelled for storms or high water. May also cancel for strong wind. Decided on the day. | https://www.hozugawakudari.jp/tickets ; https://www.hozugawakudari.jp/faq | "雨天の時は、船にテントを張り、通常通り運航します。 暴風雨および増水の場合は、運航を中止します。" — In rain the boat runs under a tent; it is cancelled in storms or high water. FAQ: "また、晴天時であっても強風などの理由により、運航を中止する場合がございます。 運航可否の判断は、基本的に当日の状況を確認したうえで決定いたします。" — It may be cancelled even in fine weather for strong wind; the decision is made on the day. |
| Water-level threshold | Water level of 65 cm at the MLIT "Hozu" gauge is strictly observed | https://www.hozugawakudari.jp/notes | "国土交通省河川観測所「保津」の水位65cmを厳守" — The 65 cm level at the MLIT Hozu gauge is strictly observed. The page does not say whether 65 cm is a maximum or a minimum. |
| Refund on cancellation | Online bookings are refunded in full automatically | https://www.hozugawakudari.jp/faq | "オンライン予約は自動的に全額返金となりますので、お客様ご自身でのお手続きは不要です。" — Online bookings get an automatic full refund. |
| Booking window | Online booking for under 10 people closes the day before; 10+ book by phone. **Opening of the advance window: NOT ON SITE.** | https://www.hozugawakudari.jp/tickets/reservation | "10名様以上はお電話でのご予約、10名様未満のお客様はオンラインでのご予約となります。" ; "※オンライン予約は前日までの締切です。当日の場合は当日券でお越しください。" — 10+ book by phone and under 10 book online; online closes the day before, and same-day riders buy on site. |
| Walk-up (same-day) | Same-day tickets, first come first served; check-in from 7:30 | https://www.hozugawakudari.jp/tickets/for_individual | "10名以下の方は当日受付制です。 7時30分から受付できます。" — Parties of 10 or fewer use same-day check-in, open from 7:30. Note the inconsistency with /tickets/reservation (under 10 online). |
| Connection with Sagano train | Book about 1 hour after the Torokko train | https://www.hozugawakudari.jp/tickets/reservation | "※トロッコ列車と接続される方は、トロッコに乗られた約1時間後のお時間でご予約下さい。" — If connecting from the Torokko train, book a slot about 1 hour later. |
| Child limit | Height 80 cm or more required (any age); cannot ride on a lap | https://www.hozugawakudari.jp/faq | "ご年齢に関わらず、身長 80cm未満の方はご乗船いただけません。" ; "80cm以下の方は抱っこでのご乗船もできませんので、あらかじめご了承ください。" — Anyone under 80 cm cannot board, regardless of age, including being held. |
| Party / boat capacity | Shared boat holds 24 (varies with water); charter holds 17, up to 20 with extra fees | https://www.hozugawakudari.jp/tickets | "定期乗合船 定員 / 24名" ; "定員は、水量により変更する場合がございます。" ; "※17名以上の場合は、増員1名につき大人6,000円・子供4,500円プラスとなります。（最大20名まで）" — Shared boat capacity is 24 and may change with water level; charter adds ¥6,000 per adult / ¥4,500 per child over 17, max 20. |
| Life jacket condition | Mandatory; boarding refused without one | https://www.hozugawakudari.jp/faq | "着用に同意されないお客様および着用できない方につきましては乗船をお断りしております。" — Those who won't or can't wear a life jacket are refused. |
| Luggage | **NOT ON SITE** (no suitcase or baggage rule). Only strollers and wheelchairs are covered. | https://www.hozugawakudari.jp/target/withbaby ; https://www.hozugawakudari.jp/faq | "尚、ベビーカーは折りたたんで船の後部に積ませていただきますが、台数が多い場合は、事前にお問い合わせ下さい。" — Strollers are folded and stowed at the stern; contact them in advance if there are many. "折りたたみ式の車椅子は、船の後部に積むことが可能です。" |
| Price per seat (shared boat) | Adult ¥6,000; child ¥4,500 (infant to elementary school); tax included | https://www.hozugawakudari.jp/tickets | "大人 / 1名 6,000円 子供 / 1名（幼児～小学生） 4,500円" ; "料金・時刻表ページの表示価格は全て税込みです。" — Adult ¥6,000, child ¥4,500; all prices include tax. |
| Group / disability discount | 35–99 people 5% off, 100+ 10% off; disability 10% off at the window only | https://www.hozugawakudari.jp/tickets | "団体割引：35名から99名様までは5%引、100名様以上は10%引" ; "ご提示の方は一般料金より1割引となります。（オンライン予約は一般料金の設定のみとなりますので、恐れ入りますが予めご了承ください。）" — Group discounts as stated; the disability discount is 10% at the window and not available online. |
| Charter price | ¥144,000 per boat (regular); ¥162,000 (peak); VIP boat "RYOUI" ¥400,000 | https://www.hozugawakudari.jp/tickets ; https://www.hozugawakudari.jp/vip | "貸切船 定員 / 17名 通常貸切料金 一隻 144,000円" ; "繁忙期貸切料金 一隻 162,000円" ; VIP: "「RYOUI」特別貸切（一艇貸切） 400,000円（税込）" ; "事前予約制（当日予約不可）" ; "最大8名（リクライニングシート6席＋予備席2席）" — Charter ¥144k, peak ¥162k; the VIP boat is ¥400k incl. tax, max 8 people, advance booking only. |
| Peak charter periods (2026) | Listed dates | https://www.hozugawakudari.jp/tickets | "4月25日（土）〜5月6日（水）、7月18日（土）〜7月20日（月・祝）、8月1日（土）〜8月16日（日）、9月19日（土）〜9月23日（水・祝）、10月10日（土）〜10月12日（月・祝）、11月全日、12/1（日）〜12/6（日）" — Peak-rate charter dates. |
| Winter charter | Weekdays only, 2nd Monday of Dec to Mar 9 | https://www.hozugawakudari.jp/tickets | "貸切船　12月第2月曜日～3月9日（月〜金のみ）　定員 / 17名" — Winter charters run Mon–Fri only. |
| Payment (window) | Credit cards accepted; brands shown only as an image (VISA, Mastercard, JCB, American Express, Diners Club, UnionPay). Cash: **NOT ON SITE** as an explicit statement. | https://www.hozugawakudari.jp/faq (image: https://www.hozugawakudari.jp/wp-content/themes/hozugawa2/images/creditcard.png) | "カード支払は可能ですか？ 下記のクレジットカードがご利用頂けます。" — The listed credit cards are accepted. The brand names appear only in the logo image (alt text "利用可能クレジットカード"). |
| Payment (online) | Through booking partners (LINKTIVITY, KKday, Tiqets); payment questions go to the booking site | https://www.hozugawakudari.jp/tickets/reservation ; https://www.hozugawakudari.jp/tickets/for_individual | "予約中のエラーや支払い、ネット予約のお手続きに関するお問合せは、 恐れ入りますが直接ブッキングサイト（LINKTIVITY）へご連絡をお願いいたします。" — Contact LINKTIVITY about online payment issues. "Tiqetsサイトにて1時間につき限定20名様のみ個人の方もご予約可能です。" — Tiqets offers 20 individual places per hour. "※キャンセルや変更については、購入された予約サイトで行ってください。" — Cancel or change through the site you booked on. |

---

## 3. Eizan Railway (叡山電車) "Kirara" (展望列車「きらら」) — https://eizandensha.co.jp/

### (a) robots.txt — https://eizandensha.co.jp/robots.txt (HTTP 200)
```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

Sitemap: https://eizandensha.co.jp/wp-sitemap.xml
```

### (b) Terms / copyright — https://eizandensha.co.jp/terms/ (「サイトのご利用にあたって」)
| Item | URL | Verbatim (original) | English gloss |
|---|---|---|---|
| Reproduction (複製/転載) | https://eizandensha.co.jp/terms/ | "当ウェブサイト内のコンテンツ（情報・資料・画像等）の著作権は、個別に特段の明示がない限り当社が保有します。" | The company holds copyright in site content (information, materials, images) unless stated otherwise. |
| Reproduction (複製/転載) | https://eizandensha.co.jp/terms/ | "営利、非営利を問わず、法律上許容される範囲を超えて当ウェブサイト内のコンテンツの複製、転用、販売等を行い、あるいは、コンテンツの内容の変形、変更、加筆修正、翻案等を行うことは、個別に当社との事前の合意がない限り一切認められておりません。" | Commercial or not, copying, reusing, selling, or altering or adapting content beyond what law permits is prohibited without prior individual agreement. |
| Prohibited acts (nearest clause to automated access) | https://eizandensha.co.jp/terms/ | "当ウェブサイトのご利用に際し、次の行為をしてはならないものとします。" / "当社または第三者に、不利益もしくは損害を与える行為、またはそのおそれがある行為。" / "上記のほか、当社が不適切と判断する行為。" | Users must not do anything that harms or may harm the company or others, or anything else the company deems inappropriate. |
| Automated access (クロール/スクレイピング/自動) | — | **NOT ON SITE** (no explicit clause) | — |
| Accuracy disclaimer (data use) | https://eizandensha.co.jp/terms/ | "個別に特段の明示がない限り当ウェブサイトのコンテンツの妥当性や正確性等について保証するものではなく、一切の責任を負いません。" | The site does not guarantee its content is valid or accurate and accepts no liability. |
| Linking | https://eizandensha.co.jp/terms/ | "当社ウェブサイトへのリンクは基本的にフリーです。" / "なお、リンク先はトップページ（https://eizandensha.co.jp/）としてください。" | Linking is basically free, but links should point to the top page. |
| Privacy policy | https://eizandensha.co.jp/privacy_policy/ | (fetched, HTTP 200; covers personal data only, not content reuse) | — |

### (c) Facts
| Fact | Value | Exact page URL | Source sentence (verbatim) + gloss |
|---|---|---|---|
| Route | Kirara runs on the Kurama Line to Kibuneguchi and Kurama, starting at Demachiyanagi | https://eizandensha.co.jp/en/ ; Kirara PDF below | EN: "For the Kurama Line to Kibuneguchi and Kurama stations, we have a special scenic train called “KIRARA”." — Kirara serves the Kurama Line. |
| Kirara timetable (weekdays) | Down from Demachiyanagi (Kurama arrival): 8:02 (8:33), 9:30 (10:01), then 10:15, 10:45 … 17:49 (18:20). Some trains stop short of Kurama. ◆ trains do not run Wed/Thu. | PDF: https://eizandensha.co.jp/uploads/499_file_path1.pdf (via https://eizandensha.co.jp/information/kirara/?di=20, linked from https://eizandensha.co.jp/guide/#kiraratimetable) | "展望列車「きらら」時刻表 Panorama Train “KIRARA” Timetable 2026年8月22日変更" ; "【平 日（月曜～金曜） Weekdays】" ; "出 町 柳 発 (E01)Demachiyanagi d. 7:00 8:02 9:30 10:15 10:45 11:30 12:00 12:45 13:15 14:00 14:30 15:15 15:45 16:30 17:01 17:49 18:25 19:16 20:10" ; "鞍 馬 着 (E17)Kurama a. … 8:33 10:01 10:46 11:16 12:01 12:31 13:16 13:46 14:31 15:01 15:46 16:16 17:01 17:32 18:20 …" ; "鞍 馬 発 (E17)Kurama d. … … 8:43 10:04 10:49 11:19 12:04 12:34 13:19 13:49 14:34 15:04 15:49 16:19 17:04 17:44 18:31" ; "備考欄に◆印がついてる列車は、水曜日と木曜日の運行はございません。" — Weekday Kirara times (revised 2026-08-22); trains marked ◆ do not run on Wednesdays or Thursdays. |
| Kirara timetable (Sat/Sun/holidays) | Down from Demachiyanagi 5:42 … 17:45; Kurama arrivals 6:13 … 18:16 | PDF: https://eizandensha.co.jp/uploads/499_file_path2.pdf (via https://eizandensha.co.jp/information/kirara/?di=21) | "【土 曜・休 日 Saturdays, Sundays & Holidays】" ; "出 町 柳 発 (E01)Demachiyanagi d. 5:42 7:17 8:15 9:30 10:15 10:45 11:30 12:00 12:45 13:15 14:00 14:30 15:15 15:45 16:30 17:00 17:45" ; "鞍 馬 着 (E17)Kurama a. 6:13 … 8:46 10:01 10:46 11:16 12:01 12:31 13:16 13:46 14:31 15:01 15:46 16:16 17:01 17:31 18:16" ; "鞍 馬 発 (E17)Kurama d. … 6:31 … 8:49 10:04 10:49 11:19 12:04 12:34 13:19 13:49 14:34 15:04 15:49 16:19 17:04 17:34 18:21" — Weekend and holiday Kirara times. Column alignment for up trains is not reliable in the text extraction, so check the PDF for train pairings. |
| Timetable caveat | Times may change without notice; "Mai" times by enquiry | both PDFs | "車両点検等の都合により予告なく運転時刻を変更する場合があります。" ; "展望列車「舞」の時刻はお問い合わせください。" — Times may change without notice for inspections; ask for Mai train times. |
| Journey time | Demachiyanagi ↔ Kurama 31 min (standard daytime) | https://eizandensha.co.jp/guide/station/demachiyanagi.html ; https://eizandensha.co.jp/guide/station/kurama.html | Demachiyanagi station page, 所要時間 table: cell "鞍馬" pairs with cell "31分" (the Kurama page likewise pairs "出町柳" with "31分") ; "※昼間時間帯の標準的な所要時分ですので、列車により多少異なる場合があります。" — 31 minutes is the standard daytime time and may vary slightly by train. |
| Operating calendar | Separate weekday (Mon–Fri) and Sat/Sun/holiday Kirara timetables; ◆ trains do not run Wed/Thu. Closure or no-service days: **NOT ON SITE**. | https://eizandensha.co.jp/guide/ ; PDFs above | "平日（月曜～金曜）" / "土曜・休日" (timetable links) ; "備考欄に◆印がついてる列車は、水曜日と木曜日の運行はございません。" |
| Special-day schedule (notice) | Oct 22, 2026 (Kurama Fire Festival): special "火祭ダイヤ" timetable; last train from Kurama 23:24 | https://eizandensha.co.jp/guide/ | "2026年10月22日（木）は「鞍馬の火祭」が行われるため、「火祭ダイヤ」で運行いたします。" ; "最終列車は23:24発" — Special timetable on Oct 22 for the fire festival; last train from Kurama leaves at 23:24. |
| Reservation / surcharge for Kirara | No reservation; no extra charge beyond the regular fare | https://eizandensha.co.jp/guide/faq/ | "予約は必要ありません。" ; "別料金は必要ありません。普通運賃のみでご乗車いただけます。" — No reservation needed; only the regular fare. |
| Fare Demachiyanagi → Kurama | Adult ¥470 / child ¥240 | PDF: https://eizandensha.co.jp/wp-content/uploads/2023/04/01-fare_2023.04.01-b.pdf ; EN: https://eizandensha.co.jp/en/ | PDF: "2023年4月1日改定 旅 客 運 賃 表" ; "出 町 柳 220 220 220 220 280 280 280 280 280 350 350 350 410 410 470 470" (last column = 鞍馬) ; "5 区 間 470 240" — Fare table revised 2023-04-01; Demachiyanagi row ends with ¥470 to Kurama; 5-section fare is ¥470 adult / ¥240 child. EN: "Demachiyanagi Sta. → Kibuneguchi Sta., Kurama Sta." / "（Adult: 470 yen  Child: 240 yen）" — Demachiyanagi to Kibuneguchi or Kurama: adult ¥470, child ¥240. |
| Fare page (HTML) | Fare tables are images only | https://eizandensha.co.jp/guide/fare/ | Images: https://eizandensha.co.jp/wp-content/uploads/2023/04/futsuu2023.04.01.jpg (alt "普通運賃表"). No fare figures as HTML text (image only). |
| Child / infant | Child (6–11) half fare, rounded up to ¥10; up to 2 infants free per paying passenger | https://eizandensha.co.jp/guide/tickets/ | "おとな運賃の半額です。 ※ただし、10円未満の端数は10円単位に切り上げます。" ; "幼児は、「おとな」または「こども」のお客さま1人につき、2人まで無料です。3人目からこども運賃をいただきます。" — Child pays half the adult fare, rounded up to ¥10; 2 infants per passenger ride free. |
| Pass validity: JR Pass | Not valid | https://eizandensha.co.jp/en/ | "JAPAN RAIL PASS cannot be used for Eizan Railway." — The JR Pass is not valid on Eizan. |
| Pass validity: Eizan 1-day ticket | "えぇきっぷ" adult ¥1,200 / child ¥600; whole line, unlimited rides | https://eizandensha.co.jp/good-value/ | "叡山電車1日乗車券「えぇきっぷ」" ; "おとな 1,200円 こども 600円" ; "【券売機発売分】発売当日限り 【窓口発売分】発売日から翌月末日までのお好きな1日" ; "【叡山電車】全線乗り降り自由" — 1-day ticket; machine-bought tickets are valid on the day of purchase, window-bought tickets on any 1 day until the end of the following month; unlimited rides on the whole line. |
| Pass validity: other passes covering Kurama | e.g., 地下鉄＆えいでん 鞍馬・貴船日帰りきっぷ ¥2,100; 京都洛北・森と水のきっぷ ¥1,800 | https://eizandensha.co.jp/good-value/ | "地下鉄＆えいでん 鞍馬・貴船日帰りきっぷ" … "おとな 2,100円（おとなのみ）" … "【叡山電車】全線乗り降り自由 【京阪電車】三条～出町柳間乗り降り自由 【京都市営地下鉄】全線乗り降り自由" ; "京都洛北・森と水のきっぷ" … "おとな 1,800円（おとなのみ）" — Combined passes that cover the whole Eizan line. |
| Pass not sold on board | Value tickets are not sold on trains | https://eizandensha.co.jp/guide/faq/ | "車内では発売しておりません。" — Not sold on board. |
| Payment: cards / cashless | Credit cards and cashless payments are **not** accepted for ticket purchase | https://eizandensha.co.jp/guide/faq/ | Q: "乗車券購入の際にクレジットカードやキャッシュレス決済は使えますか？" A: "申し訳ございませんが、クレジットカードやキャッシュレス決済はご利用いただけません。" — Sorry, credit cards and cashless payment cannot be used. |
| Payment: IC cards | PiTaPa, ICOCA, Suica and other nationally interoperable IC cards accepted | https://eizandensha.co.jp/guide/tickets/ic_card.html | "叡山電車では交通系ICカードの全国相互利用サービスに対応しておりPiTaPaの他、ICOCA、Kitaca、Suica、PASUMO、TOICA、manaca、SUGOCA、はやかけん、nimocaの各カードがご利用になれます。" — The listed national IC cards are accepted. |
| Ticket machines / unstaffed stations | Machines at Demachiyanagi (all day) and Kurama (9:30–16:20); elsewhere pay on board | https://eizandensha.co.jp/guide/tickets/normal.html | "出町柳 初発～終発" ; "鞍　馬 9:30～16:20" ; "券売機を設置していない駅や券売機発売時間外にご乗車の場合は、乗車駅証明書をお取りいただき、お降りの際に運賃をお支払いください。" — Where there is no machine or it is closed, take a boarding certificate and pay when you get off. |
| Luggage | Free: 2 items, each up to 250 cm total dimensions (2 m long) and 30 kg | https://eizandensha.co.jp/guide/tickets/temawari.html | "縦・横・高さの合計が250cm以内（長さは2m以内）で重量が30kg以内のもの2個まで" — Up to 2 items within 250 cm total / 2 m length / 30 kg ride free. |

---

### Fetch log / exceptions
- **Robots-disallowed pages:** none of the pages fetched. The only disallowed paths are each site's `/wp-admin/` (`/cms/wp-admin/` on Sagano), and nothing there was requested.
- **Pages that could not be fetched:** none. Every request returned HTTP 200.
- **Not fetched by choice:** `https://common-api.sagano.linktivity.io/v1/pricing/<date>`, a third-party JSON API that the Sagano /ticket/ page's script calls to fill in individual fares. It is not a public page, so it is outside the navigation-only rule. As a result, Sagano's individual fare is recorded as NOT ON SITE in page text.
- **https://www.hozugawakudari.jp/en** returned HTTP 200, but the body was only a translation-service notice ("You might access from a website which is not covered by this service."), so there was no English content.
- **Sagano FAQ detail URLs** (e.g. /faq/112/) return HTTP 200 with a stub body ("index.php"). The FAQ content was taken from https://www.sagano-kanko.co.jp/faq/.


---

## Addendum — decision-maker reconciliation for the seed (Oct 11, 2026)

- **Sagano per-seat fare**, rendered from /ticket/ in a real browser on 2026-10-10: adult ¥880, child ¥440,
  one-way, the same for any section (「こちらは片道の普通運賃になります。」「※乗車区間にかかわらず均一」).
- **All-trains-suspended days, Oct 11–Dec 29**, from the official 2026 calendar PDF: Oct 14, Oct 21 and Dec 16,
  plus the winter closures Dec 30–31 and Jan 1–Feb 28. Every other date from Oct 11 to Dec 29 runs the regular
  timetable.
- **Extra-train days.** Only dates that two readings agree on are seeded:
  - **81/82:** Oct 11, 12, 24–31; Nov 1–6, 8–13; Dec 1–4, 7–11, 26, 27.
  - **91/92:** Nov 14–30; Dec 5, 6.
  - **Extra-train status unconfirmed:** Oct 17, Nov 7, Dec 12, 13, 19, 20. The regular trains run on these days
    regardless.
- **PDF caveat** that closures and extra trains may change: carried on the ride row.
- **Refresh interval:** 30 days, set through `/admin/content-sources`. It is not seeded.

## Addendum — OSM points (read from openstreetmap.org 2026-10-10; "© OpenStreetMap contributors")
- Torokko-Saga: node 12997335828 — 35.0185888, 135.6807067
- Torokko-Kameoka: node 538973298 (railway=stop; no station node) — 35.0131065, 135.6068310
- Hozugawa boarding 乗船場 (Kameoka): node 4174041189 — 35.0175747, 135.5873099
- Hozugawa landing 下船場 (Arashiyama, ~570 m upstream of Togetsukyo): node 4539039690 — 35.0135421, 135.6714667
- Demachiyanagi (Eizan, operator 叡山電鉄; not the Keihan node): node 335671845 — 35.0304955, 135.7732355
- Kurama: node 7886699754 — 35.1128960, 135.7722690
