# SS-1 — Kyoto source registry entry sheet (for Leon, `/admin/content-sources`)

SS-1 rulings 1–5 (decision-maker, Oct 10, 2026). Ledger `2026-10-10-ss1a-registry-entry-sheet` (R415).
Leon reads each terms page, types the row in `/admin/content-sources` (R251), then activates — the
activation IS the terms check, and it is his.

> **Read pass (decision-maker, Oct 11, 2026 — the founder's research file §4–9).** The rulings below on
> license, labels, day types and staged facts come from that pass. **Robots (verbatim), the terms URL and the
> terms summary are in the file and were NOT in this session** (this environment still reaches no external
> host, and the file was not attached) — so those three columns read `FROM FILE — paste`, never a guess.
> Paste §4–9's text and they are filled exactly as written.

## Rows

All rows: `market = kyoto`, `adapter = tavily_extract`. **`license_class = official`, reuse `link_only`**
(the fixed LD 65 mapping official → link_only; `link_only` is a reuse class, not a license class — the
registry's license values are `official | editorial | partner | restricted`).

| id (type exactly) | Name | Homepage | Covers | Does not cover | Refresh (days) | Cost ceiling (¢/day) | Robots (verbatim) | Terms URL | Terms summary | Use ruled |
|---|---|---|---|---|---|---|---|---|---|---|
| `kyoto_city_transport` | Kyoto City Transportation Bureau (City Bus & Subway) | https://www2.city.kyoto.lg.jp/kotsu/ | `transport.local`, `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | FROM FILE — paste | FROM FILE — paste | FROM FILE — paste | link_only with the quoted fact |
| `jr_west` | JR West — Kyoto-area lines | https://www.westjr.co.jp/ | `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | FROM FILE — paste | FROM FILE — paste | FROM FILE — paste | link_only; first/last departure only; **HELD — Leon's counsel ruling + operator approval** |
| `hankyu` | Hankyu Railway | https://www.hankyu.co.jp/ | `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | FROM FILE — paste | FROM FILE — paste | FROM FILE — paste | link_only; first/last departure only; **HELD — Leon's counsel ruling + operator approval** |
| `keihan` | Keihan Electric Railway | https://www.keihan.co.jp/ | `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | FROM FILE — paste | FROM FILE — paste | FROM FILE — paste | link_only; first/last departure only; **HELD — Leon's counsel ruling + operator approval** |
| `jr_intercity` | JR West — intercity rail | https://www.westjr.co.jp/ | `transport.intercity.rail` | `transport.local`, `transport.cruise` | 30 | 25 | FROM FILE — paste | FROM FILE — paste | FROM FILE — paste | as `jr_west` (same operator) — **HELD** |
| `jr_central` | JR Central — Tokaido Shinkansen | https://global.jr-central.co.jp/ | `transport.intercity.rail` | `transport.local`, `transport.cruise` | 30 | 25 | FROM FILE — paste | FROM FILE — paste | FROM FILE — paste | link_only; every link labelled **“JR Central Tokaido Shinkansen timetable”** — their terms forbid a bare “Time Table” label |
| `kyoto_travel` | Kyoto City Official Travel Guide | https://kyoto.travel/ | `stop.hours`, `event`, `neighbourhood`, `practicalities` | `lodging`, `dining` | 30 | 25 | FROM FILE — paste | FROM FILE — paste | FROM FILE — paste | link_only with the quoted fact; **hours = `stale_source`** (below) |

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
- **`kyoto_city_transport` homepage:** the bureau's pages sit under `www2.city.kyoto.lg.jp/kotsu/`; the
  target check accepts subdomains of the homepage host, so the homepage should be the host the timetable
  pages actually live on — confirm from the file's terms URL.

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
