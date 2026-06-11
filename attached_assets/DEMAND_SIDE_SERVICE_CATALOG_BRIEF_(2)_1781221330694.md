# Traveloure — Demand-Side Service Catalog Brief (revised post-audit)

**Status:** Revised after the content-source audit. **Key change: the content↔service matcher already exists — wire it, do not rebuild it.** The audit found `content-supply-matching.service.ts` (geo + `place_type` synonym via `demand-service-synonyms.ts` + `best_for` + rating scorer) is correct and already maps temple→guide, market→concierge, fine_dining→chef. It is simply **bypassed**: the client `matchedServiceSuggestion()` returns four hardcoded strings, and that is what users see.

**Why:** the Ways to Earn catalog (fully populated — the one thing the content audit found seeded end-to-end) has no demand-facing home, and the gem matched-strip ships fabricated names/prices. This connects the catalog to travelers, matched to content, and replaces the fabrication — mostly by wiring what's already there.

**Core principle — services match content.** A service surfaces with content only when relevant (photographer on a photo gem, food guide on an Eat gem, tea-ceremony host on a Kyoto temple). The existing matcher already enforces this; the work is to *use* it.

---

## Part 1 — Wire the existing matcher to the feed strip (replaces "build a matching model" + "fix the fabrication")

- Repoint `matchedServiceSuggestion()` to call **`content-supply-matching.service.ts`** instead of returning hardcoded strings. The strip then shows a **real** ranked match: a covered, verified provider's offering (bookable, real name/price) or the matching offering type as "request this" if none is covered.
- Use the **live integrations** for affiliate/external links, not hardcoded URLs — e.g. the "Reserve" link resolves through the live OpenTable lookup, not a static URL. (OpenTable, Viator, Fever, Amadeus are all integrated per the external map.)
- Match on the **granular `place_type` + `best_for`**, which the server matcher already does — not the coarse 4-bucket `gemCategory()` (77% of gems collapse to "Do," too blunt to match on).
- Extend `demand-service-synonyms.ts` only where the audit found a gap (e.g. no `wine_tour` offering for `vineyard`); otherwise reuse.
- **Do not build a new `content_service_match` table or a parallel matcher.** The scorer exists.

## Part 2 — Demand-side browse surface (catalog-backed) — genuine new build

The "Services" view becomes **catalog-backed**: a traveler browsing a city sees the full menu of relevant service types (from `service_offering_types`, scoped by location + `marketScoped`), **bookable** where a covered verified provider exists, **"request this"** where not. This is the demand-side mirror of `/earn`.
**Validated by the audit's gaps:** childcare-family, beauty-styling, events-celebrations, floral-decoration, officiant, caterer, accessibility-specialist, entertainment have **no content anchor** — no gem type produces them — so this surface is the *only* way they reach a traveler. Without it they're invisible on the demand side.

## Part 3 — Request → demand-signal → recruitment loop — genuine new build

"Request this" on an uncovered service writes a `service_demand_requests` row (offeringTypeKey, neighborhoodId, traveler, date) that (a) tells the traveler they'll be matched, and (b) **feeds the "wanted" recruitment slot with real demand** — "3 travelers in Gion want a tourist babysitter" instead of a bare coverage-gap CTA. Closes the two-sided loop.

---

## Data realities from the audit (build against these, not assumptions)
- `place_type` is a **free `varchar(50)`, 23 distinct values, no enum** — typos/new values enter silently. Match on it via the existing synonym dict; consider (not required) a normalization/lint pass later.
- Richer signals exist and the matcher uses them: `best_for` (jsonb: food, photography, culture, nature, peace, shopping, nightlife, walks, spiritual, design), `discovery_status`, `price_range`, `neighborhood`. Don't ignore `best_for`.
- **No `vibe_tag` on gems** — Vibe is derived from `best_for` / `is_secret`. Don't reference a non-existent column.
- Affiliate bookability comes from the **live integration caches** (`experience-catalog.service`: Viator/Fever/Amadeus/OpenTable/Travelpayouts), not a missing inventory table. Wiring offering-types to those is a connected, separate piece — out of scope here; the floor uses platform-provider matching + the request loop.
- `provider_neighborhood_coverage` is the weak link — populated for only ~3-4 seeded providers. The matcher will return "request this" almost everywhere until real supply exists, which is correct and is what the request loop is for.

## Don't-force-it cases (from the gaps)
- `neighborhood` (a geographic container) and `vineyard` (no matching offering) — the matcher should return **nothing** rather than a stretched "local guide." Empty is better than a bad match.

## Gates
- **Strip wired, fabrication gone:** `matchedServiceSuggestion()` calls `content-supply-matching.service`; grep for the four hardcoded strings/URLs → none; the strip shows a real ranked match or "request this."
- **Negative match test:** a photographer does **not** surface on a restaurant gem; `neighborhood`/`vineyard` gems return no forced match.
- **Location/market scope:** a Kyoto-only service never surfaces on a non-Kyoto gem; bookable only where covered+verified, else "request."
- **Browse surface:** catalog scoped by location/market; no-content-anchor categories appear here.
- **Demand loop:** "request this" writes a `service_demand_requests` row; the wanted-slot reflects real demand count.
- **No raw keys; display names** (reuse the Ways to Earn offering presentation). `tsc` baseline unchanged.

## What NOT to do
- **Don't build a new matcher or `content_service_match` table — wire `content-supply-matching.service`.**
- Don't keep the hardcoded strip strings or the hardcoded OpenTable/affiliate URLs — use live lookups.
- Don't match on the coarse 4-bucket `gemCategory()` — use granular `place_type` + `best_for`.
- Don't force matches for `neighborhood`/`vineyard` — empty beats a stretch.
- Don't surface a market-scoped service outside its market.
- Don't render raw keys.

## Where this sits
Top of launch-readiness: the matcher already exists (so Part 1 is small), the catalog is already populated, it removes the only fabricated data shipping today, and the request loop generates the demand signal that recruits the supply the rest of the feed is starving for.

---

# Discover by Date — the date/event/season axis (added)

The location surface anchors on gems (`place_type`); **Discover by Date** (`/global-calendar`, `POST /api/upsell/discover-date`) anchors on **events and seasons**. Same principle — services match content — different anchor and a different content vocabulary. Everything above applies; the additions:

## D1 — Extend the matcher to event/season content
The existing matcher keys on `place_type` synonyms; the audit did not show it handling `eventType`. Extend `demand-service-synonyms.ts` (or the scorer) with **event-type → service** mappings, using the real vocabularies the audit found:
- `destination_events.eventType` = festival · holiday · season · religious · sporting · cultural
- `happening_now.eventType` = popup · festival · market · performance · special

Starter map (build against these real values):
- **festival / performance** → photography, `aff_events` (Fever tickets), entertainment, transport
- **season** → seasonal offerings (see D2), photography, seasonal guides
- **religious** → `tour_guide` (cultural/temple), respectful-visit concierge
- **sporting** → `aff_events` (tickets), transport, group concierge
- **market** → food/market guide (`tour_guide`), `concierge_vip`
- **cultural** → `tour_guide`, `activity_provider`
- **holiday / popup / special** → broad; don't force a narrow match

## D2 — Seasonal offerings need a season anchor
Seasonal offerings (`cherry_blossom_photo`, `fringe_insider`) are only `marketScoped` today — nothing ties them to the *dates* they belong to. Add a thin **season/theme tag** on the offering (or match via `destination_seasons` by market + theme keyword) so `cherry_blossom_photo` surfaces on cherry-blossom dates in Kyoto, not on every Kyoto date. Keep it minimal — a `seasonTag` field or a keyword match, not a new scheduling system.

## D3 — Respect the date hard filter
`discover-date` already hard-filters by `destination_events` availability (per the upsell spec — availability is a filter, not a weight). Keep it: an event-anchored match only surfaces when the event actually falls in the date range. Seasonal-offering matches (D2) key off the season window, not a specific event row, so they survive even when `destination_events` is empty.

## D4 — Fill the bare date surface
`destination_events` is empty without a live Fever key, so the date surface is bare today. The demand-side catalog + seasonal matching gives it content **independent of Fever**: a traveler picking April-in-Kyoto sees seasonal and requestable services even with zero events. This is part of what makes Discover by Date non-empty at launch, not just a match layer on top of events that may not exist.

## D5 — Request loop is date-scoped
"Request this" on the date surface writes the `service_demand_requests` row **with the date window** (offeringTypeKey, neighborhoodId, **dateRange**), so demand is time-bound — "5 travelers want a cherry-blossom photographer the first week of April" — which is an even sharper recruitment signal than a place-only request.

## Date-axis gates (in addition to the location gates above)
- A festival event surfaces photography/tickets; a religious event surfaces a cultural guide; a `holiday`/`popup` does **not** get a forced narrow match.
- `cherry_blossom_photo` surfaces on a cherry-blossom season window in Kyoto and **not** on an arbitrary Kyoto date with no season match.
- Seasonal matches survive when `destination_events` is empty (the date surface is non-empty without Fever).
- Event-anchored matches respect the date hard filter (no match for an event outside the range).
- Date requests persist the `dateRange` on the demand record.

## What NOT to do (date axis)
- Don't reuse the `place_type` synonym entries for events — events have their own vocabulary; add event-type mappings explicitly.
- Don't gate seasonal offerings behind `destination_events` — they key off the season window so the surface isn't empty without Fever.
- Don't build a scheduling engine for seasonality — a thin `seasonTag` or keyword match is enough.
