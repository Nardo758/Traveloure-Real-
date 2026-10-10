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

## Built
| Piece | Where |
|---|---|
| Origin + the ONE page-read predicate | `shared/content-facts.ts` — `official_refresh` in `FACT_ORIGINS`; `PAGE_READ_ORIGINS` / `isPageReadOrigin` |
| Pure rules | `shared/official-refresh.ts` — `refreshEligibleSource`, `refreshDue`, `refreshExpiresAt`, `refreshBudgetCents`, `admitRefreshFact`, `refreshPlaceRef` |
| Adapter | `tavily-extract-adapter.ts` — `fetchTarget` (market-scoped, no `tripId`, one extract, no search); the page read shared with `fetch` (`readFacts`) |
| Writer | `recordFacts` — refuses an `official_refresh` fact without source id / https URL / official license / quote; writes `verified_at` |
| Cross-plan read | `feasibilityFactsForTrip` — official rows of `PAGE_READ_ORIGINS` + `expert_nugget` |
| Job | `server/jobs/officialRefresh.ts` → `POST /internal/jobs/official-refresh` (internal secret), daily bucket, health roster |

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

## How it reads
`official_refresh` is read exactly as an official crawl, through `isPageReadOrigin`: the same tier, tags
(public + link_only for feasibility types), publishability (only with the source's `public_ok`) and feasibility
admission. It is **not confirmable** into a nugget: it is kept current by its own interval.

## Stated limits
- **Station coordinates are not resolved.** A last-train page anchors on a station slug and the fact is stored
  with NO coordinate (`place_ref = station:<slug>`). FD-3 places a last-service fact by its point, so these facts
  are stored, dated and attributed but not yet read by the last-train check. How a slug becomes a point is
  unruled; nothing is guessed. (Option on the table: OpenStreetMap, the LD 59 venue precedent.)
- **Targets ship empty** (SS-1a). The job does nothing until Leon types and activates rows and the target pages
  are read (Chrome pass) and added to config.
- Only the `tavily_extract` adapter is driven; an `api` source is skipped by name until its adapter exists.

## Tests
- `shared/__tests__/official-refresh.test.ts` OR1–OR7 (whole-directory job).
- `server/__tests__/official-refresh.db.test.ts` J1–J7 (wired into `scheduler-jobs-gate.yml`): read once with full
  provenance; not again inside the interval; ceiling stops it; ineligible skipped by name; unsourced never written
  (adapter and writer); unknown source reported, never read; a station fact stored with no coordinate and not placed.
- `content-facts.db.test.ts` C5: the job added to the deliberate reader list (it reads only its own rows' dates).
