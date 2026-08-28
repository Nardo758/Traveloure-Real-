# Landing Page Spec (v2.4) — lane `landing-build`

Lane 0 of the landing-build dispatch (reissue, `audited@3bd36b49`; branch cut at `f54a590c`).
Visual + behavior of record: `docs/design/landing-earn-mock.html` (v2.4). Grammar:
`docs/design/marketplace-experts-earn-grammar-mock.html`. This spec = the mock + the
dispatch's rulings + Phase 0's verified findings. Where the mock's DOM and the dispatch
disagree, **the dispatch wins** (it is the reissue; delta noted below).

## Ruled section order (dispatch; coral count = 3)

1. **Hero** — live bento + typed search
2. **How it works + price strip**
3. **Plus occasions**
4. **Where to begin** (entry strips)
5. **What people are planning** (experiences ticker — degraded, see findings)
6. **Cities with momentum**
7. **Numbers**
8. **Ways to earn**
9. **Final CTA**

> Mock-DOM delta: the v2.4 mock file orders ENTRY → EXPERIENCES → OCCASIONS
> (comments in the file). The dispatch's ruled order above moves OCCASIONS to slot 3.
> Build to the ruled order.

## Preserve exactly (verified at `f54a590c` — landing.tsx is byte-identical to `c84c5e07`)

- Hero `Plan my trip` → `setPlanningOpen(true)` (`landing.tsx:368`) →
  `EnhancedPlanningModal` (`:823-825`). No handler changes.
- Earn links keep `?track=` aliases: `/earn?track=provider` (`:720`),
  `/earn?track=expert` (`:744`).
- NOTE: `docs/audits/landing-routing-phase-0.md` (cited by the dispatch) does **not
  exist on main** — the earlier lane never landed it. The chain above is verified
  directly from source instead; treat this spec as the citation of record.

## Data contract (every number from a live row; §13 honest-collapse)

| Surface | Source | Verified live shape (dev, this branch) |
|---|---|---|
| Hero city line | `GET /api/travelpulse/cities?limit=N` (public) | `cities[]`: `cityName`, `country`, `trendingScore` (0 when below confidence floor — render no "hot" badge, never fake), `crowdLevel` ("busy"), `pulseScore`, `activeTravelers`, `vibeTags`, `currentHighlight` |
| Hero anchor expert | `neighborhoods[].localExpert` via the city feed (`GET /api/discover/location/:city`) | `{id, firstName, lastName, profileImageUrl, packagesCount}` — **no `handle`, no `fromPrice`** today; `localExpert` is null-prone (dev Kyoto: 10 neighborhoods, **zero** carry one). Phase 1 adds handle + min-price derivation server-side, nullable. |
| Hero gem | city feed `gems.data[]` | `placeName` (NOT `name`), `gemScore` (the score), `localRating`, coords. 21 rows in dev Kyoto. |
| Hero bookable service | city feed `services.data[]` | `serviceName`, `price` (**decimal-dollars string**, e.g. `"480.00"` — Phase 1 converts to `priceCents`), `priceType`, `city`, `neighborhood`, `serviceImage`, approved+active only. 27 rows in dev Kyoto. |
| Hero wanted slot | **no server home** — today derived client-side in `discover-location.tsx:1881-1906` (neighborhoods × offering types with no coverage) | Phase 1 re-derives server-side inside `/api/landing/hero` (same inputs: `expert_offering_types` minus covered), nullable. |
| Typed search titles | `service_requests` table exists (`shared/schema.ts:6344`) but has **no public read** — only auth'd `/mine` + admin triage | **Open decision (hard stop):** serving traveler-authored titles publicly needs a ruling; options at the stop. |
| Price strip / Plus price | `GET /api/pricing` (public, unauthenticated — verified) | `serviceFeePct:7`, `serviceFeeCapCents:2500`, `optimizerRunDisplay.priceCents:599`, `aiTaskCents:299`, `tripPass.priceCents:1900`, `plusAnnual:{priceCents:2500,interval:"year"}`, **`plusSalesEnabled:false`** — the Join-Plus CTA gates on this field (coming-soon state, price still shown). |
| Numbers | `GET /api/platform/stats` (already consumed at `landing.tsx:270-272`) | `{totalTrips:1, totalUsers:29, totalExperts:12, totalReviews:0, totalBookings:0, totalCountries:1}` in dev. Current page renders `"0+"` fallbacks (`formatStat`); ruled behavior is honest `—` where empty — change with the section rebuild. |
| Experiences ticker | `experience_starts` rollup **does not exist** (verified: zero references repo-wide) | Build the degraded section: static curated order, ticker hidden (mock's note). Rollup filed, not built. |
| Cities rail | `TrendingCities` (already mounted, `landing.tsx:526`) → shared `travelpulse/CityCard` | **`CityCard` has no `density` prop** — the compact variant must be added (additive prop, default preserves current renders). |

## Shared rotation utility — must be CREATED (does not exist)

The dispatch says "reuse the shared rotation utility"; Phase 0 found **no such utility**
anywhere (no shared interval/reduced-motion rotation hook in `client/src`). Phase 2
creates ONE hook (8s advance · pause on hover/focus · disabled under
`prefers-reduced-motion`) and all three rotating surfaces (typed search, experiences
ticker when it exists, cities rail) consume it. No per-surface reimplementations.

## Photos

Real listing photos where rows have them (`serviceImage`, gem media, expert
`profileImageUrl`); tinted gradient fallback otherwise; no stock, no AI images.

## Phase 1 — `GET /api/landing/hero`

Server-composed, public, cacheable; every field nullable; collapses honestly:

```
{ city, trend, crowd,
  anchorExpert: { name, handle, fromPrice } | null,
  gem:          { name, score } | null,
  service:      { name, priceCents } | null,
  wanted:       { title, neighborhood } | null }
```

- `city/trend/crowd` from the trending resolver (top operating market).
- `anchorExpert` from `expert_neighborhoods` (deterministic pick, as the feed does) +
  `users.handle` + min approved offering price; null when the city has no assignment —
  never a fabricated expert.
- `gem` maps `placeName`/`gemScore`. `service` converts dollars-string → cents.
- `wanted` re-derives the client rule server-side; null when everything is covered.
- Tests: each leg null when absent; the endpoint never fabricates; trend 0 renders no badge.

## What Not To Do (dispatch, restated)

No handler changes; no stock photos; no inventory-promising copy; no fourth coral;
no `layout.tssx`/`trip-strip.tsx`; no merge (draft PR, Leon merges). If
`experience_starts` must be built, it is FILED, not built here.
