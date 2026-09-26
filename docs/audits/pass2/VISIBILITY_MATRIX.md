# Visibility matrix — content type × traveler surface

Run `nu4fb2` (final, build `3304c1dc0`). Expected + governing filter columns are the Phase 0 visibility
contract (`$P2/../PHASE0_SUPPLY_DEMAND.md` §3); actual is the last observation for that
(item, surface) pair in `test-results/visibility.jsonl` tagged `nu4fb2` (`ms` = elapsed poll time when
the harness measured one; a blank `ms` means the check was a single read, not a poll). Where more than
one fixture item exercised the same surface and disagreed, both are shown — see `P2-S1-8`
(`GAP_REGISTER_PASS2.md`) for the open question that disagreement raises. Cells this run did not
exercise are marked **not exercised**.

## (a) Provider service

| surface | expected | actual (nu4fb2) | governing filter |
|---|---|---|---|
| `/api/services/:id` (immediately after submit, pre-approval) | hidden | **hidden** (all 3 fixtures) | `content.routes.ts:2334,2338` (approved+active gate) |
| `/services` browse, `location=Kyoto` | visible | Tea Ceremony **hidden**; Arashiyama **visible** (ms 37); Transfer **hidden** | `storage.ts:3913-3951` → `GET /api/discover`; see `P2-S1-8` |
| `/services` browse, `categoryKey=<own category>` | visible | Tea Ceremony (activity_provider) **hidden**; Arashiyama (tour_guide) **visible** (ms 54); Transfer (private_transportation) **hidden** | same as above, `storage.ts:3931` |
| `/services?location=Kyoto` (query-string variant) | visible | Tea Ceremony **hidden**; Arashiyama **visible** | same as above |
| `/discover/location/:city` | visible, **no limit** | Tea Ceremony **visible** on one poll (ms 20702), **hidden** on a repeat poll; Arashiyama **hidden** on one poll, **visible** on another; Transfer **hidden** | `content.routes.ts:915` → `location-view.service.ts:526,533,536` (`cityScopePredicate`) |
| `/services/:id` (detail) | visible | **visible**, all 3 (ms 20718 / 10348 / 31107) | `content.routes.ts:2334,2338` |
| Experience-template picker source (`GET /api/provider-services`) | visible, no market filter, no limit | **visible**, all 3 (ms 20737 / 10365 / 31134) | `routes.ts:3001` (approved+active+vacation) |
| `/providers` | visible | **visible**, all 3 (ms 20757 / 10382 / 31186) | `storefront.routes.ts:999` (approved+active, `handle IS NOT NULL`; ignores the verification setting per Phase 0) |
| Storefront `/s/:handle` | visible | **visible**, all 3 | `storefront.routes.ts:600,656` |
| Neighbourhood sections (inside city page) | active only, no approval check | not exercised | `location-view.service.ts:357` |
| Slip "Browse services" (`/api/discover?location=trip.destination`) | visible | not exercised | `slip-rail.ts:232` |
| Slip event role chips (`categoryKey` only, no location) | visible, global | not exercised | `discover.tsx:969-972` |
| AI free draft candidate pool | visible, LIMIT 30, no destination scope | not exercised | `content.routes.ts:5084` (`getActiveProviderServices(30)`) |
| Paid optimizer / proposals catalog | visible | not exercised | `loadOptimizerCatalog` (`location ILIKE`) |
| Advisor stays | visible, 5 km radius, vacation excluded | not exercised | `advisor.routes.ts:289-292` |
| Recommendations | approved only, **no status check** | not exercised | `recommendation.service.ts:1078,1414` |

A pending/never-submitted throwaway listing correctly stayed hidden on both checked surfaces: `/api/services/:id` (pending) and `GET /api/discover` (pending) — expected=hidden, actual=**hidden** for `Kyoto Moderation Throwaway Listing [e2e:nu4fb2]`. A dedicated timing fixture (`Kyoto Moderation Timing Listing`, no background-check gate) went from submit to visible on `/api/services/:id` in 4416ms — expected=visible, actual=**visible**.

## (b) Event packages

No traveler list exists at all (`GET /api/concierge/event-packages` has only an admin caller per Phase 0 §3(b)) — **not exercised**, consistent with there being nothing to exercise.

## (c) Ready-made trips

| surface | expected | actual (nu4fb2) | governing filter |
|---|---|---|---|
| `/ready-made` (browse) | visible | **hidden** on the first poll, **visible** on a retry (record the pass — see `GAP_REGISTER_PASS2.md` §B `P2-D6b-JOIN`-adjacent note; same "eventual consistency" shape as `P2-S1-8`) | `ready-made.routes.ts:966` (approved+active, no market, no limit) |
| `/ready-made/:id` (detail) | visible | **visible** | `ready-made.routes.ts:1117` |
| Storefront `/s/<expert handle>` | visible | **visible** | `storefront.routes.ts:833` (approval only, not `active`, per Phase 0) |
| `/experts` shelf | visible | **visible** | `ready-made.routes.ts:966` |
| City page (`/discover/location/:city`) | **hidden** — Phase 0 §3(c): "city page never shows them" (`cityWideReadyMade=null`) | **hidden** | `discover-location.tsx:1964` |

## (d) Expert offerings

Owner role is never filtered on the (a) surfaces, per Phase 0 §3(d) — **not exercised as a distinct content type this run**; the expert's own offering rode the same `provider_services` gate as (a) and stayed at `status=draft` behind the identity-verification gate (RC2-A) until seeded, then behaved as (a). No traveler surface filters by `expert_offering_type_key` (the type table is labels only, per Phase 0) — not exercised.

## (e) Expert storefront / listing

| surface | expected | actual (nu4fb2) | governing filter |
|---|---|---|---|
| `/s/:handle` | visible (as (a)) | **visible**, all 3 provider storefronts | `storefront.routes.ts:600,656` |
| `/experts` | no suspended/deleted/handle/vacation filter, includes `executive_assistant` | not exercised | `routes.ts:5068` → `storage.ts:5223` |
| HireExpertDialog | filters by location only | not exercised | — |
