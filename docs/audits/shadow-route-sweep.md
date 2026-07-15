# Shadow-Route Sweep (Jul 15, 2026)

`server/routes.ts` (the monolith) carried **237** inline `app.<method>(path)` registrations whose
exact method+path was **already served by a router mounted earlier** in `registerRoutes`
(`app.use(contentRoutes)` at ~routes.ts:560 and siblings run BEFORE every inline registration, so
Express matched the router copy and the inline copy was dead code). This shadow class had already
caused real bugs — fixes were landing on the dead copy while the live one kept misbehaving
(confirmed instances: bf93f45e, 571b593f, 23ece804 — see the harvest table).

**Decision-maker's rule applied: every pair was diffed before deletion; superior deltas in the dead
copy were harvested into the live copy first; nothing was deleted unexamined.**

## Method

1. Enumerated (method, path) pairs from every router mounted before the inline registrations
   (`content.routes.ts`, `admin.routes.ts`, `payments.routes.ts`, `upsell.routes.ts`, `bookings.ts`,
   `booking-actions.ts`, `messages.ts`, `my-itinerary.routes.ts`, `transport-hub.routes.ts`,
   `plancard.routes.ts`, `optimization.routes.ts`, `concierge.routes.ts`, `instagram.ts`,
   `identity.routes.ts`, `webhooks.routes.ts`, `expert-workspace.routes.ts`, `ea.routes.ts`,
   `provider.routes.ts`), applying mount prefixes, and intersected with the inline `app.*`
   registrations in `routes.ts` (string-literal paths, plus manual resolution of the 11
   `api.*.path` constant registrations — none of those collide; `trips.routes.ts`,
   `experts.routes.ts`, `cross-sell.routes.ts`, `saved-items.routes.ts` are imported but
   **unmounted**, so they shadow nothing).
   `app.*` registrations inside `content.routes.ts` (`registerDiscoveryRoutes`) run AFTER the inline
   ones (routes.ts end) and were excluded — for those, the inline copy wins and stays.
2. Extracted each pair's full handler block (bracket-depth parser, string/template/comment aware),
   normalized whitespace/comments/`app.`→`router.`, and diffed.
3. Harvested the 6 dead-superior deltas into the live copies, then deleted all 237 dead blocks
   (plus directly-abutting comment headers) and the imports/locals orphaned **by the sweep**
   (18 import names + the local `CREDIT_PACKAGES` array; pre-existing unused imports were left).

## Summary counts

| Classification | Count | Action |
|---|---|---|
| IDENTICAL (post-normalization) | 135 | deleted dead copy |
| DEAD-COPY-OLDER (live strictly newer/better) | 93 | deleted dead copy |
| DIVERGENT-DEAD-SUPERIOR (harvested) | 6 | ported delta into live copy, then deleted |
| DIVERGENT-UNRESOLVED (ambiguous extra in dead copy) | 3 | recorded below, deleted without porting |
| SKIPPED-UNSURE | 0 | — |
| **Total shadow pairs** | **237** | (202 content.routes, 29 admin.routes, 6 payments.routes) |

`server/routes.ts`: **13,525 → 7,311 lines (−6,214)**.

## Harvested deltas (dead copy was superior — ported into the live copy)

| Pair | What was ported | Why the dead copy had it |
|---|---|---|
| `PATCH /api/custom-venues/:id` | ownership (IDOR) check + existence 404 (`venue.userId !== sessionUser → 403`) | IDOR-audit commit 571b593f applied the fix to the dead routes.ts copy only; the live copy let any authenticated user update anyone's custom venue |
| `DELETE /api/custom-venues/:id` | ownership (IDOR) check + 404 + try/catch | same 571b593f fix, same gap: any authenticated user could delete anyone's custom venue |
| `GET /api/services/:id` | F2 public read-gate: `approvalStatus !== "approved"` → 404 | F2 commit 23ece804 gated the dead copy; the live public detail surface still leaked non-approved listings (§1 D1a read-gate divergence) |
| `GET /api/admin/notifications` | DB role lookup (`storage.getUser(...).role`) replacing `req.user.claims?.role` check | no auth flow writes a `role` claim into the session, so the live check 403'd every real admin — the endpoint was dead-on-arrival (blanket `adminApiGuard` still applies in front) |
| `GET /api/travelpulse/global-calendar` | country-level season/event fallback (`countrySeasonMap`/`countryEventMap`, keep events-only cities, null-safe season fields, `eventsOnly` bucket includes no-season cities) | blocker fix bf93f45e ("match seasons by country with city-level override") predated the defrag but was never carried into content.routes.ts; `destination_seasons` is seeded country-level (city = NULL), so the live handler dropped **every** city — proven locally: 13/13 July season rows are country-level; post-harvest the endpoint returns 9 cities with season data (was structurally 0) |
| `GET /api/discover/location/:city` | `date` query passthrough into `LocationViewOptions` | the service's `date` option exists for this route ("date-aware planning mode… no behavior change yet"); the wiring lived only on the dead copy. No-op server-side today; forward-compat only |

Not ported (recorded): the dead global-calendar copy also computed `timeRelevantMatches` for the
top-5 cities — its dynamic import path (`../services/content-matching.service`) is broken from
`server/routes.ts` (would throw if ever executed) and the client only declares the field in a type,
never renders it. Left un-ported; the service function (`resolveTimeRelevantMatches`) still exists
if a real consumer appears.

## Divergent-unresolved (deleted without porting — deltas were ambiguous)

| Pair | Dead copy's extra | Why not ported |
|---|---|---|
| `POST /api/ai/optimize-experience` | fed smart-sequencing rules into the AI prompt | live deliberately added an admin/expert role gate + usage tracking and dropped the rules context; can't tell if the drop was intentional |
| `GET /api/service-templates` | back-filled each missing CANONICAL_NAME from `service_templates` | live falls back only when the ESO set is empty; marginal robustness difference, live shape is the consumed one |
| `POST /api/admin/service-templates` | wrote `service_templates` rows via `insertServiceTemplateSchema` | live deliberately creates `expert_service_offerings` rows instead — a design change, not a regression. (Observation, pre-existing: the live handler **writes** to ESO, which the architecture doc declares read-only — flagged, not changed here.) |

## Notable DEAD-COPY-OLDER confirmations (the dead copy was the bug)

- `PATCH /api/admin/expert-applications/:id/status` — dead copy auto-created **born-`approved`**
  `provider_services` rows on approval (a D1a violation); the live copy correctly dropped that.
- `POST /api/checkout` — live copy is the §15-hardened one (idempotency dedup, concierge/insurance
  fees, per-expert commission override); dead copy predated all of it.
- The ~20 `/api/catalog/*` pairs and most travelpulse/serp/venue pairs differ only by
  `./services` vs `../services` dynamic-import paths and helper extraction.

## Verification

- `npx tsc --noEmit`: **256** errors (baseline 268 — dropped 12; the deleted dead code carried
  baseline errors; no new errors in the touched files).
- `npx vite build --logLevel error`: exit 0.
- `node scripts/check-money-endpoints.cjs`: pass.
- Boot smoke (local DB, PORT 5185): 14 endpoints sampled across the swept families — all JSON, no
  200-HTML, no sweep-caused 500s:
  `/api/health` 200, `/api/status` 200, `/api/travelpulse/global-calendar` 200 (9 cities, fallback
  proven), `/api/travelpulse/global-events` 200, `/api/travelpulse/best-time/Kyoto/Japan` 200,
  `/api/services` 200, `/api/discover?query=kyoto` 200, `/api/discover/location/Kyoto?date=…` 200,
  `/api/travelpulse/fever-events/Kyoto` 200, `/api/service-templates` 200,
  `/api/catalog/esim` 401 (auth-gated, expected), `/api/serp/partnerships` 401 (expected),
  `/api/admin/notifications` 401 (blanket admin guard, expected),
  `/api/service-categories/provider-counts` 500 — **pre-existing, not sweep-caused**: the live
  handler's raw SQL selects `service_provider_forms.category_id`, a column that exists neither in
  `shared/schema.ts` nor the DB (the dead copy referenced the same nonexistent column via a Drizzle
  ref, which was one of the baseline tsc errors). Filed as an observation.

## Rule going forward

**Never register a path inline in `server/routes.ts` that a mounted router already serves.** The
mounted routers win on order; the inline copy is born dead and becomes a fix-magnet. Before adding
any inline route, grep the mounted routers for the same method+path; new endpoints belong in the
appropriate `server/routes/*.ts` router.

## Full pair table

| Method | Path | Live router | Classification | Note |
|---|---|---|---|---|
| GET | `/api/admin/bookings` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/admin/categories` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/admin/categories` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/admin/categories/:categoryId/subcategories` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| DELETE | `/api/admin/categories/:id` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/admin/categories/:id` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| PATCH | `/api/admin/categories/:id` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/admin/data/location-summary` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/admin/destination-events/:id/approve` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/admin/destination-events/:id/reject` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/admin/destination-events/pending` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/admin/expert-applications` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| PATCH | `/api/admin/expert-applications/:id/status` | admin.routes.ts | DEAD-COPY-OLDER | DEAD-COPY-OLDER — dead copy auto-created born-APPROVED provider_services on approval (D1a violation); live correctly dropped that |
| GET | `/api/admin/notifications` | admin.routes.ts | DIVERGENT-DEAD-SUPERIOR | HARVESTED — ported DB role lookup; live claims?.role check 403'd every real admin (no auth flow writes a role claim) |
| GET | `/api/admin/platform-service-providers` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/admin/provider-applications` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| PATCH | `/api/admin/provider-applications/:id/status` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/admin/provider-services/:id/approve` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/admin/provider-services/:id/reject` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/admin/provider-services/pending` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/admin/revenue` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/admin/seed-categories` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/admin/service-templates` | admin.routes.ts | DIVERGENT-UNRESOLVED | DIVERGENT-UNRESOLVED — dead copy wrote service_templates rows; live deliberately creates expert_service_offerings rows instead (different design); not ported (note: live writes to ESO, which CLAUDE.md calls read-only — pre-existing, flagged only) |
| DELETE | `/api/admin/service-templates/:id` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| PATCH | `/api/admin/service-templates/:id` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/admin/stats` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| DELETE | `/api/admin/subcategories/:id` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| PATCH | `/api/admin/subcategories/:id` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| PATCH | `/api/admin/users/:id/verification` | admin.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/ai/chat` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/ai/generate-blueprint` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/ai/generate-itinerary` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/ai/generate-optimized-itineraries` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/ai/itineraries` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/ai/itineraries/:id` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/ai/optimize-experience` | content.routes.ts | DIVERGENT-UNRESOLVED | DIVERGENT-UNRESOLVED — dead copy fed smart-sequencing rules into the prompt; live dropped them but added an admin/expert role gate + usage tracking; ambiguous whether the rules-context drop was deliberate — not ported |
| POST | `/api/alerts/:id/acknowledge` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/alerts/:id/dismiss` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/amadeus/activities` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/amadeus/activities/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/amadeus/flights` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/amadeus/hotels` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/amadeus/locations` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/amadeus/pois` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/amadeus/pois/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/amadeus/safety` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/amadeus/safety/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/amadeus/transfers` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/analytics/booking` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/analytics/destination-metrics/:destination` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/analytics/expert-match-trends/:expertId` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/analytics/itinerary-generated` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/analytics/search-event` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/analytics/search-trends` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/budget/calculate-tip` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/budget/convert-currency` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/cache/activities` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/cache/categories` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/cache/checkout-verify` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/cache/cleanup` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/cache/filter/activities` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/cache/filter/hotels` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/cache/flights` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/cache/hotels` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/cache/map/activities` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/cache/map/hotels` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/cache/preference-tags/:itemType` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/cache/refresh` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/cache/status` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/cache/verify-availability` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/catalog/activities-gyg` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/agoda` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/airport-transfers` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/booking` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/bus` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/cars` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/destinations` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/catalog/esim` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/flights` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/ground-transport` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/hotels-look` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/insurance` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/items/:type/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/catalog/klook` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/luggage-storage` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/nomad` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/rentalcars` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/search` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/catalog/search-hybrid` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/catalog/templates/:slug` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/catalog/tiqets` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/transfers` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/viator-feed` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/catalog/wegotrip` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/city-neighborhoods` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/claude/full-itinerary-graph` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/claude/optimize-itinerary` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/claude/recommendations` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/claude/transportation-analysis` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/custom-venues` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/custom-venues` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| DELETE | `/api/custom-venues/:id` | content.routes.ts | DIVERGENT-DEAD-SUPERIOR | HARVESTED — ported ownership (IDOR) + 404 + try/catch from dead copy (571b593f) |
| GET | `/api/custom-venues/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| PATCH | `/api/custom-venues/:id` | content.routes.ts | DIVERGENT-DEAD-SUPERIOR | HARVESTED — ported ownership (IDOR) + existence check from dead copy (fix 571b593f had landed on the dead copy only) |
| GET | `/api/destination-calendar/countries` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/destination-calendar/events` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/destination-calendar/events` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| DELETE | `/api/destination-calendar/events/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| PUT | `/api/destination-calendar/events/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/destination-calendar/events/:id/submit` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/destination-calendar/my-events` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/destination-calendar/seasons` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/destination-intelligence` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/destinations` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/discover` | content.routes.ts | DEAD-COPY-OLDER | DEAD-COPY-OLDER — semantically identical (content-gate redaction present in both); trivial refactor |
| GET | `/api/discover/location/:city` | content.routes.ts | DIVERGENT-DEAD-SUPERIOR | HARVESTED — ported `date` query passthrough (LocationViewOptions.date exists for this route; currently a no-op server-side) |
| POST | `/api/discover/recommendations` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| DELETE | `/api/emergency-contacts/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| PATCH | `/api/emergency-contacts/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/emergency/embassy/:countryCode` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/emergency/numbers/:countryCode` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/emergency/rebooking-options/:itemType` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/experience-types` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/experience-types/:id/steps` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/experience-types/:id/tabs` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/experience-types/:id/universal-filters` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/experience-types/:slug` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/faqs` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/faqs` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| DELETE | `/api/faqs/:id` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| PATCH | `/api/faqs/:id` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/fever/cache/events/:cityCode` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/fever/cache/refresh-all` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/fever/cache/refresh/:cityCode` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/fever/cache/status` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/fever/cities` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/fever/cities/:cityCode/dates` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/fever/cities/:cityCode/free` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/fever/cities/:cityCode/upcoming` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/fever/events` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/fever/events/:eventId` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/fever/status` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/generated-itineraries` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/generated-itineraries/:tripId` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/geocode` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/geocode` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/grok/chat` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/grok/content/generate` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/grok/health` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/grok/intelligence` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/grok/itinerary/generate` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/grok/match-experts` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/notifications` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| DELETE | `/api/notifications/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| PATCH | `/api/notifications/:id/read` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/notifications/mark-all-read` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/notifications/unread-count` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| DELETE | `/api/participants/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| PATCH | `/api/participants/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/participants/:id/payment` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| PATCH | `/api/participants/:id/rsvp` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/routes/transit` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/routes/transit-multi` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/search/experiences` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/serp/inquiry` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/serp/partnerships` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/serp/template-search` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/serp/track-click` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/service-categories` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/service-categories` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/service-categories/:categoryId/subcategories` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/service-categories/provider-counts` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/service-subcategories` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/service-templates` | content.routes.ts | DIVERGENT-UNRESOLVED | DIVERGENT-UNRESOLVED — dead copy back-filled per-missing CANONICAL_NAME from service_templates; live falls back only when the ESO set is empty; marginal robustness difference — not ported |
| GET | `/api/service-templates/:id` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/services` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/services/:id` | content.routes.ts | DIVERGENT-DEAD-SUPERIOR | HARVESTED — ported F2 public read-gate (approval_status='approved'); 23ece804 had gated the dead copy only |
| GET | `/api/services/:serviceId/reviews` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/services/:serviceId/reviews` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/spontaneous/:id/book` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/spontaneous/opportunities` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/spontaneous/preferences` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/spontaneous/preferences` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/spontaneous/quick-search/:window` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| DELETE | `/api/transactions/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| PATCH | `/api/transactions/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/transport-packages/generate` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/travelpulse/activity/global` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/ai-recommendations/:cityName/:country` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/travelpulse/ai/city/:cityName` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/travelpulse/ai/refresh-all` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/travelpulse/ai/refresh/:cityName/:country` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/ai/status` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/travelpulse/best-time/:cityName/:country` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/travelpulse/calendar/:city` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/cities` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/cities/:cityName` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/cities/:cityName/activity` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/cities/:cityName/alerts` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/cities/:cityName/happening-now` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/cities/:cityName/hidden-gems` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/destination-calendar/:cityName/:country` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/destination/:city/:name` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/enriched/:cityName` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/travelpulse/event-recommendations/:cityName/:country/:eventId` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/travelpulse/fever-events/:cityName` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/travelpulse/global-calendar` | content.routes.ts | DIVERGENT-DEAD-SUPERIOR | HARVESTED — ported country-level season/event fallback (bf93f45e blocker fix lost in the defrag); did NOT port timeRelevantMatches (broken import path in dead copy, no rendering consumer) |
| GET | `/api/travelpulse/global-events` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/travelpulse/help-decide` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/livescore/:city/:entity` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/media/:cityName/:country` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/travelpulse/media/track-download` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/travelpulse/seed` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/travelpulse/serp-search` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/travelpulse/trending/:city` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/travelpulse/truth-check` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| DELETE | `/api/user-experience-items/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| PATCH | `/api/user-experience-items/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/user-experiences` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/user-experiences` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| DELETE | `/api/user-experiences/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/user-experiences/:id` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| PATCH | `/api/user-experiences/:id` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| POST | `/api/user-experiences/:id/items` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/venues/:placeId` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/venues/search` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/venues/wedding-vendors` | content.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/viator/activities` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/viator/activities/:productCode` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/viator/availability` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/viator/destinations` | content.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/checkout` | payments.routes.ts | DEAD-COPY-OLDER | DEAD-COPY-OLDER — live has idempotency dedup, concierge/insurance fees, per-expert commission override, payment-intent linking |
| POST | `/api/credits/purchase` | payments.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/revenue-splits` | payments.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| GET | `/api/wallet` | payments.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
| POST | `/api/wallet/add-credits` | payments.routes.ts | DEAD-COPY-OLDER | live copy is the newer refactor (extracted helpers, corrected `../services` import paths, and/or added guards/validation/tracking); dead copy pre-dates it |
| GET | `/api/wallet/transactions` | payments.routes.ts | IDENTICAL | byte-identical after whitespace/comment/`app.`→`router.` normalization |
