# Kyoto sources — batch 1: the values Leon enters

**Status:** reference only. No code reads this file, no migration or script inserts these rows, and nothing here
activates or approves a source. Ledger `2026-10-18-kyoto-sources-batch-1`.

**How it is used (decision-maker, Oct 18, 2026):** Leon enters these rows by hand through `/admin/content-sources`,
once CS-1 item 1 (sign-off status, terms class, automated access, credit text, per-place `no_photos`) is on
production. **His entry is the sign-off.** LD 57's A6 rule stands unamended: a source is added by an admin through
the surface, never by a deploy, and is born inactive with no terms check.

**Where the values come from:**
- the repo index, `docs/planning/briefs/content-sources/content_sources.seed.csv` (rows `kyoto_travel`, `jnto`,
  `kyoto_city_transport`, `jr_west`, `jr_central`, and the `kyoto_stop_official` template);
- Ops Bot's sheet "Kyoto source sign-off — batch 1 (Oct 17)", for the terms class, automated access, credit and
  expiry trigger.

When the two disagree, the batch-1 sheet wins for those fields. Where neither source states a value, the field is
written **(leave blank)** and nothing is invented.

## How to read the fields

**Today's form** (`createContentSourceBody`, `server/services/content-sources.service.ts`):
- `id` — lower-case letters, digits and underscores.
- `name`, `homepage`, `market`, `termsUrl`, `notes`.
- `adapter` — one of `tavily_crawl`, `tavily_extract`, `api`, `affiliate_feed`, `manual`.
- `covers` / `doesNotCover` — needs or named sub-needs only.
- `licenseClass` — one of `official`, `editorial`, `partner`, `restricted`.
- `robotsOk`, `refreshIntervalDays`, `costCeilingCentsPerDay`.

**CS-1 item 1 fields** (not on the form until item 1 ships):
- `terms_class` — one of `store`, `extract`, `link_out`, `link_out_no_link`.
- `automated_access_allowed`.
- `credit_text`.
- the per-place `no_photos` flag.

**Left blank on every row:**
- `refreshIntervalDays` and `costCeilingCentsPerDay`. Setting both lets the scheduled official refresh fetch the
  source once it is active (SS-1b). A refresh needs its own targets and is a separate decision.
- `terms_checked_at` and `active`. Activation is Leon's own action, after his terms check.

**Expiry.** The "expiry trigger" lines are the sheet's proposals, for the reviewer. Under CS-1, a safety fact (last
service, last admission, closures, timetables) needs the reviewer to enter its expiry trigger; there is no default.
Where a site states no expiry, 90 days is the cap.

---

## 1. `kyoto_travel` — Kyoto City Official Travel Guide

| Field | Value |
|---|---|
| id | `kyoto_travel` |
| name | Kyoto City Official Travel Guide |
| homepage | `https://kyoto.travel/en/` |
| market | `kyoto` |
| adapter | `tavily_extract` |
| covers | `stop.hours`, `event`, `neighbourhood`, `practicalities` |
| doesNotCover | `lodging`, `dining`, `transport.intercity`, `stop.ticketing` |
| licenseClass | `official` |
| termsUrl | (leave blank — not found yet) |
| robotsOk | (leave blank — not checked in batch 1) |
| notes | City tourism body. Seasonal notices, festival dates, area guides. Content pages: `https://kyoto.travel/en/event/` (events); `https://kyoto.travel/en/see-and-do/` (sites and areas). Extract specific pages; never crawl. |
| **terms_class** | (leave blank — not in batch 1; set at Leon's terms check) |
| **automated_access_allowed** | (leave blank — not in batch 1) |
| **credit_text** | (leave blank — not in batch 1) |

## 2. `jnto` — Japan National Tourism Organization

| Field | Value |
|---|---|
| id | `jnto` |
| name | Japan National Tourism Organization |
| homepage | `https://www.japan.travel/en/` |
| market | `kyoto` |
| adapter | `tavily_extract` |
| covers | `practicalities`, `event`, `stop.hours` |
| doesNotCover | `lodging`, `dining`, `transport.local` |
| licenseClass | `official` |
| termsUrl | (leave blank — not found yet) |
| robotsOk | (leave blank — not checked in batch 1) |
| notes | National body. Practicalities (visa, SIM, money, etiquette) and major-site hours. Content pages: `https://www.japan.travel/en/destinations/kansai/kyoto/`; `https://www.japan.travel/en/plan/`. Its press/media image library has separate terms and is not covered by this row. |
| **terms_class** | (leave blank — not in batch 1; set at Leon's terms check) |
| **automated_access_allowed** | (leave blank — not in batch 1) |
| **credit_text** | (leave blank — not in batch 1) |

## 3. `kyoto_city_transport` — Kyoto City Transportation Bureau (bus and subway)

| Field | Value |
|---|---|
| id | `kyoto_city_transport` |
| name | Kyoto City Transportation Bureau (bus & subway) |
| homepage | `https://www2.city.kyoto.lg.jp/kotsu/webguide/en/` |
| market | `kyoto` |
| adapter | `tavily_extract` |
| covers | `transport.local` (covers its sub-needs, including `transport.local.last_service`) |
| doesNotCover | `transport.intercity`, `lodging`, `activity` |
| licenseClass | `official` |
| termsUrl | `https://www.city.kyoto.lg.jp/main/site_policy/0000000005.html` |
| robotsOk | `true` (`www2.city.kyoto.lg.jp/robots.txt`: `User-Agent: *` with no `Disallow`) |
| notes | Bus and subway lines, passes, last services; the webguide pages only. Never use screenshots or logos (the terms refuse them). Expiry trigger: each March timetable revision (confirm the date) and any fare change; registry recheck every 30 days; event-day and seasonal extra services as posted. The ODPT GTFS feed is a separate source under a separate licence; it is not this row. |
| **terms_class** | `extract` |
| **automated_access_allowed** | yes |
| **credit_text** | Source: Kyoto City Transportation Bureau (京都市交通局), checked \<date\> |

## 4. `jr_west` — JR West

| Field | Value |
|---|---|
| id | `jr_west` |
| name | JR West |
| homepage | `https://www.westjr.co.jp/global/en/` |
| market | `kyoto` |
| adapter | `manual` (a link-out source is never extracted, so no fetch adapter) |
| covers | `transport.intercity.rail` |
| doesNotCover | `transport.local`, `lodging`, `activity` |
| licenseClass | `official` |
| termsUrl | `https://www.westjr.co.jp/guide/site_policy.html` |
| robotsOk | `true` (only `/jin/kisotsu/syousai.html` disallowed) |
| notes | Kyoto–Osaka–Kobe–Kansai Airport rail. Link out only: no stored fact or price. A finding names JR West and links its top page, `https://www.westjr.co.jp/`, opened in a new window, never framed. Expiry trigger for anything a person records from it: each March JR timetable revision and any fare or pass revision; registry recheck every 30 days. |
| **terms_class** | `link_out` |
| **automated_access_allowed** | yes by robots, not used (link out) |
| **credit_text** | JR West |

## 5. `jr_central` — JR Central

Registration is not extraction. The row exists to **name and credit** the source in findings, never to read it, so it
does not conflict with CS-1.

| Field | Value |
|---|---|
| id | `jr_central` |
| name | JR Central |
| homepage | `https://global.jr-central.co.jp/en/` |
| market | `kyoto` |
| adapter | `manual` |
| covers | `transport.intercity.rail` |
| doesNotCover | `transport.local`, `lodging`, `activity` |
| licenseClass | `official` |
| termsUrl | `https://jr-central.co.jp/policy/` (JP, binding; EN: `https://global.jr-central.co.jp/en/policy/`) |
| robotsOk | `true` (no scraping clause; not used) |
| notes | Tokaido Shinkansen (Tokyo–Kyoto). **Named in plain text with no URL** until counsel or JR Central clears linking (its terms refuse links "that seek profit"). Never read, never extracted, no stored fact or price. The name is always "JR Central" or "Central Japan Railway Company", never a bare "Time Table". Expiry trigger for any last-train fact a person records: the next March timetable revision (the basic timetable runs from 2026-03-14; confirm the date from JR Central's announcement) and any seasonal or extra-train notice. |
| **terms_class** | `link_out_no_link` |
| **automated_access_allowed** | not used |
| **credit_text** | JR Central |

## 6. `kyoto_stop_official` rows — one per LD 65 site

The index's `kyoto_stop_official` is a template. Each registered stop becomes its own row. The three sites it names
are below.

### 6a. `kyoto_stop_fushimi_inari` — Fushimi Inari Taisha

| Field | Value |
|---|---|
| id | `kyoto_stop_fushimi_inari` |
| name | Fushimi Inari Taisha (official site) |
| homepage | `https://inari.jp/en/` |
| market | `kyoto` |
| adapter | `manual` (a link-out source is never extracted, so no fetch adapter) |
| covers | `stop.hours`, `stop.ticketing` |
| doesNotCover | `lodging`, `transport.intercity`, `transport.local`, `transport.cruise`, `dining`, `activity`, `event`, `practicalities`, `neighbourhood` |
| licenseClass | `official` |
| termsUrl | (leave blank — no separate terms page; the rule is in every page's footer) |
| robotsOk | `true` (only `/wp/wp-admin/` disallowed) |
| notes | Link out only: the footer refuses any reuse of the site's information or images without permission. The official site publishes no closing time for the grounds, so a plan never shows a last admission for it. Expiry trigger: recheck each December, before the New Year counter hours are posted; terms recheck annually. |
| **terms_class** | `link_out` |
| **automated_access_allowed** | yes by robots, not used (link out) |
| **credit_text** | Fushimi Inari Taisha official site |

### 6b. `kyoto_stop_kiyomizu_dera` — Kiyomizu-dera

| Field | Value |
|---|---|
| id | `kyoto_stop_kiyomizu_dera` |
| name | Kiyomizu-dera (official site) |
| homepage | `https://www.kiyomizudera.or.jp/en/` |
| market | `kyoto` |
| adapter | `tavily_extract` |
| covers | `stop.hours`, `stop.ticketing` |
| doesNotCover | `lodging`, `transport.intercity`, `transport.local`, `transport.cruise`, `dining`, `activity`, `event`, `practicalities`, `neighbourhood` |
| licenseClass | `official` |
| termsUrl | (leave blank — no terms published) |
| robotsOk | `true` (only `/cms/wp-admin/` disallowed) |
| notes | Extract, never crawl. Hours page: `https://www.kiyomizudera.or.jp/news/open-hour.php`. Expiry trigger: at each seasonal change (July–August closing 18:30; night special viewings with 21:00 last entry, including autumn Nov 21–30 in the 2026 table); recheck at the end of foliage season (December) and when next year's table is posted; terms annually. |
| **terms_class** | `extract` |
| **automated_access_allowed** | yes |
| **credit_text** | Source: Kiyomizu-dera official site, checked \<date\> |
| **no_photos (on the place)** | **on** — the temple's FAQ refuses profit-related filming on the grounds; this blocks every image of it, including expert and provider uploads |

### 6c. `kyoto_stop_kinkaku_ji` — Kinkaku-ji

| Field | Value |
|---|---|
| id | `kyoto_stop_kinkaku_ji` |
| name | Kinkaku-ji (Shokoku-ji official page) |
| homepage | `https://www.shokoku-ji.jp/en/kinkakuji/` |
| market | `kyoto` |
| adapter | `tavily_extract` |
| covers | `stop.hours`, `stop.ticketing` |
| doesNotCover | `lodging`, `transport.intercity`, `transport.local`, `transport.cruise`, `dining`, `activity`, `event`, `practicalities`, `neighbourhood` |
| licenseClass | `official` |
| termsUrl | (leave blank — no terms published; privacy policy only) |
| robotsOk | `true` (only `/wp-admin/` disallowed) |
| notes | Extract, never crawl. Hours 9:00–17:00, open every day (「年中無休」, checked 2026-10-18 JST). Expiry trigger: the 7-day hours TTL; also recheck on any special-closure notice; terms annually. |
| **terms_class** | `extract` |
| **automated_access_allowed** | yes |
| **credit_text** | Source: Kinkaku-ji (Shokoku-ji) official site, checked \<date\> |
| **no_photos (on the place)** | **on** — the temple's FAQ refuses filming for publication to third parties or for profit; this blocks every image of it, including expert and provider uploads |

---

## Not in this batch

The sheet's priority-2 rows are not entered here: Booking.com affiliate, Editorial local #1, GetYourGuide, Google
Places and Google Routes. Each has terms still marked UNKNOWN, and the sheet notes the Google strict-reading conflict
for Leon.
