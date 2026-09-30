# Trend source state — production, 2026-09-30 12:12Z

Read from production `trend_source_config` by the decision-maker (Replit), the first daily cycle after R224 recorded
per-market errors. This is the error text TravelPulse PR 2 and PR 3 were waiting on. It is recorded as read; nothing
here was re-derived.

| Source | State | Action |
|---|---|---|
| `besttime` | 409 `quota_exhausted` — free credits gone | disable until a plan is bought |
| `predicthq` | 401 unauthorized, all 8 markets — key invalid | disable until re-keyed |
| `gdelt` | fetch failed: kyoto, mumbai, bogota, cartagena; 429: jaipur | stays enabled (Trend input only) |
| `x_api` | success | — |
| `wikimedia_pageviews` | success | — |
| `open_meteo` | success | — |
| `nager_date` | success | — |
| `internal_trips` | success | — |

**What it means for the crowd band (PR 2).** The band reads ONLY BestTime foot traffic and PredictHQ attendance.
Both are down, so every market's `crowd_band` is written NULL on the next scoring run and no crowd label renders.
That is the intended behaviour. A disabled source is absent from the resolver's enabled-source weights, and a
failing one has no reading newer than `CROWD_SIGNAL_MAX_AGE_DAYS`. Neither case produces a band from old rows (test
C8). The label comes back on its own once either source is re-keyed and produces a week of readings.

**What it means for the Trend number.** Unaffected: it is weighted across the five sources that succeed plus GDELT
where it answered.
