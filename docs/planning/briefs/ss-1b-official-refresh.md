# SS-1b — the market-level official refresh (rulings Oct 10, 2026)

Ledger `2026-10-10-ss1b-official-refresh` (R?). Built on SS-1a (`2026-10-10-ss1a-registry-entry-sheet`): the
targets config and `validateTargets`. No migration.

## Ruling 1 (decision-maker, Oct 10, 2026)
A new spend path beside A6-3A, bounded: a scheduled job fetches each active, official, terms-checked source with
`refresh_interval_days` set, on that interval, within `cost_ceiling_cents_per_day`, outside any plan. Facts carry
`origin='official_refresh'`, `source_id`, the official source URL, a verbatim quote, `verified_at`, and
`expires_at = verified_at + refresh_interval_days`. The free draft's own budget stays 0; it only reads what the
refresh stored. The adapter's `tripId` requirement becomes optional for this origin — the call is market-scoped;
the plan-scoped path is unchanged.

## Ruling 2 (decision-maker, Oct 10, 2026) — station coordinates
"The targets config anchor carries `{ stationSlug, osmNodeId }`; SS-1b resolves each station once via the same
path city-event venues use, stores lat/lng with OSM attribution on the fact row, never from Places."

## Wording approved
"LD 57 amendment approved — Leon" (Oct 10, 2026): station facts may carry an OSM-attributed coordinate.

## Built
| Piece | Where |
|---|---|
| Origin + the ONE page-read predicate | `shared/content-facts.ts` — `official_refresh` in `FACT_ORIGINS`; `PAGE_READ_ORIGINS` / `isPageReadOrigin` |
| Pure rules | `shared/official-refresh.ts` — `refreshEligibleSource`, `refreshDue`, `refreshExpiresAt`, `refreshBudgetCents`, `admitRefreshFact`, `refreshPlaceRef` |
| Adapter | `tavily-extract-adapter.ts` — `fetchTarget` (market-scoped, no `tripId`, one extract, no search); the page read shared with `fetch` (`readFacts`) |
| Writer | `recordFacts` — refuses an `official_refresh` fact without source id / https URL / official license / quote; writes `verified_at` |
| Cross-plan read | `feasibilityFactsForTrip` — official rows of `PAGE_READ_ORIGINS` + `expert_nugget` |
| Job | `server/jobs/officialRefresh.ts` → `POST /internal/jobs/official-refresh` (internal secret), daily bucket, health roster |
| Station point | `venue-geocode.service.ts` `resolveOsmNode` (Nominatim lookup of the named node, the venue path's UA, attribution and two-way name rule); `shared/official-refresh.ts` `StationPoint` / `stationPointValue`; the job's `readStoredStationPoint` |

## How it decides
- **Eligible source:** active, `official`, terms-checked, an interval, a ceiling and the `tavily_extract`
  adapter. Each refusal is named on the run (`inactive`, `not_official`, `terms_unchecked`, `no_interval`,
  `no_ceiling`, `adapter_not_built`). **No ceiling ⇒ no spend** ("within" a ceiling).
- **Targets:** only `CONTENT_SOURCE_TARGETS`, after `validateTargets`; a refused target is reported, never read.
- **Due:** never read, or the last read is a full interval old. The last read is the later of the last logged
  attempt (`api_usage_logs`, `basis = official_refresh`, `targetUrl`) and the last stored fact, so a page that
  yields nothing is not re-read daily.
- **Ceiling:** re-read off `api_usage_logs` before every read, per source per day. The plan-scoped fetch writes
  the same meter under the same `sourceId`, so one ceiling covers both. An unreadable meter is spent.
- **Cost:** one extract per target (the URL is known), priced from `TAVILY_PRICE_PER_EXTRACT_USD`.
- **Station point (ruling 2):** a station target's anchor is `{ stationSlug, osmNodeId }`. Before its page is read,
  the job takes the point from a stored refresh fact for that node if one exists (resolved once, reused); otherwise
  it asks Nominatim for THAT node (a lookup, not a search; 1 request/second), and accepts it only when the node's
  name and the slug's words name each other. The point lands on `place_lat`/`place_lng` with
  `value.point = { provider: "openstreetmap", osmNodeId, matchedName, attribution: "© OpenStreetMap contributors" }`.
  OSM unreachable ⇒ the target is deferred, nothing read or spent; OSM answers "not this station" ⇒ the page is
  read and the fact stored with no coordinate (asked again at its next read). The writer refuses any refresh fact
  carrying a coordinate without that OSM attribution (`unattributed_point`), so no Places or typed point gets in.

## How it reads
`official_refresh` is read exactly as an official crawl, through `isPageReadOrigin`: the same tier, tags
(public + link_only for feasibility types), publishability (only with the source's `public_ok`) and feasibility
admission. It is **not confirmable** into a nugget: it is kept current by its own interval.

## Stated limits
- **A station OSM does not confirm stays unplaced** — stored, dated and attributed, but not read by FD-3's
  last-train check until a later read resolves it. Nothing is guessed.
- **Any surface that renders a station point must show "© OpenStreetMap contributors"** (LD 59); none renders
  one in this lane.
- **Targets ship empty** (SS-1a). The job does nothing until Leon types and activates rows and the target pages
  are read (Chrome pass) and added to config.
- Only the `tavily_extract` adapter is driven; an `api` source is skipped by name until its adapter exists.

## Tests
- `shared/__tests__/official-refresh.test.ts` OR1–OR7 (whole-directory job; OR5/OR6 cover the attributed point).
- `server/__tests__/official-refresh.db.test.ts` J1–J7 (wired into `scheduler-jobs-gate.yml`): read once with full
  provenance; not again inside the interval; ceiling stops it; ineligible skipped by name; unsourced never written
  (adapter and writer); unknown source reported, never read; a station placed by its OSM node once, reused,
  attributed — unplaced on a no-match, deferred when OSM is unreachable.
- `server/services/__tests__/osm-node-lookup.test.ts` ON1–ON3 (same step): the node lookup, no guess, unreachable.
- `content-facts.db.test.ts` C5: the job added to the deliberate reader list (it reads only its own rows' dates).
