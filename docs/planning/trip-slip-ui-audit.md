# Trip Slip UI audit — input to brief section H

**Status:** read-only audit. No code was changed, fixed or refactored. It holds no design proposals; those come next.
**Code base:** `origin/main` @ `da3174289` (merge of #1107). Every `file:line` below is on that commit.
**Companion:** `docs/planning/recommendation-convergence-brief.md` (same PR, #1108).

## How to read this

- **VERIFIED** means seen in the running app. The build was `da3174289`, `NODE_ENV=production`, on a local Postgres with the boot demo seed (27 approved Kyoto listings), driven by Playwright/Chromium. Network calls and console errors were recorded for each screenshot.
- **CODE-READ** means established from source only.
- **NOT VERIFIABLE HERE** means the local environment could not exercise it. The known limits:
  - no `VITE_GOOGLE_MAPS_API_KEY`, so every Google map renders "Map unavailable";
  - no AI provider key, so AI calls return 502 or 503;
  - Stripe is stubbed, so `POST /api/optimization-payments` returns 500.

  Map centering, marker sync and paid runs were therefore not seen.
- Screenshots are in `docs/planning/img/trip-slip-audit/`, re-encoded as JPEG at 900px wide (mobile shots at native width), tall pages cropped at 4000px. Names follow `<surface>-<fixture>-<state>-<desktop|mobile>.jpg`. Desktop is 1440×900; mobile is 390×844.

### Fixtures (runtime)

All fixtures are owned by one traveler account created through the API.

| id | Plan | How it was built |
|---|---|---|
| f1 | Kyoto vacation, 6 items: 5 located, 1 unlocated ("Dinner … Pontocho"). One item is `ready_for_checkout`, one is `with_expert`. | Minted through the UI plan modal (hero → travel → Kyoto → dates → "Build it myself"). Items added through the API. |
| f2 | Empty Kyoto plan | API |
| f3 | Kyoto **wedding** (`event_type=wedding`) with 2 provider-service items | API |
| f4 | Kyoto plan with an **accepted** advisor | API; the `trip_expert_advisors` row was inserted **by SQL** (a fixture, not a UI path) |
| f5 | Kyoto plan taken through Finalize (v1) → Reopen → edit → Finalize (v2) | The Finalize/Reopen steps were done through the slip and Trip Card UI |

---

## A. Screen map

### A1. Trip Slip — `/plans/:tripId`

**Route and data**
- **Route:** `client/src/App.tsx:680-686` → `client/src/pages/slip-view.tsx`.
- **Data:** a single query, `GET /api/trips/:tripId/plancard` (`slip-view.tsx:19-24`, `staleTime` 30s). It is served by `server/routes/plancard.routes.ts:390` → `assembleTripPlan`.
- **Loading state:** a bare spinner (`slip-view.tsx:26-32`).
- **Error state:** one message for every failure (`slip-view.tsx:34-43`).

**Zones, top to bottom.** The component is `client/src/components/plancard/SlipView.tsx` (SV); the rail is `SlipRail.tsx` (SR).

| # | Zone | Where | Shown when |
|---|---|---|---|
| 1 | `TripCardPrimaryBanner` ("your Trip Card is the primary view now") | SV:1267-1287, mounted SV:1611 | inside the 48-hour handover window |
| 2 | `SavePaymentMethodPrompt` | SV:1618-1623 | Finalize, when the plan holds bookable rows and the vault is known to be empty (LD 43(d)) |
| 3 | `PlanApprovalBanner` | SV:1652 | an expert-built plan awaits approval |
| 4 | `SlipHeader`: title, dates / "Set your dates", party label, destination/stops, occasion | SV:273-520, mounted SV:1656 | always |
| 5 | View bar: status counts plus List \| Map toggle | SV:1708-1751 | always; Map is disabled on an empty plan |
| 6 | Map (`MapControlCenter`) | SV:1783-1799 | Map mode only (list and map are either/or) |
| 7 | Day list: events, logistics rows, item rows, per-day "+ Add" | SV:1801-1952 | List mode |
| 8 | `ExpertSuggestionsPanel` | SV:1969 | expert suggestions exist |
| 9 | `SlipSavedPlaces` | SV:1973-1981 | the owner has saved places in this plan's city |
| 10 | `TransitionLogFooter` | SV:1983 | always |
| R | Right rail, 320px, fixed column at `lg` and above | SR:1305-1338 | always |

**Rail cards, in render order:**

| Card | Where | Contents |
|---|---|---|
| Expert | SR:695-772 | Shows who is advising; or the note "No expert is advising this plan" |
| Coordination | SR:800-841 | Done-for-you engagement status |
| Build | SR:280-664 | "Draft with AI" (empty plan only), Optimize, "Browse services", "Hand off to a local expert" |
| Ask AI | `AskAiDrawer`, mounted SR:1322 | Paid AI task (LD 45(3)) |
| Plan | SR:858-943 | Participants, events, guests |
| Share | SR:959-1047 | Share link, PDF, `.ics` |
| Finish | SR:1123-1234 | Finalize, Reopen, "Go to checkout" |

**States, with screenshots:**

| State | Desktop | Mobile | Finding |
|---|---|---|---|
| Populated list | `slip-f1-list-desktop.jpg`, `slip-f1-fold-desktop.jpg` | `slip-f1-list-mobile.jpg`, `slip-f1-fold-mobile.jpg` | VERIFIED |
| Rail | `slip-f1-rail-desktop.jpg` | `slip-f1-rail-mobile.jpg` | VERIFIED |
| Map view | `slip-f1-map-desktop.jpg`, `slip-f1-map-unlocated-desktop.jpg` | `slip-f1-map-mobile.jpg`, `slip-f1-map-unlocated-mobile.jpg` | VERIFIED. Shows "Map unavailable" (no key); the "5 of 6 stops located" and "Not on the map yet: Dinner…" lines render correctly. |
| Loading | `slip-f1-loading-desktop.jpg` | `slip-f1-loading-mobile.jpg` | VERIFIED |
| Error (plancard 500, forced) | `slip-f1-error500-desktop.jpg`, `slip-f1-trip500-desktop.jpg` | `slip-f1-error500-mobile.jpg`, `slip-f1-trip500-mobile.jpg` | VERIFIED |
| Empty plan | `slip-f2-empty-desktop.jpg`, `slip-f2-list-desktop.jpg`, `slip-f2-fold-desktop.jpg`, `slip-f2-rail-desktop.jpg` | `slip-f2-*-mobile.jpg` | VERIFIED |
| Wedding plan | `slip-f3-list-desktop.jpg`, `slip-f3-fold-desktop.jpg`, `slip-f3-rail-desktop.jpg`, `slip-f3-map-desktop.jpg` | `slip-f3-*-mobile.jpg` | VERIFIED |
| Day "+ Add" | `slip-f1-day-add-desktop.jpg`, `slip-f3-day-add-desktop.jpg` | `slip-f1-day-add-mobile.jpg`, `slip-f3-day-add-mobile.jpg` | VERIFIED |
| Item edit | `slip-f1-item-edit-desktop.jpg`, `slip-f3-item-edit-desktop.jpg` | `slip-f1-item-edit-mobile.jpg`, `slip-f3-item-edit-mobile.jpg` | VERIFIED |
| Browse services | `slip-f1-browse-services-desktop.jpg` (plus f2, f3) | `*-browse-services-mobile.jpg` | VERIFIED |
| Hire expert dialog | `slip-f1-hire-expert-desktop.jpg` (plus f2, f3) | `*-hire-expert-mobile.jpg` | VERIFIED |
| Optimize → "Build around a location" | `slip-f1-optimize-desktop.jpg`, `slip-f1-optimize-preview-desktop.jpg`, `slip-f1-optimize-generate-desktop.jpg`, `slip-f3-optimize-*-desktop.jpg` | `*-optimize-*-mobile.jpg` | VERIFIED. The generate step returns 500 silently; see G. |
| Draft with AI (empty plan) | `slip-f2-draft-ai-desktop.jpg` | `slip-f2-draft-ai-mobile.jpg` | VERIFIED. Returns 503 with a "high demand" toast (no key). |
| Ask AI drawer open | `slip-f1-askai-open-desktop.jpg` | — | VERIFIED |
| "Send to expert" with no advisor | `slip-f1-send-expert-before-desktop.jpg`, `slip-f1-send-expert-after-desktop.jpg`, `slip-f1-after-send-expert-noadvisor-desktop.jpg` | — | VERIFIED |
| Finalize → Reopen → edit → re-finalize | `slip-f5-prefinal-desktop.jpg`, `slip-f5-finalize-modal-desktop.jpg`, `slip-f5-after-finalize-desktop.jpg`, `slip-f5-reopened-desktop.jpg`, `slip-f5-after-edits-desktop.jpg`, `slip-f5-after-edits-reload-desktop.jpg`, `slip-f5-refinalize-modal-desktop.jpg`, `slip-f5-final-slip-desktop.jpg` | `slip-f5-final-slip-mobile.jpg` | VERIFIED |
| Expert viewing the traveler's slip | `expert-slip-f4-desktop.jpg` | — | VERIFIED |
| Plan modal finish (how f1 was minted) | `fx1-modal-finish.jpg` | — | VERIFIED |

### A2. Trip Card — `/trip/:id`

- **Page:** `client/src/pages/trip-details.tsx`. It mounts `PlanCard` with `role="owner"` (`trip-details.tsx:428-438`) and a 320px `TripCardRail` (LD 45(6)).
- **Data:** `PlanCard` makes its own fetch (`PlanCard.tsx:773-779`).
- **Pre-final plan:** shows an honest notice with one action to the slip, not a redirect. Screenshots: `tripcard-f1-nonfinal-desktop.jpg`, `tripcard-f1-nonfinal-mobile.jpg`. VERIFIED.
- **Final plan:** `tripcard-f5-final-desktop.jpg`, `tripcard-f5-final-mobile.jpg`, `tripcard-f5-map-desktop.jpg`. VERIFIED.
- **Routing controls on a finalized plan:** `tripcard-f5-route-controls-crop-desktop.jpg`, `tripcard-f5-after-send-expert-desktop.jpg`, `tripcard-f5-after-add-checkout-desktop.jpg`. VERIFIED.
- **After "Back to planning" (reopen):** `tripcard-f5-after-reopen-desktop.jpg`. VERIFIED.

### A3. Expert workspace — `/expert/workspace` (`client/src/pages/expert/workspace.tsx`)

**Layout.** The client plan is rendered by an embedded `PlanCard` with `role="expert"` (`workspace.tsx:3980-4006`). The editable list is a **separate** `ItemsEditorPanel` (`:783`, mounted `:4047`) that reads `GET /api/trips/:id/itinerary-items` (`:2957`), not the plancard DTO.

**Tabs.** The right panel's tabs are **Add · Advisor(n) · Distribute** (`:4071-4079`).
- "**AI Gaps**" is a section heading inside Advisor (`:4911`), not a tab.
- There is no tab called "Browse". Browsing is the Add tab's source pills (`ADD_SOURCES`, `:2366-2375`): Platform services, Platform content, My services, Partner inventory, DMO library, Google Places, Transport, Custom.

**Maps.** Three map implementations are on this one page:
- `CanvasMapSection` / `LeafletPlanMap` (`:1409`, `:1737`);
- an inline Google Map (`:1616`);
- the embedded `PlanCard`'s own map.

**Screenshots** (all VERIFIED):
- Landing: `expert-ws-f4-landing-desktop.jpg`, `expert-ws-f4-landing-mobile.jpg`.
- Add sources: `expert-ws-f4-add-*-desktop.jpg` (8 files), `expert-ws-f4-platform-catalog-desktop.jpg`, `expert-ws-f4-platform-search-tea-desktop.jpg`.
- Advisor: `expert-ws-f4-advisor-desktop.jpg`, `expert-ws-f4-advisor-idle-desktop.jpg`, `expert-ws-f4-advisor-advice-desktop.jpg`, `expert-ws-f4-advisor-aigaps-desktop.jpg`, `expert-ws-f4-aigaps-section-desktop.jpg`.
- Distribute: `expert-ws-f4-distribute-desktop.jpg`.

### A4. Recommendation-bearing surfaces

| Surface | Route | Screenshots | Status |
|---|---|---|---|
| Discover (city/location feed) | `/discover` | `reco-discover-desktop.jpg`, `reco-discover-kyoto-desktop.jpg`, `reco-discover-book-on-partner-desktop.jpg` | VERIFIED |
| Discover (mobile) | `/discover` | `reco-discover-mobile.jpg`, `reco-discover-kyoto-mobile.jpg` | VERIFIED |
| Services marketplace | `/services` | `reco-services-desktop.jpg`, `reco-services-mobile.jpg` | VERIFIED |
| Experiences index | `/experiences` | `reco-experiences-desktop.jpg`, `reco-experiences-mobile.jpg` | VERIFIED |
| Experience template (the "template builder") | `/experiences/wedding`, `/experiences/travel` | `reco-exp-wedding-*.jpg`, `reco-exp-travel-*.jpg` | VERIFIED |
| Cart | `/cart` | `reco-cart-desktop.jpg`, `reco-cart-mobile.jpg` | VERIFIED |
| Checkout step | `/cart` → checkout | `reco-checkout-step-desktop.jpg`, `reco-checkout-step-mobile.jpg` | VERIFIED |

The **experience map** is the template page's map. It renders "Map unavailable" here, so it is NOT VERIFIABLE HERE beyond that.

---

## B. Component inventory

### B1. What renders the Slip

| Component | File | Also used by | Note |
|---|---|---|---|
| `SlipView` | `plancard/SlipView.tsx` | — | Slip only |
| `SlipRail` | `plancard/SlipRail.tsx` | — | Slip only |
| `SlipItemRow` | SV:605-768 | — | **Bespoke** item row; not PlanCard's `ActivitiesSection` row |
| `SlipEventGroupBlock` | SV:1045-1140 | — | Groups items by event (LD 29) |
| `LogisticsRow` | SV:1142-1167 | — | Transport/logistics rows |
| `RoutingBadge`, `ItemKindBadge`, `OriginBadge`, `RoutingActions` | `plancard/ActivitiesSection.tsx` (imported SV:46; `RoutingActions` at :235-345) | PlanCard (Trip Card), workspace | **Shared** between Slip and Card |
| `SlipItemTools` | `plancard/SlipItemTools.tsx` | — | Add, edit, delete, up/down reorder |
| `MapControlCenter` | `components/MapControlCenter.tsx` | Trip Card map, experience map | Google-based |
| `AskAiDrawer` | mounted SR:1322 | Trip Card rail (LD 45(3), lane 4) | Same component, two mounts |
| `HireExpertDialog` | — | Rail "Hand off" | The one expert picker (LD 42 D6) |
| `BuildAroundDialog` | — | Optimize | Calls `/anchor-candidates` |
| `FinalizeBookingModal` | `FinalizeBookingModal.tsx` | — | Finalize chooser |
| `SlipSavedPlaces` | `plancard/SlipSavedPlaces.tsx` | — | LD 55 |
| `ExpertSuggestionsPanel` | mounted SV:1969 | — | Expert `trip_suggestions` |
| `SlipLogisticsSection` | `plancard/SlipLogisticsSection.tsx` | — | Guests and invites |
| `SlipTravelingParty` | — | — | Participants (LD 37) |
| `TransitionLogFooter` | mounted SV:1983 | — | — |

**Day handling:** every day is rendered in one list. There is **no `DaySelector`** on the Slip (CODE-READ SV:1801-1952; VERIFIED visually).

### B2. What renders the Trip Card

- `PlanCard` (`plancard/PlanCard.tsx`) contains:
  - `ActivitiesSection` (mounted `PlanCard.tsx:1211-1219`);
  - its own day selector and map;
  - the Purchases drawer;
  - **`PlanCardUpsellSlot`** twice — `surface="plancard_ontrip"` (`PlanCard.tsx:1259`) and `surface="plancard_pretrip"` (`:1272`) — each wrapping the generic `UpsellSlot` (`PlanCardUpsellSlot.tsx:57`).
- `TripCardRail` holds Booking agent · Your expert · Suggestion/Ask AI · Back to planning.

### B3. Duplicates (CODE-READ; counts are lower bounds)

| Concept | Implementations |
|---|---|
| Item row | ≥5: `SlipItemRow` (SV:605); `ActivitiesSection` row (PlanCard); workspace `ItemsEditorPanel` row; cart line; ready-made/itinerary preview rows |
| Plan map | ≥5: `MapControlCenter` (Slip, Trip Card, experience page); `CanvasMapSection`/`LeafletPlanMap` (workspace); inline Google Map (workspace :1616); the service-route Leaflet map (LD 22) |
| Day grouping | 6 separate groupers (slip, PlanCard, workspace editor, workspace canvas, PDF, cart) |
| Service card | 2 (`ServiceCard` in the marketplace; the discover card variant) |
| Ready-made card | 3 (`ReadyMadeThemeCard`, feed card, shelf card) |
| Expert card | 3 (experts list, cross-sell shelf, storefront header) |
| Partner/affiliate card | 3, **each with different disclosure wording**: "Traveloure Partner" (`unified-result-card.tsx:295`); "Paid partner" (`city-feed-card-recommendation.tsx`); unlabeled pinned curated content |
| Transport-leg renderer | 3 (slip `LogisticsRow`, PlanCard, workspace) |

**Components with no importer on main (CODE-READ; §18c candidates, not acted on):** `DayMapsButton`, `AssignExpertDialog`, `neighborhood-card`, `transportation-analysis`, `affiliate-transport-products`. The panels LD 45(8) removed from Home are also still present.

---

## C. Action inventory

"Correct surface" is judged by LD 42 D8/D16. The Slip is the owner's planning surface. The Trip Card is the read-out of a finished plan. An expert edits in the Workstation.

| Action | Surface | Rail / endpoint | Who sees it | Correct surface? | Status |
|---|---|---|---|---|---|
| Add item on a day | Slip | `SlipItemTools.tsx:135-158` → `POST /api/trips/:id/itinerary-items` | owner | ✅ | VERIFIED |
| Edit item | Slip | `PATCH …/itinerary-items/:itemId`. Only title, startTime, location and notes are editable (`lib/slip-item-tools.ts:207-216`) | owner | ✅ | VERIFIED |
| Delete item | Slip | `DELETE …/itinerary-items/:itemId` | owner | ✅ | CODE-READ |
| Reorder | Slip | Up/down → `POST /api/trips/:id/itinerary/reorder`. No drag and no move-to-another-day | owner | ✅ | CODE-READ |
| Route item: send to expert / add to checkout / recall | Slip | `RoutingActions` (ActivitiesSection.tsx:235-345, mounted SV:720-730; gate SV:654-655) → `POST /api/trips/:id/items/:itemId/route` | owner, expert viewer | ✅ for planning. ⚠ The gate does not check that an advisor exists (see G) | VERIFIED |
| Route item | **Trip Card** | Same `RoutingActions`, via `ActivitiesSection.tsx:821-834`. `hasActions = (isOwner \|\| isExpertViewer) && routingStatus != null && !booking && routingStatus !== "purchased"`; there is no `readOnly` prop. The server (`routing.routes.ts:127-150`) refuses only `to:"purchased"` and does not check finalization | owner | ❌ The Card is a read-out (D8) | **VERIFIED**: on finalized f5, `to:"with_expert"` → 200 and `to:"ready_for_checkout"` → 200, both persisted |
| Item comments | Slip | SV:705-719 | owner, advisor | ✅ | CODE-READ |
| Event time / budget | Slip | `PATCH /api/user-experiences/:id` | owner | ✅ | CODE-READ |
| Event role chips → provider browse | Slip | SV:840-865 | owner | ✅ (D6) | CODE-READ; no seeded `roles_needed`, so the chips were not seen |
| Draft with AI | Slip rail | SR:440-473 → `POST /api/ai/generate-itinerary`. Empty plan only (`lib/slip-rail.ts:60-85`) | owner | ✅ (LD 41(b)) | VERIFIED (503 in this environment) |
| Optimize | Slip rail | `BuildAroundDialog` (`/anchor-candidates`) → `POST /api/optimization-payments` (`lib/optimization-gate.ts:85`) → `POST /api/itinerary-comparisons` (`lib/create-comparison.ts:94-96`). Adopting a version happens on the comparison page, not the Slip | owner | ✅ | VERIFIED up to the payment call (500, silent) |
| Ask AI (paid task) | Slip rail and Trip Card rail | `AskAiDrawer` → `/api/trips/:id/proposals` | owner, write-status advisor (pay/apply owner-only) | ✅ | VERIFIED open; price shown $2.99, charged on apply |
| Browse services | Slip rail | Marketplace pre-filtered by the plan | owner | ✅ | VERIFIED |
| Hire expert | Slip rail | `HireExpertDialog` → `POST /api/trips/:id/advisors` | owner | ✅ | VERIFIED dialog |
| Trip Pass | Slip rail | `TripPassCard` | owner | ✅ | VERIFIED price $19 |
| Share link, PDF, `.ics` | Slip rail | `POST /api/trips/:id/share`, pdf, ics | owner | ✅ | CODE-READ |
| Finalize | Slip rail | `POST /api/trips/:id/finalize` plus `FinalizeBookingModal`: bulk route (`FinalizeBookingModal.tsx:80`), `affiliate-booking-requests` (:97), `expert-requests` (:122) | owner | ✅ | VERIFIED |
| Reopen | Slip rail (SR:1189-1197); Trip Card "Back to planning" | `POST /api/trips/:id/reopen` | owner | ✅ | VERIFIED |
| Go to checkout | Slip rail | Link to `/cart` (SR:1223-1230) | owner | ✅ (LD 45(4)) | VERIFIED |
| Set dates | Slip header | Owner-gated `PATCH /api/trips/:id` | owner | ✅ | CODE-READ |
| Participants | Slip Plan card | Participant routes | owner | ✅ | CODE-READ |
| Add a saved place | Slip | `POST …/itinerary-items` with **`dayNumber: 1` hard-coded** (`SlipSavedPlaces.tsx:43-55`) | owner | ✅ surface; ⚠ day is fixed | CODE-READ |
| Expert viewing the traveler Slip | Slip | Ask AI only; no route or edit tools. The page fires `GET …/trip-pass` 403 and `…/guests` 403 | expert (accepted) | ✅ (D16) | VERIFIED |

---

## D. Data flow

### D1. Slip read path (CODE-READ + VERIFIED)

`slip-view.tsx:19-24` → `GET /api/trips/:id/plancard` → `assembleTripPlan` (`server/services/trip-plan.service.ts`) → DTO `{ trip, days[], events[], destinations[], tripRole, finalVersion, … }` → `SlipView` / `SlipRail`.

1. **Before any Finalize,** `days[].activities` are built from the live `itinerary_items`.
2. **Once any `trip_finals` row exists,** the DTO is built from the **latest snapshot** (`trip-plan.service.ts:646-650`). Only booking and routing fields are overlaid from live rows (`overlayLiveBookingStatus`, `:87-101`). Title, day, time, location, cost and notes stay frozen.
3. **This holds even after Reopen**, because a reopened plan still has its `trip_finals` row. VERIFIED on f5:
   - After Reopen, an added item (201) and an edited title (PATCH 200) were in the live `itinerary-items`.
   - The Slip, even after a reload, showed neither: `slip-f5-after-edits-reload-desktop.jpg`.
   - They appeared only after re-finalizing as v2: `slip-f5-final-slip-desktop.jpg`.
   - The code comment at `:640-645` says this live-render branch is not final behavior.

**Other paths:**
- **Mutations** invalidate the plancard query key. The Slip has no optimistic updates (CODE-READ).
- **Workspace** edits go through `…/itinerary-items` directly (`workspace.tsx:2957`). The embedded PlanCard renders the plancard DTO. So the expert looks at two data sources for the same plan on one page.

### D2. Template and occasion inputs (CODE-READ)

**The hook.** `useOccasionSwitches` (`hooks/use-occasion-switches.ts:83-111`) resolves the occasion row. It uses the plan's events when they are passed; otherwise it falls back to the lossy coarse-key lookup (LD 42 D1).
- The Slip calls it **without events** at SV:1464 and SR:961.
- Only `SlipLogisticsSection.tsx:176` passes events.

**Layout branches the Slip takes from it:**
- `showsSchedule` (SV:1466);
- `isHidden` → Guests/Plan sections hidden (SV:373, SR:1011);
- the party noun;
- `canOrganizeIntoEvents`;
- anchor presets, with a `"wedding"` fallback.

Nothing else about the layout varies by template. The day list, rows and rail order are the same for every occasion (VERIFIED: compare f1 and f3 screenshots).

### D3. Slip load writes the trip context (VERIFIED; path CODE-READ)

Opening a Slip runs `activateOpenedPlan(...)` (SV:1305-1323) → `syncActiveTripToContext` (`lib/trip-selection.ts:44-53`) → the debounced `PUT /api/trip-context?tripId=…` (`lib/trip-context.ts:509-525`).

- The PUT carries `eventType` from the plancard DTO's `trip.eventType`.
- **Observed:** every Slip load PUT `eventType: "vacation"`, including for the wedding plan f3. Afterwards, `trip_contexts.context.eventType` for f3 read `vacation`.
- **Not isolated:** where in `assembleTripPlan` the DTO value comes from.

### D4. Routing state

- `itinerary_items.routing_status` is written only by `POST …/items/:itemId/route` (and by the checkout confirm for `purchased`).
- The Slip and the Card read it from the DTO; on the snapshot path, that is the live overlay.
- The cart is the `ready_for_checkout` projection (LD 39). The runtime cart showed one list across **all** of the owner's plans; see G.

### D5. Recommendation inputs today (CODE-READ unless marked)

| Surface | Ranker | Labels shown |
|---|---|---|
| `/services` | `unifiedSearch` (`storage.ts:3932`, order :3976-3987). `UnifiedResultGrid` puts partner rows **first** (`unified-result-card.tsx:463-466`) | "Traveloure Partner" (:295) |
| Curated content | pinned → placed → ILIKE (`content.routes.ts:9020-9041`) | **Pinned rows are unlabeled** |
| Ready-made feed | badge-first order (`ready-made.routes.ts:1069-1072`) | The badge is **not rendered** on `ReadyMadeThemeCard` |
| City feed / Discover | `sortByFeaturedAdjusted` (`FEATURED_BOOST=10`, `featured-sort.ts:29`) | "Featured" (`city-feed-card.tsx:1695,1777`), "Paid partner", "HIDDEN GEM", "REFERENCE PHOTO", "WANTED HERE", "EARN ON TRAVELOURE", "recommended for this trip type" (VERIFIED) |
| `UpsellSlot` (PlanCard pretrip/ontrip, cart ×2) | `rankCandidates` (`upsell-engine.service.ts`) | **`sourceType` is never rendered** (`UpsellSlot.tsx:41, 251-324`). Checkout sends no context |
| Storefront, `/api/provider-services` | **no `ORDER BY`** | — |
| Experts list | client comparator (`experts.tsx:363`) | — |
| Post-booking / `ai-concierge` / `expert-review` upsell surfaces | defined in the engine, **no client mount** | — |
| Slip | **none** | — |

---

## E. What section H can reuse

All CODE-READ, with VERIFIED where noted.

1. **The rail pattern:** SR:1305-1338 is a fixed 320px column of independent cards.
   - A card is self-contained (own query, own visibility rule).
   - `AskAiDrawer` already proves one component can mount on both the Slip and the Trip Card with only a `surface` prop varying (LD 45(3) lane 4).
2. **`UpsellSlot` / `PlanCardUpsellSlot`:** a generic surface-keyed slot calling the one engine (`UpsellSlot.tsx`; `PlanCardUpsellSlot.tsx:57`). It already mounts on PlanCard and cart and is absent from the Slip.
3. **The add rail:** `POST /api/trips/:id/itinerary-items`, the same body used by `SlipItemTools`, `SlipSavedPlaces`, the Add-to-plan dialog and role-chip browse (LD 39). Any "add this suggestion" can use it.
4. **The proposal store:** `plan_proposals` plus the pick-based service and owner-only apply (LD 45(3)). A review-first "suggestion → apply" model with the protected-set rule (LD 42 D3) already exists.
5. **Expert suggestions:** `trip_suggestions` plus `ExpertSuggestionsPanel` (SV:1969), including a named listing (LD 52(B), `provider_service_id`).
6. **Map:**
   - `MapControlCenter` already takes layers (`MapControlCenter.tsx:406`), fits bounds (`:139-150`), geocodes as a fallback (`:414-431`) and reports "X of Y located" honestly (VERIFIED text).
   - `BuildAroundDialog` / `/anchor-candidates` already produce an anchor location for Optimize.
7. **Occasion switches:** `useOccasionSwitches` and `experience_types` (LD 28/31) are the existing template authority. `roles_needed` is already read on the event header (D6).
8. **Status counts in the view bar** (SV:1708-1751). This is the only existing summary strip on the Slip.
9. **The LD 22 route map posture:** straight dashed "sequence, not routing" connectors and located-only markers, already built for service routes.
10. **The saved-places matcher** `savedPlacesForPlan` (`shared/saved-items.ts`, LD 55): a plan-scoped candidate source keyed on the plan's city and stops.

---

## F. Gaps against the target

Each gap is stated as present or absent on `da3174289`.

| # | Gap named in the request | Confirmed? | Evidence |
|---|---|---|---|
| F1 | No recommendation slot on the Slip | **Confirmed.** `UpsellSlot` mounts only in `PlanCardUpsellSlot` and `cart.tsx:2349,2894`; there is no mount in SlipView or SlipRail | CODE-READ (grep); VERIFIED visually |
| F2 | No completeness header | **Confirmed.** The header (SV:273-520) shows dates, party and stops. The view bar shows routing counts only (planned, with expert, ready, purchased). Nothing says what a plan of this occasion is missing | CODE-READ + VERIFIED |
| F3 | No anchor pin | **Confirmed.** `MapControlCenter` has no anchor/home layer. The anchor from `BuildAroundDialog` is used only as an Optimize input and never drawn | CODE-READ; map NOT VERIFIABLE HERE |
| F4 | No travel-time labels | **Confirmed.** Neither the Slip day list nor the map shows travel time between items. `LogisticsRow` shows only explicit transport legs the traveler added | CODE-READ + VERIFIED (list) |
| F5 | No suggestions layer | **Confirmed for the AI/engine side.** Expert suggestions exist (`ExpertSuggestionsPanel`) and AI proposals exist in the Ask AI drawer. Neither appears inline in the day list or on the map, and no engine-ranked suggestion appears anywhere on the Slip | CODE-READ + VERIFIED |
| F6 | No template-driven layout | **Confirmed, with a caveat.** Only the switches in D2 vary the Slip, and the Slip resolves them via the lossy lookup (no events passed, SV:1464). No section order, slot or required-category list comes from the occasion or from `template_category_matrix` | CODE-READ; VERIFIED (f1 and f3 identical structure) |
| F7 | No native labeling | **Confirmed.** There is no shared "why this is here" or sponsorship label component. Disclosure wording differs by card (B3). `UpsellSlot` renders no source. Pinned curated rows and badge-first ready-mades are unlabeled | CODE-READ + VERIFIED on Discover |

**Additional gaps found:**

| # | Gap | Evidence |
|---|---|---|
| F8 | No list↔map sync. It is either/or, with no hover or selection link, and the map has a fixed `h-[420px]` | CODE-READ SV:1783-1799 |
| F9 | Located counts use different scopes: the Slip line counts plan-wide, while map markers are per day | CODE-READ |
| F10 | No day selector or day jump on the Slip; all days render in one scroll | CODE-READ SV:1801-1952; VERIFIED |
| F11 | No mobile layout. There is no `useIsMobile` in SlipView; below `lg` the rail stacks **above** the list (SV:2003 `order-1`, :1685); item tools are `h-6 w-6` | CODE-READ + VERIFIED (G5) |
| F12 | No move-to-day and no drag reorder; reorder is up/down within a day only | CODE-READ |
| F13 | No D9 bookings section on the Slip (LD 42 D9 rules one: balance payment for owner/payer). Bookings surface only as routing badges and the cart link | CODE-READ + VERIFIED |
| F14 | No Slip-side view of a proposal's effect: Optimize adoption happens on `/itinerary-comparison/:id`, and the Slip shows only a link back | CODE-READ |
| F15 | The Slip does not pass `events` to `useOccasionSwitches`, so the one exact occasion resolution LD 42 D1 describes is unused on the Slip | CODE-READ SV:1464, SR:961 |
| F16 | No retry or distinct not-found/forbidden/server-error state on the Slip | CODE-READ `slip-view.tsx:34-43`; VERIFIED |

---

## G. Defects found along the way (not fixed)

Severity: **S1** = money, authorization or data integrity; **S2** = wrong or misleading state shown to a user; **S3** = layout or usability.

| # | Sev | Defect | Evidence | Status |
|---|---|---|---|---|
| G1 | S1 | **Trip Card routes items on a finalized plan.** Owner routing controls render on `/trip/:id` (`ActivitiesSection.tsx:821-834`, no read-only prop; `PlanCard.tsx:907-912` sets `isOwner`). The server (`routing.routes.ts:127-150`) does not refuse a finalized plan | `to:"with_expert"` → 200 and `to:"ready_for_checkout"` → 200 on f5 (finalized, no advisor); state persisted in both `itinerary-items` and the plancard. Screenshots: `tripcard-f5-route-controls-crop-desktop.jpg`, `tripcard-f5-after-send-expert-desktop.jpg`, `tripcard-f5-after-add-checkout-desktop.jpg` | VERIFIED |
| G2 | S1 | **"Send to expert" works with no advisor.** The gate (SV:654-655; ActivitiesSection :821) does not check for an advisor. The item then reads "WITH YOUR EXPERT" / "Recall from expert" although nobody will receive it | `GET …/expert-advisor` returned `{"advisors":[],"advisor":null}`; the route POST returned 200. Screenshots: `slip-f1-send-expert-after-desktop.jpg`, `slip-f1-after-send-expert-noadvisor-desktop.jpg`. Also reproduced on the finalized Slip and on the Trip Card | VERIFIED |
| G3 | S1 | **A reopened plan's Slip shows the frozen snapshot.** Adds and edits after Reopen are invisible on the Slip until re-finalize (D1) | `slip-f5-after-edits-desktop.jpg`, `slip-f5-after-edits-reload-desktop.jpg` vs `slip-f5-final-slip-desktop.jpg`; `trip-plan.service.ts:646-650` | VERIFIED |
| G4 | S1 | **Opening a Slip overwrites the plan's context `eventType` with "vacation"**, including for a wedding plan (D3) | Network PUT recorded on every load; `trip_contexts` row read after | VERIFIED |
| G5 | S1 | **The experience-template page writes into an unrelated plan.** Visiting `/experiences/wedding` or `/experiences/travel` PUT `experienceSlug` into the active plan's (f5) context and relabelled it "Your Kyoto Wedding" | `reco-exp-wedding-desktop.jpg`; network log | VERIFIED |
| G6 | S2 | **The cart merges `ready_for_checkout` items from different plans** under one date header ("Oct 26 → Oct 29") for f1 (Nov 5) and f5 (Oct 26) | `reco-cart-desktop.jpg` | VERIFIED |
| G7 | S2 | **Checkout says an on-plan item "isn't a platform booking … add it to a plan"** although it is on a plan. No service-fee line was shown; this DB's fee config was not inspected | `reco-checkout-step-desktop.jpg` | VERIFIED |
| G8 | S2 | **An Optimize payment failure is silent:** `POST /api/optimization-payments` 500 left the dialog unchanged with no message at +6s | `slip-f1-optimize-generate-desktop.jpg` | VERIFIED (the 500 is the Stripe stub; the silence is the defect) |
| G9 | S2 | **An "RECOMMENDED" item-kind chip appears on the traveler's own free-text items** | `slip-f1-list-desktop.jpg` | VERIFIED |
| G10 | S2 | **The Trip Card shows "Confirmed" on unbooked items** | `tripcard-f5-final-desktop.jpg` | VERIFIED |
| G11 | S2 | **The error state conflates 500 with 404/403:** "Couldn't load this plan. It may not exist, or you may not have access to it", with no retry | `slip-f1-error500-desktop.jpg`; `slip-view.tsx:34-43` | VERIFIED |
| G12 | S2 | **Workspace platform search misses an existing approved listing** ("tea" → `{"results":[],"count":0}` while "Sado Tea Ceremony" is approved and on the plan). The catalog fetch renders nothing; partner inventory 404s | `expert-ws-f4-platform-search-tea-desktop.jpg`, `expert-ws-f4-add-platform-services-loaded-desktop.jpg`, `expert-ws-f4-add-partner-inventory-desktop.jpg` | VERIFIED |
| G13 | S2 | **Workspace day count mismatch** (2 days in one panel vs 3 in another) and the client name renders "??" | `expert-ws-f4-landing-desktop.jpg` | VERIFIED |
| G14 | S2 | **Discover shows seed placeholder text** "⚠confirm centroid — placeholder city-center coord. Per SEED_DATA §6." as a section header, lists "Kishiwada" (Osaka) under Fushimi, and "Book on partner" ends on a dead page | `reco-discover-kyoto-desktop.jpg`, `reco-discover-book-on-partner-desktop.jpg` | VERIFIED |
| G15 | S2 | **The Optimize price differs by occasion** ($5.99 on the vacation Slip, $19.99 on the wedding Slip). Recorded as observed; whether this is the ruled band was not checked | `slip-f1-optimize-desktop.jpg`, `slip-f3-optimize-desktop.jpg` | VERIFIED |
| G16 | S2 | **An expert viewing the traveler Slip triggers 403s** (`…/trip-pass`, `…/guests`) from queries the page fires regardless of role | `expert-slip-f4-desktop.jpg`, console | VERIFIED |
| G17 | S2 | **A saved place is always added to day 1** (`SlipSavedPlaces.tsx:51`) | CODE-READ | CODE-READ |
| G18 | S2 | **The workspace Advisor "Get advice on this build" returns 502 and shows "Advice unavailable right now"** (no key) | `expert-ws-f4-advisor-advice-desktop.jpg` | VERIFIED (environment) |
| G19 | S3 | **The mobile Slip puts the rail above the list.** The list starts about 1100px down; titles truncate to 2–3 characters ("Fu…", "Ni…") beside three pills; routing buttons wrap into circles; pills overflow the card edge | `slip-f1-fold-mobile.jpg`, `slip-f1-list-mobile.jpg` | VERIFIED |
| G20 | S3 | **On the mobile Trip Card, the fixed bottom bar (Map / Get help / Share) covers item rows**, and titles wrap one word per line | `tripcard-f5-final-mobile.jpg` | VERIFIED |
| G21 | S3 | **The mobile expert workspace breaks:** the fixed 380px right panel collapses the itinerary column to about 20px, and the header clips (horizontal overflow) | `expert-ws-f4-landing-mobile.jpg` | VERIFIED |
| G22 | S3 | **The Advisor stays card uses a duplicate test id** (`card-advisor-stays` at `workspace.tsx:4691` and `:4875`), and its stays ranking is plain haversine distance (`advisor.routes.ts:296-316`) | CODE-READ | CODE-READ |
| G23 | S3 | **The experts list comparator is buggy** (`experts.tsx:363`) | CODE-READ | CODE-READ |
| G24 | S3 | **The Slip loading state is a bare spinner** with no skeleton | `slip-f1-loading-desktop.jpg` | VERIFIED |

---

## H. Contradictions with what was said or what the brief assumes

| # | Assumption | What is true on `da3174289` | Evidence |
|---|---|---|---|
| H1 | The expert workspace has **"AI Gaps"** and **"Browse"** tabs | The tabs are **Add · Advisor(n) · Distribute**. "AI Gaps" is a heading inside Advisor. There is no "Browse"; browsing is Add's eight source pills | `workspace.tsx:4071-4079`, `:4911`, `:2366-2375`; `expert-ws-f4-*` screenshots — VERIFIED |
| H2 | The owner can route items on the Trip Card | **Confirmed**, and it works on a finalized plan (G1). It contradicts LD 42 D8 (the Card is not a planning surface) | VERIFIED |
| H3 | The brief (section A inventory; phase 3 "mount on the Slip") treats the Slip as rendering the **live** plan | After the first Finalize, the Slip renders the **snapshot**, even when reopened (G3). A recommendation slot that adds items would add rows the Slip does not show until re-finalize | VERIFIED |
| H4 | The brief places the pretrip/ontrip upsell slots in the traveler's planning view | `plancard_pretrip` / `plancard_ontrip` mount on **PlanCard** (the Trip Card and the workspace's embedded card), **not the Slip** | `PlanCard.tsx:1259,1272` — CODE-READ |
| H5 | The brief treats the plan's occasion as a reliable ranking input on the Slip | The Slip resolves the occasion without events (F15). Every Slip load writes `eventType: "vacation"` into the plan's context (G4), and the template page can relabel another plan (G5). The context blob is not a trustworthy occasion source today | VERIFIED + CODE-READ |
| H6 | LD 42 D9 says the bookings section lives on the Slip | There is **no bookings section** on the Slip (F13) | CODE-READ + VERIFIED |
| H7 | LD 42 D8 says pre-final `/trip/:id` redirects | It renders a notice with one action, as the D8 wording correction already records | `tripcard-f1-nonfinal-desktop.jpg` — VERIFIED |
| H8 | The brief's map reuse assumes one map | There are ≥5 plan-map implementations (B3). The workspace alone has three. The brief names `MapControlCenter`; the workspace does not use it | CODE-READ |
| H9 | Optimize "adopt" is a Slip action | Adoption happens on the comparison page; the Slip only links back | CODE-READ |
| H10 | Maps were to be verified running | **Not verifiable here**: no Maps key. Centering, anchor, marker/list sync and travel lines on any Google map are CODE-READ only | environment |
| H11 | "Send to expert" implies an expert | The Slip and Card both offer it, and it succeeds, with no advisor (G2) | VERIFIED |
| H12 | The brief's input inventory lists the recommendation surfaces the engine serves | Three engine surfaces (post-booking, `ai-concierge`, `expert-review`) have no client mount. Storefront and provider-services have no ranking at all (D5) | CODE-READ |

---

*End of audit. Stopping here per the request: no fixes, no design.*
