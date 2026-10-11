# SS-1 — Kyoto source registry entry sheet (for Leon, `/admin/content-sources`)

SS-1 rulings 1–5 (decision-maker, Oct 10, 2026). Ledger `2026-10-10-ss1a-registry-entry-sheet` (R415).
Leon reads each terms page, types the row in `/admin/content-sources` (R251), then activates — the
activation IS the terms check, and it is his.

> **Read pass (decision-maker, Oct 11, 2026 — the founder's research file §4–9).** The rulings below on
> license, labels, day types and staged facts come from that pass. **Robots (verbatim), the terms URL and the
> terms summary are filled from `kyoto-nine-site-read-2026-10-10.md`** (the full read of all nine sites, fetched
> Oct 10, 2026, 19:46–19:59 ET): robots as quoted, the terms URL as given, the summary from the file's English
> gloss column. A robots line break is shown as `<br>`; nothing was paraphrased into a rule the file does not state.

## Rows

All rows: `market = kyoto`, `adapter = tavily_extract`. **`license_class = official`, reuse `link_only`**
(the fixed LD 65 mapping official → link_only; `link_only` is a reuse class, not a license class — the
registry's license values are `official | editorial | partner | restricted`).

| id (type exactly) | Name | Homepage | Covers | Does not cover | Refresh (days) | Cost ceiling (¢/day) | Robots (verbatim) | Terms URL | Terms summary | Use ruled |
|---|---|---|---|---|---|---|---|---|---|---|
| `kyoto_city_transport` | Kyoto City Transportation Bureau (City Bus & Subway) | https://www2.city.kyoto.lg.jp/kotsu/ | `transport.local`, `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | www2.city.kyoto.lg.jp/robots.txt (200, whole file): `User-Agent: *` (no Disallow) · www.city.kyoto.lg.jp/robots.txt: HTTP 404, no robots file | https://www.city.kyoto.lg.jp/main/site_policy/0000000005.html ; timetable: https://www2.city.kyoto.lg.jp/kotsu/tikadia/guide/about.htm | Copyright belongs to Kyoto City in principle; some images belong to other authors. No reproduction or reuse without permission, except where copyright law allows it (private copying, quotation). Using screenshots of the site (including logos) is firmly refused. Use of the timetable means agreeing to its terms; timetable data can change without notice and comes with no warranty; no liability for losses caused by it. Automated access: NOT ON SITE. | link_only with the quoted fact |
| `jr_west` | JR West — Kyoto-area lines | https://www.westjr.co.jp/ | `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | westjr.co.jp/robots.txt (200): `User-agent: *`<br>`Disallow: /jin/kisotsu/syousai.html` · timetable.jr-odekake.net/robots.txt (200): `User-Agent: *`<br>`Allow: /` · www.jr-odekake.net/robots.txt: HTTP 404 · eki.jr-odekake.net/robots.txt: 200 but an HTML error page, no rules | https://www.westjr.co.jp/guide/site_policy.html ; plus the notice on every timetable.jr-odekake.net page | All content, including database works, is copyrighted; any copying, transcription, distribution or similar use without permission is prohibited. Timetable data comes from Kotsu Shimbunsha's JR Timetable (Oct 2026); reprinting, copying or converting it into any medium without permission is prohibited. "Please don't bookmark this page"; times and platforms are a guide only. No warranty on accuracy. RSS is for personal, non-commercial use only. Automated access: NOT ON SITE. | link_only; first/last departure only; **HELD — Leon's counsel ruling + operator approval** |
| `hankyu` | Hankyu Railway | https://www.hankyu.co.jp/ | `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | hankyu.co.jp/robots.txt (200): `User-agent: *`<br>`# include ファイル`<br>`Disallow: /include/`<br>`Disallow: /area_info/include/`<br>`Disallow: /area_info/event/include/`<br>`Disallow: /railinfo/include/`<br>`Disallow: /en/railinfo/include/`<br>`Disallow: /ch/railinfo/include/`<br>`Disallow: /zh-tw/railinfo/include/`<br>`Disallow: /kr/railinfo/include/`<br>`Disallow: /th/railinfo/include/`<br>`Disallow: /topics/include/`<br>`Disallow: /station/include/`<br>`Disallow: /railfan/include/`<br>`Disallow: /privace/include/`<br>`Disallow: /ticket/include/` | https://www.hankyu.co.jp/sitepolicy/index.html ; plus the 「時刻表について」 notice on each timetable page | All rights in site content belong to Hankyu and other rights holders. Beyond what the law allows, use without prior permission is prohibited, including copying, modifying, uploading to other sites and posting online. Timetable data is supplied under a contract with Ekitan; it may not be processed, reused, redistributed or sold without permission from Hankyu and Ekitan, paid or free. Station timetables don't reflect special or holiday-season schedules. Automated access: NOT ON SITE. | link_only; first/last departure only; **HELD — Leon's counsel ruling + operator approval** |
| `keihan` | Keihan Electric Railway | https://www.keihan.co.jp/ | `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | keihan.co.jp/robots.txt: HTTP 200, empty body (0 bytes), no rules | https://www.keihan.co.jp/terms.html | Unless Keihan approves, no data obtained from the service may be copied, sold or published beyond private use, and you may not have a third party do so. Commercial or for-profit use of the service is prohibited unless separately approved. Prohibits unauthorized access to service equipment and anything that disrupts its operation (crawling or scraping is not named explicitly: NOT ON SITE as such). Prohibits IP infringement. No warranty. | link_only; first/last departure only; **HELD — Leon's counsel ruling + operator approval** |
| `jr_intercity` | JR West — intercity rail | https://www.westjr.co.jp/ | `transport.intercity.rail` | `transport.local`, `transport.cruise` | 30 | 25 | westjr.co.jp/robots.txt (200): `User-agent: *`<br>`Disallow: /jin/kisotsu/syousai.html` · timetable.jr-odekake.net/robots.txt (200): `User-Agent: *`<br>`Allow: /` · www.jr-odekake.net/robots.txt: HTTP 404 · eki.jr-odekake.net/robots.txt: 200 but an HTML error page, no rules | https://www.westjr.co.jp/guide/site_policy.html ; plus the notice on every timetable.jr-odekake.net page | As `jr_west` (same operator, same terms). | as `jr_west` (same operator) — **HELD** |
| `jr_central` | JR Central — Tokaido Shinkansen | https://global.jr-central.co.jp/ | `transport.intercity.rail` | `transport.local`, `transport.cruise` | 30 | 25 | global.jr-central.co.jp/robots.txt: HTTP 404, no robots file | https://global.jr-central.co.jp/en/policy/ | Using the site means accepting these terms. Copying, altering, redistributing or publicly transmitting content without permission is prohibited. Publishing site content in other media requires prior approval. Don't present JR Central links in a way that hides the source, e.g. labelling one only "Time Table". Information is valid only as of when it was posted. Automated access: NOT ON SITE. Data use beyond the copyright clause: NOT ON SITE. | link_only; every link labelled **“JR Central Tokaido Shinkansen timetable”** — their terms forbid a bare “Time Table” label |
| `kyoto_travel` | Kyoto City Official Travel Guide | https://kyoto.travel/ | `stop.hours`, `event`, `neighbourhood`, `practicalities` | `lodging`, `dining` | 30 | 25 | kyoto.travel/robots.txt (200): `User-agent: *`<br>`Disallow: /wp-admin/`<br>`Allow: /wp-admin/admin-ajax.php`<br><br>`Sitemap: https://kyoto.travel/sitemap.xml`<br>`Sitemap: https://kyoto.travel/sitemap.rss` | https://kyoto.travel/en/privacy-policy/ (no separate terms page; the copyright text sits in the Privacy Policy) ; related: https://kyoto.travel/en/translation-disclaimer/ | All content is copyrighted by the association; unauthorized use of text or images is prohibited. They try to keep the information current and accept no liability. Most non-Japanese text on the site is machine-translated. Automated access: NOT ON SITE. Data use (re-use of facts/data): NOT ON SITE. | link_only with the quoted fact; **hours = `stale_source`** (below) |

**Ride operators (file §1–3) — robots and terms only.** These are the TC-3 ride sources (migration 369's
official reads). No registry id, cover or ceiling is proposed for them in this sheet.

| Operator | Homepage | Robots (verbatim) | Terms URL | Terms summary |
|---|---|---|---|---|
| Sagano Romantic Train (嵯峨野観光鉄道) | https://www.sagano-kanko.co.jp/ | sagano-kanko.co.jp/robots.txt (200): `User-agent: *`<br>`Disallow: /cms/wp-admin/`<br>`Allow: /cms/wp-admin/admin-ajax.php`<br><br>`Sitemap: https://www.sagano-kanko.co.jp/wp-sitemap.xml` | none on site — © line only | none on site — © line only (footer: "© Sagano Scenic Railway Co.,Ltd."; only a privacy policy, https://www.sagano-kanko.co.jp/policy/) |
| Hozugawa river boat ride (保津川遊船企業組合) | https://www.hozugawakudari.jp/ | hozugawakudari.jp/robots.txt (200): `User-agent: *`<br>`Disallow: /wp-admin/`<br>`Allow: /wp-admin/admin-ajax.php` | none on site — © line only | none on site — © line only (footer: "Copyright © 保津川遊船企業組合 All rights reserved."; only a privacy page, https://www.hozugawakudari.jp/privacy) |
| Eizan Railway (叡山電車) "Kirara" | https://eizandensha.co.jp/ | eizandensha.co.jp/robots.txt (200): `User-agent: *`<br>`Disallow: /wp-admin/`<br>`Allow: /wp-admin/admin-ajax.php`<br><br>`Sitemap: https://eizandensha.co.jp/wp-sitemap.xml` | https://eizandensha.co.jp/terms/ | The company holds copyright in site content (information, materials, images) unless stated otherwise. Commercial or not, copying, reusing, selling, or altering or adapting content beyond what law permits is prohibited without prior individual agreement. Users must not do anything that harms or may harm the company or others, or anything else the company deems inappropriate. Automated access: NOT ON SITE (no explicit clause). The site does not guarantee its content is valid or accurate and accepts no liability. Linking is basically free, but links should point to the top page. |

**SS-1a additions — the temples' own official sites (Phase 0 next; nothing read yet).** Homepages are the
temples' public domains as known, **unconfirmed — check before typing**. Each covers `stop.hours` (the need
`last_admission` is answered under, FD-3) and is proposed `official` / `link_only` like the rest.

| id (type exactly) | Name | Homepage (confirm) | Covers | Refresh (days) | Cost ceiling (¢/day) | Robots / terms |
|---|---|---|---|---|---|---|
| `kiyomizudera` | Kiyomizu-dera | https://www.kiyomizudera.or.jp/ | `stop.hours` | 30 | 25 | NOT READ — Phase 0 |
| `fushimi_inari` | Fushimi Inari Taisha | https://inari.jp/ | `stop.hours` | 30 | 25 | NOT READ — Phase 0 |
| `kinkakuji` | Kinkaku-ji (Rokuon-ji) | https://www.shokoku-ji.jp/kinkakuji/ | `stop.hours` | 30 | 25 | NOT READ — Phase 0 |
| `ginkakuji` | Ginkaku-ji (Jisho-ji) | https://www.shokoku-ji.jp/ginkakuji/ | `stop.hours` | 30 | 25 | NOT READ — Phase 0 |

Kinkaku-ji and Ginkaku-ji share the Shokoku-ji host; two rows on one host is fine (a target must be on its own
row's host, and both are).

### `kyoto.travel` hours are a stale source
The hours the read found on kyoto.travel come from a **2022 article**. They are tagged **`stale_source`** and do
**not** feed findings — FD-3's `after_last_admission` / `closes_before_visit_end` read the temples' own sites
(the four rows above) instead. Two facts, stated: `stale_source` is a **sheet tag today, not a code value** (no
such tag exists under `shared/` or `server/`), and **nothing can feed findings from kyoto.travel now anyway** —
`CONTENT_SOURCE_TARGETS` is empty, so no kyoto.travel hours target exists. Enforcing the tag in code (a source
or target flag the refresh honours) is its own change, not made here.

## Staged facts — `last_service` (not loaded)

**Day type matters.** The JR West pages read were the **Sunday** timetable; **the weekday timetable was NOT
READ**, so no weekday JR West fact is staged. Where this message did not state a day type, the column says so —
confirm it from the file before loading. Times past midnight are kept as written (`24:01`, `0:04`).

These are **staged, not written**: a `last_service` fact is admitted only through `admitFeasibilityFact` (an
https official source URL and a quote that prints the time) once its row is active — and the JR West / Hankyu /
Keihan rows are HELD (above).

| Source row | From | Toward | Last departure | Day type |
|---|---|---|---|---|
| `kyoto_city_transport` | Kyoto (Karasuma line) | Kokusaikaikan | 23:47 | not stated — confirm |
| `kyoto_city_transport` | Kyoto (Karasuma line) | Takeda | 24:01 | not stated — confirm |
| `kyoto_city_transport` | Shijo (Karasuma line) | Kokusaikaikan / Takeda | 23:50 / 23:57 (direction order as given — confirm) | not stated — confirm |
| `kyoto_city_transport` | Sanjo-Keihan (Tozai line) | Rokujizo | 23:58 | not stated — confirm |
| `kyoto_city_transport` | Sanjo-Keihan (Tozai line) | Uzumasa-Tenjingawa | 23:49 | not stated — confirm |
| `jr_west` | Kyoto (Sagano line) | Sonobe | 23:46 | **Sunday** |
| `jr_west` | Saga-Arashiyama | Kyoto | 23:22 | **Sunday** |
| `jr_west` | Inari | Kyoto | 0:04 | **Sunday** |
| `hankyu` | Kyoto-kawaramachi | Osaka-umeda | 23:15 | not stated — confirm |
| `hankyu` | Kyoto-kawaramachi | Katsura | 0:10 | not stated — confirm |
| `hankyu` | Arashiyama | Katsura | 23:51 | not stated — confirm |
| `keihan` | Gion-shijo | Demachiyanagi | 24:28 | not stated — confirm |
| `keihan` | Gion-shijo | Yodoyabashi | 24:11 | not stated — confirm |
| `keihan` | Fushimi-inari | Demachiyanagi | 24:20 | not stated — confirm |
| `keihan` | Fushimi-inari | Yodoyabashi | 24:18 | not stated — confirm |
| `jr_central` | Kyoto (Tokaido Shinkansen, east) | Nagoya | 22:46 | not stated — confirm |
| `jr_central` | Kyoto (Tokaido Shinkansen, east) | Tokyo | 21:38 | not stated — confirm |
| `jr_central` | Kyoto (Tokaido Shinkansen, west) | (last westbound) | 23:32 | not stated — confirm |

Notes on the proposals (each is Leon's to change):
- **Ids** are what `server/config/content-source-targets.config.ts` keys on. A target naming an id no row
  holds fails the coverage report (exit 1) and the nightly census — so type them exactly, or tell me the
  ids you used.
- **`jr_central` is now its own row** (the earlier sheet folded JR Central into `jr_intercity` and noted a
  target must be on its row's own host — `global.jr-central.co.jp` is a different host). `jr_intercity`
  stays JR West's; no fact is staged under it.
- **`kyoto_travel` and `last_admission`:** `last_admission` is a fact TYPE answered under the `stop.hours`
  need (FD-3), so `stop.hours` is the cover that lets it be fetched; there is no separate need to tick.
- **Refresh 30 days** matches the 30-day TTL both feasibility types already carry
  (`server/config/content-facts.config.ts`). Japanese timetables move at the March revision; a shorter
  interval only spends more.
- **Cost ceiling 25¢/day:** one Tavily lookup is 2.4¢ (search 0.8¢ + extract 1.6¢,
  `server/config/trailhead.config.ts`), so 25¢ is ~10 lookups a day per source — enough for a 30-day cycle
  over a few dozen targets. A spend cap, not a rate (§8).
- **`kyoto_city_transport` homepage:** the timetable pages the read used live on `www2.city.kyoto.lg.jp`
  (`/kotsu/tikadia/…`, `/kotsu/busdia/…`), so `https://www2.city.kyoto.lg.jp/kotsu/` stays the homepage. Per the
  file, that URL itself 301s to an `http://www.city.kyoto.lg.jp/…` address that timed out; the bureau top page
  read was `https://www.city.kyoto.lg.jp/kotsu/`, and the city's copyright page is on `www.city.kyoto.lg.jp`.

## Targets (filled after the read)

Per row, the refresh targets are `{ label, url, need, anchor }`:
- operators: one target per line or station last-train page, `need: transport.local.last_service`,
  `anchor: { kind: "station", stationSlug, osmNodeId }` (the station's OpenStreetMap node id, read off
  openstreetmap.org) — the stations the Kyoto spine actually uses first
  (Kyoto, Shijo / Karasuma, Kawaramachi, Gion-Shijo, Sanjo, Fushimi-Inari / Inari, Arashiyama / Saga-Arashiyama);
- `kyoto_travel`: one target per spine top stop's page, `need: stop.hours`,
  `anchor: { kind: "place", placeId }` — the Google `place_id` the plans already store for that stop
  (production's `place_facts` holds one per neighbourhood today; a Replit read gives the ids).

**Ruled for SS-1b (decision-maker, Oct 10, 2026):** a station resolves to a POINT from OpenStreetMap — the
anchor names its OSM node, and SS-1b resolves it ONCE through the path city-event venues use (LD 59), storing
lat/lng on the fact row with "© OpenStreetMap contributors", never from Google Places. No coordinate is typed in
this sheet or the config.
