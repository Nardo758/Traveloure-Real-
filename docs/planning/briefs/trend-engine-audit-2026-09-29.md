## Trend-engine audit — read-only

**The city rail’s Trend number comes from the newer signal resolver. Its Crowd label does not.** The resolver scored all eight operating markets in the latest visible production cycle, but it writes no crowd bands; the displayed bands still come from older `travel_pulse_cities` rows. No files, settings, jobs, or third-party APIs were changed or called for this audit.

Production counts and times below were read on **29 September 2026, about 22:06 UTC**. The log search requested seven days, but the deployment-log result exposed only the current build’s cycle. Older call times below are inferred from database cost-ledger batches, **not verified scheduler-run records**.

### 1. Sources wired

`TravelPulseScheduler.runDailyRefresh()` starts after roughly five minutes plus jitter and repeats every 24 hours. It runs the eight-market ingestion runner, then the score resolver. Each enabled adapter runs independently. The scheduler also primes a **separate legacy trending cache** before ingestion. [`travelpulse-scheduler.service.ts:91–182`](server/services/travelpulse-scheduler.service.ts), [`ingestion-runner.ts:25–104`](server/services/trend-engine/ingestion-runner.ts).

| Source | Request and geography | Writes; cost accounting | Latest production result |
|---|---|---|---|
| **X** | `GET /2/tweets/counts/recent`; eight city-name text queries, English, excluding retweets; 48-hour lookback, hourly counts. No geo radius. [`x-api.adapter.ts:50–100,163–200`](server/services/trend-engine/adapters/x-api.adapter.ts) | `trend_signals`: `x_mention_count`, `x_post_velocity`; no tweet text/IDs. Cost-ledger rate **0¢**. | 608 signal rows; newest observation Sep 28. Latest run reported 0 errors. |
| **PredictHQ** | `/v1/events/count/` and `/v1/events/`; selected event categories, one day, **50 km around each market centroid**. [`predicthq.adapter.ts:43–117,188–204`](server/services/trend-engine/adapters/predicthq.adapter.ts) | `trend_signals`: event count, top rank, attendance forecast. `raw_ref` also stores top-event details. Cost-ledger rate **0¢**. | 174 rows; newest observation **Aug 29**. Latest run reported **8 errors, 0 inserts**. |
| **BestTime** | `POST /api/v1/forecasts` and `/forecasts/live`; one named anchor venue per market, not a neighbourhood/radius query. [`besttime.adapter.ts:39–60,74–127,141–228`](server/services/trend-engine/adapters/besttime.adapter.ts) | May update `trend_entities.besttime_venue_id`; intended forecast mean/peak/live signals, with raw venue/pattern fields. Forecast accounting **1¢ per call**, live **0¢**. | **0 signal rows** and no stored venue IDs across the eight entities. Latest run reported **8 errors, 0 inserts**. |
| **Wikimedia** | Wikipedia per-article daily pageviews for resolved market titles; daily ingestion asks for D−3. [`wikimedia-pageviews.adapter.ts:27–62,102–109`](server/services/trend-engine/adapters/wikimedia-pageviews.adapter.ts) | `pageview_count`; 0¢. | 304 rows; newest Sep 26. |
| **GDELT** | `/api/v2/doc/doc`, city name plus `sourcelang:english`, timeline volume; market-level text query. [`gdelt.adapter.ts:28–75,133–186`](server/services/trend-engine/adapters/gdelt.adapter.ts) | Article and mention counts; 0¢. | 300 rows; newest Sep 29. Latest run: **6 errors**, 4 reported inserts. |
| **Nager.Date** | Public holidays by year and market country code. [`nager-date.adapter.ts:8–40,90–151`](server/services/trend-engine/adapters/nager-date.adapter.ts) | `public_holiday`; 0¢. | 304 rows; newest Sep 28. |
| **Open-Meteo** | Historical/forecast daily temperature and precipitation at market centroids. [`open-meteo.adapter.ts:26–79,85–147`](server/services/trend-engine/adapters/open-meteo.adapter.ts) | Temperature and precipitation signals; 0¢. | 608 rows; newest Sep 28. |
| **Internal trips** | Reads trip destination, date, and status from the project database; no external API. [`internal-trips.adapter.ts:56–94,136–174`](server/services/trend-engine/adapters/internal-trips.adapter.ts) | Active-traveler and upcoming-trip count signals; 0¢. | 608 rows; newest Sep 28. |

The supplied environment inventory lists `X_BEARER_TOKEN`, `PREDICTHQ_API_KEY`, `BESTTIME_API_KEY`, and `XAI_API_KEY`. Their values were **not accessed**, so this establishes configured names, not credential validity. X has recent rows; PredictHQ has historical rows but no new rows in the latest run; BestTime has a caller and accounting entries but no signal rows. Public Wikimedia, GDELT, Nager.Date, and Open-Meteo adapters do not require keys. All adapter calls pass through the pre-call cost enforcer, which records `api_usage_logs` and checks monthly ceilings; its logging failure is swallowed rather than blocking a call. [`cost-enforcement.ts:42–138`](server/services/trend-engine/cost-enforcement.ts). September’s production ledger records **1,624 BestTime checks / 1,624 estimated cents**; these are estimates recorded before calls, **not evidence of successful responses or a provider invoice**. The other seven source endpoints record 0 estimated cents.

**Legacy call still present:** despite Grok’s removal from *city scoring*, the scheduler’s cache-prime step calls `getTrendingDestinations()` for each market. On a cache miss, that method calls the configured Grok chat client with a city-name prompt and would write `travel_pulse_trending`; it does **not** use the trend-engine cost enforcer. The visible production cycle logged six 403 credit/spending-limit failures on this path. [`travelpulse-scheduler.service.ts:122–130`](server/services/travelpulse-scheduler.service.ts), [`travelpulse.service.ts:66–88,91–205`](server/services/travelpulse.service.ts).

The latest **verified scheduler start** in the available logs was **Sep 29, 20:52:43 UTC**. The last three *inferred API-accounting batch starts* were:

| Source | Newest → older, Sep 29 UTC |
|---|---|
| Wikimedia | 20:53:49 · 19:19:04 · 17:20:16 |
| GDELT | 20:54:04 · 19:19:38 · 17:20:40 |
| Nager.Date | 21:00:29 · 19:25:08 · 17:23:36 |
| Open-Meteo | 21:00:40 · 19:25:14 · 17:23:46 |
| Internal trips | 21:00:51 · 19:25:27 · 17:23:55 |
| BestTime | 21:01:01 · 19:25:33 · 17:24:02 |
| PredictHQ | 21:01:11 · 19:25:39 · 17:24:09 |
| X | 21:01:24 · 19:25:46 · 17:24:15 |

Those times are groups of `api_usage_logs.created_at` entries separated by over 30 minutes. Redeploys or repeated runs can produce multiple batches in a day; there is no three-run job ledger here from which to certify three scheduler starts.

### 2. Tables

The following is the **direct scoring, cost, and city-display path**. Dates are production `observed_at`, `computed_at`, or `created_at` unless a different field is named; “—” means that table has no applicable timestamp column or no rows.

| Table | Columns used by this path | Production rows; oldest → newest |
|---|---|---|
| `trend_entities` | Entity type/internal market ID, external resolution IDs and titles, BestTime venue ID, X query, timestamps | **8**; created Aug 21 → Aug 21 |
| `trend_signals` | Entity ID, source, metric, value, `observed_at`, `ingested_at`, resale class, surface origin, `raw_ref`, pre-launch flag | **2,906**; observed Aug 20 → Sep 29 |
| `trend_source_config` | Source, enabled, weight, decay half-life, cost ceiling, resale class, health/halt and last-run fields, timestamps | **8**; created Aug 21 → Aug 23 |
| `market_season_calendars` | Market/season keys, date range, expected-demand multiplier, weather adjustment | **30**; no timestamp column |
| `crowd_band_config` | Entity type, band, lower-bound-versus-baseline | **20**; no timestamp column; current resolver does not write a band |
| `trend_scores` | Entity ID, score/confidence, crowd band/confidence, contributing sources, explanation fields, seasonal expected, computation time/run ID | **8**; computed Sep 29 21:01:34 → 21:01:44 |
| `api_usage_logs` | Provider, endpoint, operation, request/cost/success/error fields, metadata, `created_at` | **21,223 total**; Jan 29 → Sep 29. Of these, September has 1,624 BestTime checks. |
| `trips` | The internal adapter reads destination, trip dates/status and counts; the table also holds traveler/author and other trip fields | **298**; created Jan 31 → Sep 24 |
| `travel_pulse_cities` | City identity, stored `pulse_score`/`trending_score`/`crowd_level`, imagery and city detail, update/AI timestamps | **21**; created Jan 20 → Feb 2; `last_updated` Aug 24 → Sep 2 |
| `travel_pulse_trending` | Legacy destination trend, mention/sentiment/forecast fields, detection/update/expiry timestamps | **6,948**; detected Jan 20 → Sep 2; legacy cache reader/writer remains, but its current cache-prime calls failed in the visible cycle |
| `city_neighborhoods` | City, name/slug, centroid, radius, adjacency and timestamps | **100**; created Jun 14 → Sep 1. Entity resolution can use these, but the production signal entities are market-only. |

Core schemas and their readers/writers are declared at [`shared/schema.ts:11736–11889`](shared/schema.ts) and implemented by the adapters, [`trend-score.service.ts:214–313`](server/services/trend-engine/trend-score.service.ts), and [`travelpulse.service.ts:573–643`](server/services/travelpulse.service.ts). The scheduler also invokes adjacent demand-signal and destination-trend routines before the scored path; their outputs are **not inputs to the Trend number formula traced here**. [`travelpulse-scheduler.service.ts:119–182`](server/services/travelpulse-scheduler.service.ts).

For completeness, older TravelPulse feature tables exist in production: `travel_pulse_hidden_gems` **771**, `travel_pulse_calendar_events` **20**, `travel_pulse_happening_now` **3**, `travel_pulse_city_alerts` **3**, `travel_pulse_live_activity` **8**; `travel_pulse_live_scores`, `travel_pulse_crowd_forecasts`, `travel_pulse_truth_checks`, and `travel_pulse_discovery_scores` each have **0**. These are adjacent legacy city-detail features, **not rows feeding the current market trend resolver**. A current writer for each historical nonzero table was not established by this audit; their row presence must not be taken as evidence of ongoing ingestion. `trend_signals` has a BestTime writer but **no BestTime rows**.

### 3. The numbers on the page

For each market, the resolver reads eligible `trend_signals` from the trailing **90 days**, excludes `surface_origin` rows, and groups by source and metric. For each group with a positive mean baseline:

`deviation = newest value ÷ 90-day mean`  
`effective weight = configured source weight × 2^(−age in days ÷ configured half-life)`  
`raw trend score = weighted mean of deviations ÷ current seasonal expected multiplier`

It rounds that result to three decimals. Confidence combines source breadth **50%**, signal density **30%**, and baseline depth **20%**; below **0.30** confidence, the score is null/unranked. Missing groups or non-positive baselines are **excluded, not zero-filled**. An older observation can remain eligible within 90 days, with decaying weight. [`trend-score.service.ts:34–44,109–193,248–313`](server/services/trend-engine/trend-score.service.ts).

`getTrendingCities()` maps a ranked resolver score to the page’s integer **`Trend N = clamp(round(score × 50), 0, 100)`** and sorts ranked markets by resolver score. Unranked or absent resolver data maps to **0**, which the rail suppresses rather than printing as a trend claim. Thus production Goa’s stored resolver score **2.071** maps to **Trend 100**. [`travelpulse.service.ts:573–643`](server/services/travelpulse.service.ts), [`cities-rail.tsx:72–103`](client/src/components/landing/cities-rail.tsx). The rail takes the API’s sorted eight markets, shows four at once, and rotates the visible window every eight seconds; it does not recompute scores. [`cities-rail.tsx:2–46`](client/src/components/landing/cities-rail.tsx).

**`Crowd <band>` is not calculated from BestTime or PredictHQ today.** The resolver explicitly writes `crowd_band: null`; the city API spreads the older `travel_pulse_cities` row and changes its `trendingScore`, leaving that row’s `crowdLevel` intact. Production Goa’s legacy row says `moderate`. [`trend-score.service.ts:285–309`](server/services/trend-engine/trend-score.service.ts), [`travelpulse.service.ts:605–631`](server/services/travelpulse.service.ts). The eight operating-market legacy rows were last updated between **Aug 31 and Sep 2**.

The landing hero takes the selected billboard market, then the matching TravelPulse city; its payload copies that city’s mapped `trendingScore` and legacy `crowdLevel`. If no billboard market qualifies, it returns an empty hero payload; if only a directly observed city fallback is available, it omits unearned trend/crowd claims. [`landing.routes.ts:107–168`](server/routes/landing.routes.ts), [`landing-hero.compose.ts:109–128`](server/services/landing-hero.compose.ts), [`landing-hero.tsx:598–607`](client/src/components/landing/landing-hero.tsx). **This is distinct from the destination-page eyebrow**, which labels the legacy `pulseScore` as “TREND,” not the resolver-mapped `trendingScore`. [`discover-location.tsx:145–149,181–188`](client/src/pages/discover-location.tsx).

### 4. Display of restricted data

I found **no public route in the traced city/landing path returning a raw PredictHQ or BestTime signal value or `raw_ref`**. Public `/api/travelpulse/cities` returns city rows with a derived `trendingScore` and the legacy crowd field; `/api/landing/hero` returns the selected city’s derived trend and legacy crowd. [`content.routes.ts:5655–5683`](server/routes/content.routes.ts), [`travelpulse.service.ts:581–631`](server/services/travelpulse.service.ts), [`landing-hero.compose.ts:109–128`](server/services/landing-hero.compose.ts). PredictHQ event details and BestTime raw fields are nevertheless designed to be stored in internal `trend_signals.raw_ref`; absence from these public responses is **not** a claim that the internal fields are empty. [`predicthq.adapter.ts:133–163`](server/services/trend-engine/adapters/predicthq.adapter.ts), [`besttime.adapter.ts:180–228`](server/services/trend-engine/adapters/besttime.adapter.ts).

### 5. Freshness and failure

The newest **observed signal per market**, from production (not ingestion or score-computation time):

| Market | Sources with rows | Newest observation | Age at read |
|---|---:|---|---:|
| Bogotá | 7 | Sep 29 12:00 UTC | 10.1 h |
| Cartagena | 7 | Sep 29 12:00 UTC | 10.1 h |
| Edinburgh | 7 | Sep 29 12:00 UTC | 10.1 h |
| Goa | 6 | Sep 28 12:00 UTC | 34.1 h |
| Jaipur | 7 | Sep 28 12:00 UTC | 34.1 h |
| Kyoto | 7 | Sep 29 12:00 UTC | 10.1 h |
| Mumbai | 7 | Sep 28 12:00 UTC | 34.1 h |
| Porto | 7 | Sep 28 12:00 UTC | 34.1 h |

If ingestion stops, the page can keep showing the **last materialized `trend_scores`**; the city read path does not check their age. The separate legacy crowd field also remains. The hero response sets a five-minute HTTP cache; if it cannot select a qualified market, its live city fields are empty. If the city rail API returns no cities, the component renders nothing. [`travelpulse.service.ts:573–643`](server/services/travelpulse.service.ts), [`landing.routes.ts:119–121,160–168`](server/routes/landing.routes.ts), [`cities-rail.tsx:36–43`](client/src/components/landing/cities-rail.tsx).

Deduplicated **visible deployment-log lines** matching this cycle’s failures, with counts; the team identifier in the first line is redacted here:

| Count | Log line |
|---:|---|
| 6 | `Error fetching trending destinations: $S [Error]: 403 "Your team [redacted] has either used all available credits or reached its monthly spending limit. To continue making API requests, please purchase more credits or raise your spending limit."` |
| 1 | `[IngestionRunner] gdelt: inserted=4 skipped=288 halted=false errors=6` |
| 1 | `[IngestionRunner] besttime: inserted=0 skipped=0 halted=false errors=8` |
| 1 | `[IngestionRunner] predicthq: inserted=0 skipped=0 halted=false errors=8` |

The adapter summaries give error **counts**, not the eight individual BestTime/PredictHQ error messages. Their production config rows nevertheless say `last_run_status=success` with blank `last_run_error`; a completed adapter return with per-market errors is not the same as a thrown runner failure. [`ingestion-runner.ts:63–104`](server/services/trend-engine/ingestion-runner.ts). No failed `api_usage_logs` rows were returned for the last seven days; that ledger is written before calls and cannot establish response success. The accessible deployment logs do **not** support a claim that the rest of the requested seven-day period was error-free.

### 6. TravelPulse weekly

A `travelpulse_weekly` **post type and manual draft/publish path exist**. [`shared/blog.ts:7–33`](shared/blog.ts), [`blog-posts.service.ts:122–166,281–304`](server/services/blog-posts.service.ts), [`blog.routes.ts:97–126`](server/routes/blog.routes.ts). I found **no weekly post generator or weekly scheduler invocation**; the TravelPulse scheduler is daily and does not call the blog service. Production has **0 `blog_posts` and 0 `blog_post_sources` rows**, so there is no evidence of a weekly post ever running or being published there. The BestTime adapter’s rolling weekly forecast is a different mechanism, not a weekly post.

### 7. Coverage

Production has **eight market entities and zero neighbourhood entities/signals** in this trend spine. Existing `city_neighborhoods` rows do not make the signals neighbourhood-granular. Market coverage is:

| Market | Sources with any rows |
|---|---|
| Bogotá, Cartagena, Edinburgh, Jaipur, Kyoto, Mumbai, Porto | GDELT, internal trips, Nager.Date, Open-Meteo, PredictHQ, Wikimedia, X |
| Goa | Internal trips, Nager.Date, Open-Meteo, PredictHQ, Wikimedia, X; **no GDELT rows** |

**BestTime has no rows in any market.** PredictHQ has rows in all eight, but its newest stored observation is **Aug 29**. The distinction matters: an enabled source, a recorded pre-call cost check, a successful runner status, and a fresh usable signal are four different claims.
