# SS-1 — Kyoto source registry entry sheet (for Leon, `/admin/content-sources`)

SS-1 rulings 1–5 (decision-maker, Oct 10, 2026). Ledger `2026-10-10-ss1a-registry-entry-sheet` (R415).
Leon reads each terms page, types the row in `/admin/content-sources` (R251), then activates — the
activation IS the terms check, and it is his.

> **Not read in this session — stated, not guessed.** The session that wrote this sheet had no route to
> the open web (the cloud environment's network policy denies every external host). So the **robots
> result**, the **terms URL** and the **terms summary** columns below are **NOT READ**, and no refresh
> target url is filled in. They are read in the next pass once the environment allows these hosts:
> `kyoto.travel`, `www2.city.kyoto.lg.jp`, `www.westjr.co.jp`, `global.jr-central.co.jp`, `www.hankyu.co.jp`,
> `www.keihan.co.jp`. Homepages below are the operators' public domains; confirm each before typing.

## Rows

All rows: `market = kyoto`, `adapter = tavily_extract`, `license_class = official` (proposed — Leon's check).

| id (type exactly) | Name | Homepage | Covers | Does not cover | Refresh (days) | Cost ceiling (¢/day) | Robots | Terms URL / summary |
|---|---|---|---|---|---|---|---|---|
| `kyoto_city_transport` | Kyoto City Transportation Bureau (City Bus & Subway) | https://www2.city.kyoto.lg.jp/kotsu/ | `transport.local`, `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | NOT READ | NOT READ |
| `jr_west` | JR West — Kyoto-area lines | https://www.westjr.co.jp/ | `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | NOT READ | NOT READ |
| `hankyu` | Hankyu Railway | https://www.hankyu.co.jp/ | `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | NOT READ | NOT READ |
| `keihan` | Keihan Electric Railway | https://www.keihan.co.jp/ | `transport.local.last_service` | `transport.intercity`, `transport.cruise` | 30 | 25 | NOT READ | NOT READ |
| `jr_intercity` | JR West / JR Central — intercity rail | https://www.westjr.co.jp/ | `transport.intercity.rail` | `transport.local`, `transport.cruise` | 30 | 25 | NOT READ | NOT READ |
| `kyoto_travel` | Kyoto City Official Travel Guide | https://kyoto.travel/ | `stop.hours`, `event`, `neighbourhood`, `practicalities` | `lodging`, `dining` | 30 | 25 | NOT READ | NOT READ |

Notes on the proposals (each is Leon's to change):
- **Ids** are what `server/config/content-source-targets.config.ts` keys on. A target naming an id no row
  holds fails the coverage report (exit 1) and the nightly census — so type them exactly, or tell me the
  ids you used.
- **`jr_intercity`** is the separate row ruling 3 asks for; its homepage is JR West's because JR Central's
  English site is a different host (`global.jr-central.co.jp`) — if you want JR Central's pages fetched,
  it needs its own row, since a target must be on its row's own host.
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
  pages actually live on — confirm when the site is readable.

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
