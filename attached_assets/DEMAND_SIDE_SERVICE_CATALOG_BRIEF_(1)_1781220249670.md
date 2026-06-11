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
