# DTO Completeness — Phase 0 Evidence Packet

**Date:** 2026-08-26  
**Scope:** Task 1661, read-only Phase 0  
**Status:** Approval packet complete; implementation not authorized by this packet

## 1. Executive decision

This audit found the live route owner, current response shape, source/read path, null
behavior, client fallback, and existing test surface for the twelve DTO contracts below.
No server, client, schema, migration, seed, or write-path behavior was changed.

Two decisions must remain explicit before implementation:

1. **Review source is not interchangeable.** The storefront and expert aggregate paths
   read denormalized `provider_services.average_rating` / `review_count`, while the public
   review list reads approved `service_reviews` rows. Development data is materially
   divergent: 34 approved review rows versus 16,172 stored review-count units. The
   report therefore records the current source and the disagreement; it does not silently
   switch the source.
2. **Storefront attribution is blocked for money behavior.** The checkout session reference
   is confirmed, but the required repeat-pair predicate is not implemented. The existing
   repeat predicate belongs to customer UI grouping and is not a fee/attribution authority.
   No attribution DTO or fee outcome may be changed until that predicate is explicitly
   approved and implemented in its own authorized phase.

## 2. Scope mapping and evidence method

The repository task brief says “twelve” but does not enumerate twelve names. To avoid
inventing an undocumented contract, this packet maps the twelve requested contracts to
the concrete surfaces named by the brief's relevant files and the current consumer
boundaries. The mapping is intentionally stated here so the dispatch can correct it
before implementation if a different twelve-item list was intended.

The audit used:

- source inspection with exact route/mount and consumer citations below;
- duplicate-registration searches and the existing shadow-route inventory;
- read-only development database counts for the review-source decision;
- live development GET samples on 2026-08-26;
- existing route, service, client, and Playwright test inventory.

### Runtime samples

The application was restarted with the existing **Start application** workflow and
returned cleanly. Representative responses:

| Request | Result and representative evidence |
|---|---|
| `GET /api/experts` | HTTP 200, bare JSON array. A live row included user identity, `role`, `handle: null`, `experienceTypes`, and `selectedServices`. |
| `GET /api/ready-made` | HTTP 200, `{ listings: [...] }`; rows included `priceCents`, `authorId`, nullable `authorHandle`, and `section`. |
| `GET /api/discover/location/Kyoto?country=Japan&limit=1` | HTTP 200, location-view envelope; the response was sectioned rather than a bare list. |
| `GET /api/travelpulse/cities?limit=1` | HTTP 200, `{ cities: [...], count }`; city rows included score, price, trend, and image fields. |
| `GET /api/storefront/bogota-local` | HTTP 200, `{ earner, services, templates, readyMade, away }`; the sample had `averageRating: null`, `reviewCount: 0`, and `away: null`. |

Workflow logs recorded successful 200 responses for all five samples. Startup emitted
only existing environment/configuration warnings; no DTO-related crash occurred.

## 3. Twelve-contract inventory

“Null” below means the server must preserve absence (`null`, an omitted field, or an
empty collection according to the existing contract), not manufacture a display value.
Client labels such as `New`, `—`, `Custom quote`, or `Ask a trip planner` are presentation
fallbacks and are not server data.

| # / contract | Live registration and shadow proof | Current response shape | Canonical read/join and null condition | Client fallback and existing test surface |
|---|---|---|---|---|
| **1. Expert identity/profile**<br>`GET /api/experts` and `GET /api/experts/:id` | `server/routes.ts:4200-4347` registers the list; `:4350-4377` registers the detail. `server/routes/experts.routes.ts` is mounted at `:1147-1151` but has no `/api/experts*` registrations, so it cannot shadow these inline handlers. | List is a bare array; detail is one expert object. The storage object starts with the `users` row and adds `experienceTypes`, `selectedServices`, `specializations`, `expertForm`, top-level `displayName`, `headline`, `city`, `country`, `languages`, `averageRating`, and `reviewCount`. | `storage.getExpertsWithProfiles` reads expert-family users, left-joins `expert_experience_types` to `experience_types`, loads approved services, specializations, and the local-expert form (`server/storage.ts:4397-4462`). Local experts are excluded unless the form exists with `status='approved'` (`:4465-4477`). Missing form fields remain `null`; languages become `[]`; missing identity values remain the database null/empty value. | `expert-card.tsx:52-109,120-264` uses first/last name, role, avatar, bio, and form values; detail uses explicit empty/omission fallbacks (`expert-detail.tsx:354-430`). No dedicated HTTP contract test was found; the nearest relevant coverage is the expert response-time client test and expert/browser surface tests. **Add:** sourced identity, absent form, and local-expert approval-gate assertions. |
| **2. Expert response-time fact**<br>`GET /api/experts` / detail | Same inline registrations as #1; no route shadow. The response-time field is not a separate route field: it is read from the nested `expertForm` returned by the live handler. | `expertForm.responseTime` is an authored string when present; no top-level server normalization is added by this route. | The response-time onboarding write path is `travel-experts.ts:1380-1387` with submission mapping at `:441-442`; the form read is included by `getLocalExpertForm` in `storage.ts:4421-4423`. Empty/whitespace/missing response time is absent, not a promise. | `expert-card.tsx` first checks legacy top-level `responseTime` then `expertForm.responseTime`; `expert-detail.tsx:366-367` uses only the form field. `formatExpertResponseTime` preserves authored prose, humanizes snake case, and returns `null` for empty input (`client/src/lib/expert-response-time.ts:1-19`). Existing tests cover snake case, prose, and empty values (`client/src/lib/__tests__/expert-response-time.test.ts:1-24`). **Add:** live DTO with value and absent form-field assertions; keep no invented default. |
| **3. Expert rating/review summary**<br>`GET /api/experts`, detail | List handler computes list metrics at `server/routes.ts:4259-4346`; detail handler computes its aggregate at `:4356-4376`. No other `/api/experts` registration exists. | List returns `expertRating` and `expertReviewCount` in addition to storage's `averageRating` / `reviewCount`; detail returns the expert object with `expertRating` / `expertReviewCount`. `null` rating means no qualifying reviews. | Current list/detail route aggregate reads `service_reviews.provider_id = expert id`, filters `status='approved'`, and groups/averages (`routes.ts:4301-4320,4359-4369`). Storage independently computes a review-count-weighted mean over already loaded approved service aggregates (`storage.ts:4424-4461`). A zero-review expert returns rating `null`, count `0`; no “4.9” fallback. | Cards show `New` when `expertRating` is not numeric and show count only with a real rating (`expert-card.tsx:64-68,227-264`); detail shows `New` and “No reviews yet” (`expert-detail.tsx:678-720`). **Existing:** `expert-response-time` only; no dedicated expert-rating route test found. **Add:** sourced rating/count, no-review `null/0`, and disagreement-source fixture assertions. |
| **4. Expert offerings/storefront metrics**<br>`GET /api/experts` | Same live list registration at `server/routes.ts:4200-4347`; `/api/expert*` workspace router does not register this path. | Each list row may carry `selectedServices`, `servicesCount`, `serviceBookings`, `packagesCount`, `packagesSold`, and the handle used for the storefront link. Zero counts are returned as numeric zero by the metric decorator; the UI hides zero badges. | `selectedServices` comes from `getApprovedServicesForExpert` (`storage.ts:4415-4417`). List metrics count approved+published `expert_templates` and approved+active `provider_services`, summing their server-maintained sales/booking counters (`routes.ts:4267-4299`). There is no count source when the corresponding rows do not exist, so count is `0`, not a guessed value. | `expert-card.tsx:73-78,167-207` hides zero metrics and shows an honest `—` for missing starting price. Starting price is derived only from real selected-service prices (`:130-145`). Existing provider/storefront and browser coverage is indirect; no focused `/api/experts` metric contract test found. **Add:** one sourced count, empty counts, and no fabricated-price assertions. |
| **5. Expert public review list**<br>`GET /api/experts/:id/reviews` | Inline route `server/routes.ts:4397-4444`; no same-path route exists in mounted routers. This is distinct from `GET /api/services/:serviceId/reviews` at `:2844-2859` and template reviews at `:5350-5358`. | Bare array of `{ id, rating, reviewText, responseText, createdAt, serviceName, reviewerName }`, capped at 50. Errors intentionally degrade to `[]`. | Joins `service_reviews` to `provider_services` and traveler `users`, filters `provider_id=:id AND status='approved'`, newest first (`routes.ts:4397-4439`). Reviewer display name is first name plus last initial; missing reviewer identity becomes `Traveler`. Optional text fields remain null. | `expert-detail.tsx:684-720` renders “No reviews yet” for an empty array, omits absent text/reply, and displays the sanitized reviewer name. Existing route coverage is not dedicated; review moderation and provider review-management tests cover adjacent write/read paths. **Add:** approved row shape, empty/no-source array, and reviewer privacy assertion. |
| **6. Ready-Made feed/source attribution**<br>`GET /api/ready-made` | Sole API registration is `server/routes/ready-made.routes.ts:938-1074`, mounted at `server/routes.ts:1071-1073`. `storefront.routes.ts:1115-1144` is HTML OG injection for `/ready-made/:id`, not an API duplicate. | `{ listings: [...] }`. Each listing includes title/theme/market/duration/pricing/image/count fields plus `authorName`, `authorId`, nullable `authorHandle`, and `section` (`trips_by_locals` for `local_expert`, otherwise `advisor`). | Query joins `ready_made_trips` to `users`, gates `status='approved' AND active=true`, and selects `users.handle` (`ready-made.routes.ts:993-1031`). `authorHandle` is null when the author has not claimed a handle; it must not be synthesized from a name. | `ready-made-card.tsx:173-245` shows real price/rating/sales only and links by listing id; the feed composition source row uses author/section data. Existing `server/routes/__tests__/ready-made-completeness-gate.test.ts` and feed-composition tests cover approval/composition, while live author-filter coverage is `server/__tests__/ready-made-author-filter.http.test.ts`. **Add:** handle-present, handle-null, and unapproved-exclusion assertions. |
| **7. Upsell candidate/bookability DTO**<br>`POST /api/upsell/*` | Router mounted before payments at `server/routes.ts:976-984`; definitions are in `server/routes/upsell.routes.ts:161-919`. Duplicate search found no other `/api/upsell` registrations. | Candidate base keys are `{ offeringId, categoryKey, sourceType, relevanceScore, revenueScore, finalScore, reason, expertEndorsed, rank }`; decorator adds `displayName` and nullable `tagline`. Cart candidates may additionally carry `bookable:{serviceId,serviceName,price}`. Date adds `hardFilteredByDate`; AI concierge adds nullable `conciergeTaskId`. | `gatherOfferingCandidates` reads catalog/category/matrix/fee-band data and approved active provider inventory (`upsell-query.service.ts:154-232`). Cart resolves only a concrete approved listing; absent inventory is filtered rather than assigned a guessed id/price (`upsell.routes.ts:193-223`). Candidate price is display-only; checkout re-derives price. | `UpsellSlot.tsx:113-174` defaults missing candidates/suppressed to `[]`, disables retries, slices by max items, and logs impressions/clicks. Existing `server/__tests__/upsell-click-payload.db.test.ts:1-83` covers attribution payloads; engine/service tests cover ranking. **Add:** concrete bookable row, absent inventory filtered, and no-amount/no-price response assertions. |
| **8. Canonical provider/earner storefront**<br>`GET /api/storefront/:handle` | `storefrontRoutes` is mounted at `server/routes.ts:1033-1040`; handler is `storefront.routes.ts:895-905`. `/s/:handle` at `:932-940` is HTML OG injection, not a JSON shadow. | `{ earner, services, templates, readyMade, away }`. Earner includes id/name/bio/avatar/role/handle/rating/review count/verification/location/memberSince/cover/offerings count. Services expose approved listing display fields, `showPrice`, resolved `bookingMode`, locale, and nullable rating/count. | Owner is a live, non-deleted, non-suspended `users` row by normalized handle (`storefront.routes.ts:554-579`). Services are `provider_services` with `approval_status='approved' AND status='active'` (`:590-623`); templates are approved+published; Ready-Made rows are approved (`:679-712`). No approved inventory yields loader null and HTTP 404 (`:714-716,895-900`). Earner rating is weighted from stored service aggregates and is null without qualifying rows (`:718-734`); location/cover/away remain null when no source exists. | `storefront.tsx:294-303,430-515,643-680` uses gradient/no-location/no-away fallbacks, “New” for no rating, and “View listing” while away. Existing `server/__tests__/storefront-role-agnostic.http.test.ts:1-127` and `service-display-options.http.test.ts` cover role parity/display options. **Add:** all three inventory lanes, no-inventory 404, null rating/location, and away-state assertions. |
| **9. Provider storefront compatibility/directory**<br>`GET /api/provider-storefront/:handle` and `/api/provider-storefronts` | Same mounted router. Singular handlers are `storefront.routes.ts:907-919`; directory is `:921-930`. No duplicate route definitions found. | Compatibility endpoint narrows the canonical loader to `{ earner, services, away }`; it does not return templates/Ready-Made. Directory returns an array of provider summaries including handle, bio/avatar, service count, nullable aggregate rating/count, and location. | Compatibility calls the canonical loader, rejects a non-provider, and returns 404 if no public provider storefront (`storefront.routes.ts:790-800,907-919`). Directory joins provider-role users to approved+active services and requires a non-null handle (`:806-892`). Missing rating remains null, not zero-as-rated. | `providers-directory.tsx:55-105,129-140` uses initials when no image, hides location because the directory DTO does not promise one, and renders `New` for unrated providers. Existing role-agnostic storefront HTTP test covers singular compatibility; directory has provider-directory presentation/browser coverage. **Add:** provider-only compatibility shape, expert rejection, empty directory, and null-rating assertions. |
| **10. Storefront/checkout attribution decision**<br>checkout attribution and rails snapshot | Checkout's live path is in `server/routes/payments.routes.ts:850-878,1192-1241,1504-1516,1580-1593`; no competing checkout writer was found for these fields. Rails decision helper is `rails-attribution.service.ts:91-314`. | Analytics fields are server-derived `source` and optional `acquisitionRef`; the money-grade per-item decision is `{ attributed, reason, ref, frame, shortLinkId, rate|null, travelerFeeWaiver|null }`. Refusals keep `attributed:false` and null rate/waiver; they do not block checkout. | Session/owner reference is confirmed: cart ownership is loaded from authenticated `userId`, while `req.body.ref` is normalized, looked up by equality against `short_links.code`, and only then stamps `source/acquisitionRef` (`payments.routes.ts:850-878`). Rails eligibility requires link owner == booked service owner, provider role, and category; the single fee resolver owns the rate/waiver (`rails-attribution.service.ts:213-240`). **Halt:** repeat-pair detection is explicitly not implemented (`fee-resolution.service.ts:23-24`). The only existing repeat predicate is unrelated customer UI grouping (`server/routes/customers.routes.ts:303-312`) and cannot be reused as fee authority. | There is no client rendering contract for the rails decision; it is booking/ledger metadata. Existing `server/__tests__/rails-attribution.db.test.ts:1-37,140-330` covers valid, malformed, expired, wrong-provider, self-referral, expert-lane, override, snapshot, and replay cases. **Add only after authorization:** session-only ref proof, repeat-pair both directions, and locked no-amount response; until then this item is blocked. |
| **11. Comparison, variants, and anchor facts**<br>`GET /api/itinerary-comparisons/:id` | Live detail registration is inline at `server/routes.ts:8765-8783`, authenticated and owner-checked. The create/pin test proves one live create registration and zero `trips.routes.ts` shadow creates (`server/routes/__tests__/itinerary-comparison-create-pin.test.ts:113-151`). No duplicate GET detail handler was found. | `{ comparison, variants, upsellSuggestions }`. Variants preserve stored row fields, `items`, `metrics`, and day-grouped activities/transport legs. Anchor fields are nullable variant facts (`anchorType`, `anchorName`, `anchorLat`, `anchorLng`, `anchorMedianMeters`). | `getComparisonWithVariants` reads one `itinerary_comparisons` row, related `itinerary_variants`, `itinerary_variant_items`, `itinerary_variant_metrics`, and `transport_legs` (`server/itinerary-optimizer.ts:1979-2050`). Generation persists AI variants and anchor facts; absent/unscorable anchors persist null rather than a guessed location (`:1536-1559`). `scoreAnchor` excludes unlocated stops and returns `medianMeters`/estimated walking time null when no stops are located (`server/services/anchor-scoring.ts:78-97`). | `itinerary-comparison.tsx` groups by `days` and falls back to item grouping when days are absent; upsells render only for a non-empty array (`:2661-2673,2317-2365`). Existing anchor null/scoring tests are `server/services/__tests__/anchor-scoring.test.ts`; create/pin route contract is `server/routes/__tests__/itinerary-comparison-create-pin.test.ts`; client payload tests are `client/src/lib/__tests__/create-comparison.test.ts`. **Add:** owner/404, variant with anchor, variant without scorable anchor, and empty upsell/no-amount assertions. |
| **12. Discover location + TravelPulse city intelligence**<br>`GET /api/discover/location/:city`, `GET /api/travelpulse/cities`, `GET /api/travelpulse/cities/:cityName` | Location route is `content.routes.ts:863-882`, live through `app.use(contentRoutes)` at `server/routes.ts:986-990`; non-API redirect router cannot shadow it. TravelPulse city routes are `content.routes.ts:5113-5140`, same mounted router. Existing shadow sweep marks the city routes identical after normalization (`docs/audits/shadow-route-sweep.md:305-310`). | Location view returns `{ city, country, generatedAt, hero, recommendations, events, neighborhoods, gems, services, externalStubs }`, with each section represented as `{data,error}`. City list returns `{ cities, count }`; detail returns intelligence or 404. City DTO includes identity/coords, pulse and trending scores, crowd/vibes, weather, price/trend/deal, counts, images, and AI fields (`shared/schema.ts:3357-3415`). | Location handler forwards country/month/year/limit/date to `locationViewService` and applies public cache (`content.routes.ts:863-877`). Service canonicalizes known city casing and isolates section failures; unknown city remains honestly empty (`location-view.service.ts:165-190,210-260,635-660`). Services require approved+active rows and structured city, with limited location fallback (`:413-495`). TravelPulse reads the `travel_pulse_cities` row and related intelligence services. Null image, trend, price, coordinate, seasonal entry, or section data remains null/empty; no fallback city or score is invented. | Discover client uses empty arrays/null section fallbacks and image fallback ordering (`discover-location.tsx:39-57,1739-1745,2020-2027`). `CityGrid.tsx:43-68,162-190` maps city DTO to `CityCard`; `CityCard.tsx:78-123,180-227` shows scores only when positive, hides absent image with a placeholder, defaults counts to zero, and uses “Trending”/“Ask a trip planner” where appropriate. Existing tests include `server/__tests__/city-case-match.db.test.ts`, TravelPulse calendar ingest tests, discover-tabs Playwright tests, and anchor candidate tests. **Add:** section envelope with one source, failed/empty section, null image/score, and city 404 assertions. |

## 4. Review-source decision evidence

The two candidate sources are not equivalent in this development database:

| Candidate | Current consumers | Read-only count | Meaning |
|---|---|---:|---|
| **A — denormalized service aggregates** | Storefront earner/services and expert storage aggregate | 225 services had either aggregate populated; 98 approved+active services had `review_count > 0`; 117 had a non-null `average_rating`; stored review-count sum was **16,172**. | Fast display snapshot. It is the current storefront source, but it can be stale or inconsistent with review rows. |
| **B — approved review rows** | `GET /api/experts/:id/reviews` and raw review aggregate in list/detail handlers | **34** `service_reviews` rows with `status='approved'`, across **10** providers; raw mean rating **4.53**. | Moderated source of individual truth, keyed by `service_id`/`provider_id`. It is not the current storefront aggregate source. |

Concrete disagreement sample:

- `provider_services.id = 76ce08ac-3d3a-4787-a3f8-48e7993c8c01` (“Test E2E Service”)
  has stored `{ review_count: 0, average_rating: null }`.
- Three approved review rows
  (`earn-demo-test-provider-qa-provider-review-1/2/3`) have ratings `5, 4, 5`,
  which is count `3`, average `4.67`.

Additional discrepancy: 19 services have `review_count=0` with a non-null stored
average. This is evidence for a source-reconciliation decision, not permission to
backfill or recalculate in Phase 0.

**Decision for implementation planning:** preserve Source A for surfaces that currently
consume stored service aggregates, preserve Source B for review-list DTOs, and require
an explicit decision before making the expert/storefront aggregate one-source-only.
The minimally additive verification must assert both sources on a known disagreement
fixture and assert that no-review state remains `null`/`New`.

## 5. Storefront attribution proof and halt condition

The attribution reference path is verified as follows:

1. The authenticated session supplies the cart owner (`payments.routes.ts:873-878`);
   the checkout body is not trusted for traveler identity.
2. The optional ref is normalized and matched to `short_links.code` (`:850-871`).
3. A valid analytics match stamps `source='link'` and `acquisitionRef`; the per-item
   rails helper separately re-reads and authorizes the link.
4. Rails applies only when the link owner is the provider owner of the booked service,
   and the single fee resolver supplies the rate and traveler-fee waiver
   (`rails-attribution.service.ts:213-240`).
5. Invalid, expired, self, wrong-provider, or wrong-lane refs default-deny the rails
   benefit while allowing checkout to continue; the decision is snapshotted on the
   booking row (`:24-29,281-314`).

The required repeat-pair predicate is **not present**. The fee resolver explicitly calls
it spec-ahead-of-code (`fee-resolution.service.ts:23-24`). The customer route's
“repeat” logic (`customers.routes.ts:303-312`) is an active-trip / booking-count UI
predicate, not a completed traveler-provider pair and not safe to use for fee resolution.

**Halt condition:** do not add or alter an attribution amount, rate, waiver, or
repeat-pair field until an authorized implementation phase defines the completed-pair
predicate, proves both first-booking and repeat-booking directions, and locks the
no-amount/refusal shape.

## 6. Exact implementation order after explicit authorization

This is the planned order only; no step has started:

1. **Freeze contract fixtures and source decision:** record the review-source ruling and
   the concrete disagreement fixture; define the null vocabulary (`null` versus empty
   collection versus client label).
2. **Expert/profile contracts:** identity, response time, rating/review summary, and
   offerings/storefront metrics (#1–#4). Verify the public approval gate and no fabricated
   response/rating/price.
3. **Review contracts:** public expert review list (#5) and any approved aggregate
   alignment. Verify moderation status, reviewer redaction, and empty state.
4. **Ready-Made feed attribution:** author handle/source section (#6). Verify approved
   feed, nullable handle, and no cross-role leakage.
5. **Upsell contract:** candidate decoration and cart bookability (#7). Verify approved
   listing resolution, display-only price, and locked no-amount behavior.
6. **Storefront contracts:** canonical earner storefront and provider compatibility/
   directory (#8–#9). Verify role gates, inventory lanes, 404/no-inventory, and null
   rating/location/away behavior.
7. **Attribution only after the halt is cleared:** session reference and repeat-pair
   proof (#10). Verify both directions, owner matching, refusal shape, and ledger
   snapshot; do not derive money from client input.
8. **Comparison/variant/anchor contract:** #11. Verify owner access, variant persistence,
   unscorable-anchor nulls, transport/day grouping, and empty upsells.
9. **Discover/TravelPulse contract:** #12. Verify section isolation, city canonicalization,
   null image/score/coordinate behavior, and 404 behavior.
10. **Run the full verification matrix:** route shadow checks, route tests, client tests,
    and live read-only samples for sourced and absent-source cases. Only then consider
    an implementation commit.

## 7. Per-item verification matrix

| Contract | Required minimum assertions after authorization |
|---|---|
| #1 Expert identity | approved expert appears with stable identity; missing form fields remain absent/null; unapproved local expert is excluded. |
| #2 Response time | authored prose and snake case normalize only in the client formatter; missing/blank value renders no promise. |
| #3 Rating summary | approved source appears with count; no qualifying reviews yields `rating:null` and `New`; disagreement fixture is explicit. |
| #4 Expert metrics | approved/published or approved/active rows count; zero rows return zero and are hidden; no price guessed from absent offerings. |
| #5 Reviews | approved row is sanitized; pending/flagged/removed do not appear; no rows render the empty state. |
| #6 Ready-Made | author handle is returned only when stored; handle-less author remains null; unapproved listing is excluded. |
| #7 Upsell | bookable candidate has a real approved service id/name; missing inventory is removed; response never supplies a charge amount as authority. |
| #8 Storefront | all public lanes preserve gates; no inventory is 404; null rating/location/cover/away stay honest. |
| #9 Provider compatibility | provider endpoint narrows shape; expert handle is rejected; directory excludes handle-less/unapproved providers. |
| #10 Attribution | session owner wins over body identity; valid and refused refs are distinguished; repeat pair is proven both directions; refusal has null rate/waiver. |
| #11 Comparison | owner and not-found checks hold; stored variant/anchor values round-trip; no located stop yields null anchor distance; empty upsells stay empty. |
| #12 Discover/TravelPulse | one failed section does not blank the payload; unknown city is honest; positive-only score/image fallbacks do not invent city intelligence. |

## 8. Out-of-scope confirmation

No DTO field was added. No migration, backfill, fee value, calculation, attribution
outcome, client rendering behavior, write path, or dispatch-ledger state was changed.
The database work was read-only counting only.

## Explicit authorization gate — GO, UNATTENDED

**GO, UNATTENDED is not granted by this report.** The Phase 0 evidence packet is ready
for the dispatch owner’s explicit authorization. Until that explicit gate is given,
stop here: do not begin implementation commits, do not choose between the two review
sources, and do not implement repeat-pair attribution or any money-adjacent DTO change.