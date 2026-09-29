# Content sourcing brief — facts for plans, sources by need, adapters for the future

Written 2026-09-29. Design brief for the pack session; builds into A5 (free draft around the option) and A6 (gaps and suggestions). Nothing here is dispatched yet.

## 1. The problem in one line

A traveler should not have to scour twenty sites to build a plan. Until we have API connections for everything, the platform needs a way to know what those sites know, keep it fresh, attribute it, and put it into the plan where the engine can rank it — without republishing it, and without building a second ranker.

## 2. Three layers (ruled 2026-09-29)

| Layer | Source | Rights | Where it may appear |
|---|---|---|---|
| Structured spine | Google Places (key held) | display next to a map; 30-day cache; no directory building | inside plans only |
| Local layer | Tavily against a curated **source registry** | per-source license class; attributed, linked out, never republished | inside plans only, "from <site>, checked <date>" |
| Verification layer | byline-gated experts confirm facts → verified nuggets | ours, with per-post consent at signing | plans **and** public feeds |

Public feeds (blog, city pages, sitemap) get only platform-originated, verified content. One predicate, `isPublishable(fact)`, derived from `origin` + `license`, used everywhere; nobody re-decides per page.

## 3. One fact table, one ranker

Every fact the engine can use is a row in `place_facts`:

```
place_facts
  id, place_ref (place_id | listing_id | event_id | hotel_cache_id | free-text + coords),
  market, need (see §4), fact_type (hours | closure | price | ticketing_rule | transit | event | description | tip),
  value (jsonb), origin (platform_listing | expert_nugget | gem | event | hotel_cache | places_api | crawled | traveler_note),
  source_id (→ content_sources, null for platform origins), source_url, license,
  fetched_at, expires_at (TTL by fact_type), verified_by (expert user id | null), verified_at,
  cost_cents (fetch cost attributed), plan_id (when fetched on behalf of a plan), created_at
```

No DELETE; superseded facts get `superseded_by`. The upsell engine is the only ranker (convergence brief); it orders by origin: platform-native → verified → Places → crawled → traveler note. No parallel ranking path for sourced content.

TTL by fact type (config, not code): hours 7 d · closure until date · price 14 d · ticketing_rule 30 d · transit 30 d · event until end · description 90 d · tip until superseded. A fact past TTL renders as "checked <date>" and is refreshed on the next paid run or expert touch; it is never shown without provenance.

## 4. The needs taxonomy (what a plan has to know)

The registry is organised by **need**, not by site. A need is something the engine asks for when it builds or fills a plan.

| Need | Examples of facts | Kyoto Trip relevance |
|---|---|---|
| `lodging` | availability, rate, cancellation tier, coordinates | anchor (A3) |
| `transport.intercity` | rail, bus, ferry, flights between cities | arrival/departure days |
| `transport.local` | metro/bus lines, passes, last trains, taxi norms | plan-fit, day feasibility |
| `transport.cruise` | river/ocean cruises, ports | not Kyoto; other markets |
| `stop.hours` | opening hours, seasonal closures, special openings | every stop |
| `stop.ticketing` | advance-only, sells out by, timed entry, price | temples, museums, shows |
| `dining` | reservations policy, hours, price level, dietary | dinner items |
| `activity` | tours, classes, experiences, provider terms | platform listings first |
| `event` | dated events, venues, ticket pages | events strip / anchors |
| `practicalities` | visa, SIM, money, etiquette, safety notices | help articles, Trip Card |
| `neighbourhood` | character, walkability, what's near | anchor question, compare |

Each need has a **coverage requirement per market** for the slice: the minimum sources that must exist before the engine relies on that need there (e.g. Kyoto Trips: `lodging`, `stop.hours`, `stop.ticketing`, `transport.local`, `dining` required; `transport.intercity` recommended; `cruise` n/a).

## 5. The source registry (`content_sources`)

```
content_sources
  id, name, homepage, market (null = global), adapter (tavily_crawl | tavily_extract | api | affiliate_feed | manual),
  covers (need[]), does_not_cover (need[] — explicit, e.g. 12Go: [transport.intercity.rail_jp, transport.cruise]),
  license_class (official | editorial | partner | restricted), terms_url, terms_checked_at, terms_checked_by,
  robots_ok (bool), refresh_interval, cost_ceiling_cents_per_day, active, added_by, notes
```

Rules:
- A source is added by an admin through a surface, not by code; a deploy never adds a site.
- No source goes `active` without `terms_checked_at` and a license class. OTAs and review sites (Booking, Expedia, TripAdvisor), Google results at large, and any site whose terms forbid automated access are off the list by rule.
- `does_not_cover` is mandatory: coverage gaps are data, and the coverage report reads them.
- Resale ticket hosts and affiliate-network redirect hosts are refused as `source_url` (the R208 policy list and the partner-hosts helper).

**Coverage report** (`scripts/report-content-coverage.cjs <market>`): need × source matrix for the market, required needs with no active source flagged, sources past `terms_checked_at + 180 d` flagged. Same shape as the Kyoto supply census; it becomes part of the market-opening gate.

## 6. Adapters: crawl today, API tomorrow, same interface

```ts
interface SourceAdapter {
  covers(need: Need, market: Market): boolean;
  fetch(req: { need: Need; market: Market; placeRef?: PlaceRef; dates?: DateRange; budgetCents: number }): Promise<FactDraft[]>;
  attribution(fact: FactDraft): { sourceName: string; sourceUrl: string; license: LicenseClass };
}
```

Implementations, in order of build:
1. `PlacesAdapter` — Google Places for `stop.hours`, `dining` basics, coordinates. Spine.
2. `TavilyExtractAdapter` — registry-driven: for a place in a live plan, extract from the registered official/editorial pages that cover the need; parse to facts with the model, keep the quote cap and the source URL; spend-capped per plan and per day (evidence-scorer pattern).
3. `AffiliateFeedAdapter` — wraps what exists: `hotel_cache` (Booking.com), Viator/Musement/Travelpayouts where keyed. 12Go arrives here (via Travelpayouts) with `does_not_cover: [rail_jp, cruise]`.
4. `ApiAdapter` (future) — one class per partner API (rail, ticketing, reservations). Plugging one in is: register the source with `adapter: api`, implement `fetch`, nothing else changes.
5. `ManualAdapter` — an admin types a fact with a source; used for the events seed and one-off notices.

The engine asks `sources.forNeed(need, market)` and gets adapters in registry priority; it never knows whether a fact came from a crawl or an API. Every adapter writes to `place_facts` with cost and provenance.

## 7. Free vs paid (ruled 2026-09-29)

**Free shows what the platform already knows; paid does work on your behalf.**
- Free: first draft, suggestions and gaps from cached and verified facts; plan-fit "est." where the matrix has no pair; nuggets with attribution; the events and listings we hold.
- Paid (Trip Pass / optimizer run): three versions on matrix-backed plan-fit; **fresh fetches** of the local layer for the plan's own stops and dates, cost-tracked to the run record; the run history.
- Expert-priced, separate: review, "Text a Local", done-for-you.
- Never paid: a fact's source, or a fact an expert verified.

Operationally: adapters' `fetch` with `budgetCents > 0` is only called inside a paid run or an expert action; the free path reads the cache and Places only.

## 8. The flywheel

crawled fact enters a plan → traveler uses it → expert confirms it (one tap in the expert workspace, becomes `expert_nugget`, `verified_by` set) → `isPublishable` becomes true → it can appear in a field-knowledge post, a city page, a gem. Public content is downstream of plans, never scraped straight to a page.

## 9. Kyoto starter index (candidates; terms to be checked before any goes active)

| Source | Adapter | Covers | Does not cover | License class |
|---|---|---|---|---|
| Kyoto City Official Travel Guide (kyoto.travel) | tavily_extract | stop.hours, event, neighbourhood, practicalities | lodging, dining reservations | official |
| JNTO (japan.travel) | tavily_extract | practicalities, event, stop.hours (major) | transport.local detail | official |
| Kyoto City Bus & Subway (city.kyoto.lg.jp / Kyoto City Transportation Bureau) | tavily_extract | transport.local | intercity | official |
| JR West / JR Central official | tavily_extract (api later) | transport.intercity rail | local bus, cruise | official |
| Temple/shrine official pages (per stop, registered individually) | tavily_extract | stop.hours, stop.ticketing | — | official |
| Kyoto Convention & Visitors Bureau event calendar | tavily_extract / manual | event | — | official |
| Google Places | api | stop.hours, dining basics, coordinates | ticketing rules, seasonal notices | restricted (display only) |
| Booking.com (existing) | affiliate_feed | lodging | — | partner |
| Viator / Musement (existing keys) | affiliate_feed | activity | — | partner |
| 12Go via Travelpayouts | affiliate_feed | transport.intercity bus/ferry | rail_jp, cruise | partner |
| One or two editorial locals (to be chosen; terms permitting) | tavily_extract | tip, neighbourhood, dining | — | editorial |

Gaps the report will show on day one: `transport.intercity.rail` until JR is registered; `dining` reservations (no source; expert nuggets carry it); `transport.cruise` n/a for Kyoto.

## 10. Build order and where it lands

- **A5** (after the sessions): `place_facts`, `content_sources`, `PlacesAdapter`, the engine reading facts by origin order, `isPublishable`. Migration → hold for ruling.
- **A6**: `TavilyExtractAdapter` with spend caps, the coverage report, the admin registry surface, expert "confirm this fact" in the workspace. Kyoto starter index registered by the decision-maker through the surface after terms checks.
- **Later**: `ApiAdapter` per partner as connections arrive; `does_not_cover` shrinks; nothing else changes.

## 11. Decisions for the decision-maker

1. Confirm the needs taxonomy in §4 (add or rename needs).
2. Approve the "no source active without terms checked" rule and who checks (you, with the date recorded).
3. Confirm the free/paid line in §7 as written.
4. Which editorial locals for Kyoto, if any.
