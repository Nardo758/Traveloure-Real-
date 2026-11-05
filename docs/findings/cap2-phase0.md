# CAP-2 Phase 0 — read-only (main 6cb28bd, after 77dcf3d)

> Phase 0 rulings (Nov 5, 2026): Viator excluded from PlanItemRef (More info only; Book via PlanActions in open mode); both rails through the resolver and R323's client-coordinate path retired; a day-filtered feed counts as a chosen day; `source_withdrawn` and `city_mismatch` distinct from `unknown_source`; listing identity stays `provider_service_id`.

## A. Save sites (who writes an item today, and through which rail)

| # | Site (file:line) | Card / surface | Rail | Sends | PlanItemRef it can build today |
|---|---|---|---|---|---|
| S1 | city-feed-card.tsx:1220, :1341 (CityFeedCardGem, wrapAdd :1009) | /discover/location, /places (gem) | guest → `POST /api/guest-plans/current/items`; owner → AddToExperienceDialog | type `gem`, `sourceContentId` = gem.id, `city`, `scheduledDate` (feed day) | kind ✓, source_id ✓, city ✓, placement.day_number ✗ (scheduledDate is the feed filter, not the traveler's choice) |
| S2 | city-feed-card.tsx:1446, :1533, :1657 (CityFeedCardEvent, wrapAdd :1401) | city page events, /discover Events | same two rails | type `event`, `sourceContentId` = Fever CatalogItemId, `city`, `scheduledDate` | kind ✓ (`event`), source_id ✓, city ✓, starts_at ✗ (in `event.dates`, not sent) |
| S3 | city-feed-card.tsx:1882, :2011 (CityFeedCardVendorService, wrapAdd :1745) | city page listings | same | type `service`, `sourceContentId` = provider_services.id | kind `listing` ✓, source_id ✓, city ✓ |
| S4 | city-feed-card.tsx:2224 (CityFeedCardSupply, wrapAdd :2085) | city page hotels / activities (recommendation.service.ts → hotel_cache / activity_cache) | same | type `hotel`/`activity`, `sourceContentId` = cache row id | kind `hotel` / `activity` ✓ (today collapsed to partner_product), source_id ✓, city ✓ |
| S5 | city-feed-card-recommendation.tsx:185 (wrapAdd :133) | upsell candidate | same | type `recommendation`, **no source id** (candidate.offeringId + sourceType exist, not sent) | ✗ today — needs `listing` (platform_provider) or `affiliate_product` (affiliate) from offeringId |
| S6 | catalogue-search-results.tsx:71 → catalogue-search-copy.ts:77 (wrapAdd :51) | city search results | same | hotel: `sourceContentId` = hotel_cache id (prefix `hotel:` stripped); listing: `providerServiceId`; Viator: `viatorProductCode` | hotel ✓, listing ✓; **Viator activity has no table row — no PlanItemRef kind** |
| S7 | guest-plan-map.tsx:338 → waitlist-guest-plan.ts:301 `guestBodyForPlace`; places from browse-supply.ts:368 (gem), :374 (event), :34 (listing), :99 (partner = affiliate_products) | guest map Browse rail (/plans/new) | guest rail | `{kind, sourceId}` already | gem / event / listing ✓; partner → `affiliate_product` ✓ |
| S8 | guest-plan-map.tsx:279 `guestBodyForPendingAdd` | guest pending add (listing / partner) | guest rail | `{kind, sourceId}` | listing ✓, `affiliate_product` ✓ |
| S9 | MapControlCenter.tsx:335 → browse-supply.ts:314 `browseAddBody`; :959 `viatorAddBody` | owner /plans/{id} map Browse | owner `POST /api/trips/:id/itinerary-items` | gem/event: **title + locationName only** (no id); listing: providerServiceId + **client lat/lng**; partner: affiliateProductId; Viator: product code | gem/event ✗ (no id sent); listing ✓ but sends coords; affiliate_product ✓ |
| S10 | add-to-experience-dialog.tsx:67-89 `feedItemBody` (mounts discover-location.tsx:2112, hidden-gems.tsx:89, WishlistSection.tsx:261) | every signed-in browse save (S1–S6 owner path) | owner rail | title, description, itemType, dayNumber, scheduledDate, providerServiceId, viatorProductCode — **drops sourceContentId** | ✗: a signed-in gem/event/hotel/activity save lands with no content identity and no point |
| S11 | discover.tsx:662, :676 (`onAddToCart(service.id)`) | /discover service cards | cart rail (listing id) | provider_services.id | listing ✓ |
| S12 | PlanEntry.tsx event pick ("Plan around it") | city_events / Fever anchors in "What's on" | plan mint (anchor), **not an item save** | anchor fields (title, venue, dates, startTime) + eventSourceId | `city_event` not saved as an item today (ruling 9 gap) |

## B. Tile-button sites (book / hire / check availability / save labels outside a PlanActions)

| Site (file:line) | Labels | Mode read today |
|---|---|---|
| tile-action-copy.ts:13–22 | Check availability, View profile, Book now, Book on partner, Add to plan / Add to {day} | via callers |
| bento-action-state.ts:73–77 | Save to plan (waitlist) | caller passes mode |
| city-feed-card.tsx:625 (SaveToPlanButton), card CTAs via tileActionLabel (e.g. :1887) | Save to plan / Book / Check availability | `bookingShown` (lane2 M4 pins) |
| city-feed-card-recommendation.tsx:131–186 | Book / Save to plan | `!useBookingActionsShown()` |
| catalogue-search-results.tsx:71 | Add | wrapAdd only |
| AnchorPanel.tsx:307, :432, :319 | Stay here, See rates | `bookingShown` (R3-24) |
| StorefrontBookingPanel.tsx:196–199, :406–410 | Book a session / Request | `useBookingActionsShown` |
| landing-hero.tsx:225–239, :486–492 | Book on Traveloure, Book now, View listing | `useBookingActionsShown` |
| curated-content-section.tsx:194, :373–393 | Book Now / partner | `useBookingActionsShown` |
| deals.tsx:121, :234–242 | Book Now / Requested | `useBookingActionsShown` |
| discover.tsx:479–481, :636 | Book on Traveloure / Save to plan | `useBookingActionsShown` |
| service-detail.tsx:483, :595, :628 | Hire for this trip, Book on Traveloure | `useBookingActionsShown` |
| storefront.tsx:379–428 | Book a session, Request to book, Request a quote | `useBookingActionsShown` |
| providers-directory.tsx:66, :138 | instant-book badge | `useBookingActionsShown` |
| In-plan SaveToPlanButton: SlipView.tsx:1007, ActivitiesSection.tsx:490/517, TransportSection.tsx:283, LegRow.tsx:462, MapControlCenter.tsx:793 | Save to plan (on items already on a plan / leg rides) | P-1c |

## C. Lane 1 resolver coverage (server/services/guest-item-source.service.ts:180)

| PlanItemRef kind | Covered today | Notes |
|---|---|---|
| gem | ✓ `travel_pulse_hidden_gems`, not withdrawn | |
| event | ✓ `fever_event_cache.event_id` → live Fever | R3-17 caches listed events |
| city_event | ✗ | new resolver; `city_events.source_id` (migration 439 rows) |
| listing | ✓ `provider_services`, active + approved, not a ride | |
| affiliate_product | partial — first arm of `partner_product` (:153) | split out (ruling 8) |
| hotel | partial — second arm of `partner_product` (:162) | split out |
| activity | partial — third arm of `partner_product` (:170) | split out |
| city_mismatch / source_withdrawn reasons | ✗ | today a hidden gem and an unknown id both return `unknown_source`; no market check per item |

Owner rail (`server/routes.ts:13407`) does **not** use the resolver: it parses `insertItineraryItemSchema` off the body (:13443), so `latitude`/`longitude` and `coordSource` (`admitItemCoordSource(req.body)`, :13579) are client-supplied. That is the ruling-4 gap on the signed-in side.

## D. itinerary_items columns the server sets (shared/schema.ts:6092–6330)

title :6097, description :6098, item_type :6099, status :6100, day_number :6103, start_time :6104, end_time :6105, duration_minutes :6106, location_name :6110, latitude/longitude :6112–6113, coord_source :6117, provider_service_id :6128, affiliate_product_id :6144, scheduled_date :6183, content_type :6265, content_id :6266, origin :6328, source_class (stampItemSourceClass). All already exist; `contentType`/`contentId`/`affiliateProductId`/`coordSource` are already omitted from `insertItineraryItemSchema` (:6724). Note: listing identity is `provider_service_id`, not contentType/contentId.

## E. Schema / index need

- **None.** `content_type` is varchar(20), no CHECK — `city_event` (10 chars) fits; `hotel` / `activity` already used. Migration 436's `itinerary_items_trip_content_uidx (trip_id, content_type, content_id) WHERE content_id IS NOT NULL` covers gem / event / city_event / hotel / activity; listing and affiliate_product dedupe in the save transaction as today.

## F. Deltas for the dispatch (Phase 0 findings)

1. **Viator results** (catalogue S6, owner map S9 `viatorAddBody`) have no table row and no PlanItemRef kind. Dispatch's seven kinds don't place them; Phase 1 needs a ruling (exclude, or a kind).
2. **The signed-in rail is the bigger gap**: AddToExperienceDialog drops `sourceContentId` (S10) and the owner map sends gem/event by title only (S9), so signed-in saves carry no identity or point today. Phase 1 "both rails" covers it.
3. **Owner rail stores client lat/lng** (listing map add, any body) — ruling 4 changes owner behaviour, incl. `browseAddBody`'s listing coords (R323). Expected; flagged because it removes a sanctioned client path.
4. **Recommendation cards (S5)** send no id; Phase 2 must map `offeringId` by `sourceType`.
5. **Event start times** are on the card data (`event.dates`) but not sent; placement.starts_at is a Phase 2 card change.
6. **day_number**: cards send the feed's `scheduledDate`; ruling says day_number only when the traveler chose a day. Phase 1 must decide whether a feed-day filter counts as a choice.
7. Dispatch's line ref `shared/schema.ts:6091-6109` is the table head; the content/affiliate/origin columns are further down (6144, 6265–6266, 6328).
