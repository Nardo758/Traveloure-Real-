# Step 8b-2 — Phase 0 re-check (Track A, read-only)

> Written 2026-10-06 by Track A for `docs/planning/briefs/step-8-brief.md` revision 3.1, section "8b-2 — The map layout
> of the plan" (items 9–21, with D3/D4/D5 and the 8b-2 gates).
> **Base:** `main` `66d12a8a9b09c753db4b42ecd6dfdd142c7ac564` (`bash scripts/check-lane-base.sh 66d12a8` → OK). This
> includes 8a (R346), 8b-1 (R348) and Events 2a/2b (R347/R349).
> **Nothing was built:** no product code, no migration, no commit, no branch. `file:line` is at that base. Where
> the code and the brief disagree, the code is right and the case is marked **Brief ≠ code**.
>
> **Binding from 8b-1:** `SavePaymentMethodPrompt` is mounted in exactly two files (`SlipView.tsx`, `TripPassCard.tsx`),
> and `<TripPassCard` exactly once, in `SlipRail.tsx`. The map layout reuses these and never remounts them.

**Migrations:** none needed. Every item below is client code, or a server read that already exists.

---

## A. What the map layout is built from (items 9, 13, 19)

- **The map is already a mode of `SlipView`.**
  - `SlipView` holds `useState<"list" | "map">("list")` in `useSlipViewModel` (`SlipView.tsx:1484`).
  - In map mode the left column swaps the list for `<MapControlCenter …>` (`:2254–2277`); the header, the tools
    tray, the optimizer slot and `SlipRail` stay as they are.
  - Nothing reads `?view=` today. `slip-view.tsx:18–19` reads only `?item=`, and nothing stores a preference ✓.
- **What 8b-1 exposed for this:**
  - from `SlipView.tsx`: `useSlipViewModel` (`:1372`) and `SlipHeader` (`:328`);
  - from `SlipRail.tsx`: `useSlipAiAction` (`:287`), `SlipDraftAiRow` (`:302`) and `FinishCard` (`:1111`).
  - `ToolsTray` (`SlipView.tsx:2130`) and `HandoffChooserHost` (`:2080`) are already mounted once by `SlipView`.
- **Item 19, the band** (plan name, dates, party, the manifest tools, the expert door, the AI button, Finalize within reach):
  - Header, tools and expert door: available in place.
  - **The AI button and Finalize are not.** They live inside `SlipRail` (Build card and Finish card, `SlipRail.tsx:1376`, `:1404`).
  - Item 13 makes the map's side rail the Browse / Your plan rail, so `SlipRail` would not render in map view. The board's
    band then needs `SlipDraftAiRow` and `FinishCard` placed a **second time in code**: one JSX site in `BuildCard`/`SlipRail`
    and one in the band.
  - Only one renders per view, and neither has a mount-count test.
  - **The two binding counts are untouched either way:**
    - `SavePaymentMethodPrompt` stays where it is, at the top of `SlipView` (`:2042`), rendering in both views.
    - `<TripPassCard` stays the one in `SlipRail.tsx:620`, so map view shows no Trip Pass, which the brief's "Out of scope"
      already says.
  - (decision 3)
- **The board's controls, as ruled 2026-10-06:**
  - **"All days" chip stays out.** `MapControlCenter` shows one day at a time (`:271–284`), as the brief keeps it.
  - **"Open list view" is the existing List | Map toggle** (`SlipView.tsx:2190–2207`), reused. It is not a second control.
  - **"Draft it with AI · free" is `SlipDraftAiRow`**, reused. The board draws it in the top band (`ExperienceMap.dc.html:78`,
    the `ai` block `:550–560`).
  - The board's tray button "Open list view" is at `:300`, `:648`.
- **The board's AI button on a non-empty plan reads "Optimize · $5.99"** (`ExperienceMap.dc.html:557–560`). The brief puts
  "the Optimize comparison on the map layout" out of scope. Today the optimizer card portals from `BuildCard` into
  `SlipView`'s slot (`SlipRail.tsx:545`; slot `SlipView.tsx` `optimizerSlot`), so with `SlipRail` hidden it does not render.
  (decision 4)

## B. Item 10 — it opens on an empty plan

- **Brief ≠ code (lines):** the toggle gate is `mapDisabledReason` at `SlipView.tsx:1501–1503`, applied at `:2204–2205`, not
  `:1489–1492, 2036`.
- **Brief ≠ code (blocker the brief does not name):** an empty plan has **no days**, and the map renders **nothing**.
  - `MapControlCenter` returns `null` when `days[selectedDay]` is undefined (`MapControlCenter.tsx:264`).
  - The plancard builds `days` only from the day numbers its items carry (`server/services/trip-plan.service.ts:851`), and
    falls back to a generated itinerary only when one exists (`:1028–1038`).
  - Result: no Browse, no day chips, and **"add one to Day 2" (the signed-in e2e) cannot be done.**
  - Ruling 8 ("an add goes to the day being shown, falling back to day 1") needs day chips for days that hold nothing.
  - (decision 1)
- **Two tests pin the current gate's meaning:**
  - `slip-rail.test.ts:539` — `view.includes("mapDisabledReason")`, "the map is still offered only when located";
  - `slip-conformance.test.ts:421` — `/mapDisabledReason/`, "Map is offered only when a stop is genuinely located".
  - Both match the identifier, so keeping the name used (for example as the "Your plan" empty-state reason) keeps them
    passing.
  - **But their stated intent is the rule item 10 removes.** Passing them on a technicality is the kind of quiet edit 8b-1's
    gate exists to surface. (decision 2)

## C. Items 11–12 and D3/D4 — landing, and the guest round trip

- **Landing today** (`PlanningContext.tsx` `runBranch`, `:489–573`; **Brief ≠ code:** the brief cites `:492–516`):
  - `ai`: `if (plan.tripId) setLocation(`/plans/${plan.tripId}`); setAiOpen(true);` (`:508–509`). After the draft,
    `EnhancedPlanningModal` lands on `/plans/${data.tripId}` with no view (`:382–390`).
  - `myself`: `/plans/${plan.tripId}` (`:516`).
  - `local`: the expert door, `/plans/:id?<EXPERT_DOOR_QUERY>=…` (`expert-door.ts:15–16`), or `/experts` with no plan
    (`:557–558`). D4 leaves `local` as it is.
  - `source.onFinish` overrides all of the above (`:495–498`). Only `plan-picker.tsx:163` and `concierge/index.tsx:158` set it.
  - The `experiences` and `event_detail` doors set none (`pages/experiences.tsx:50–57`, `pages/event-detail.tsx:189`).
- **The one test pinning the exact landing string:** `client/src/lib/__tests__/smoke5-fixes.test.ts:38–43` (S2) regex-matches
  ``if (plan.tripId) setLocation(`/plans/${plan.tripId}`);\s*setAiOpen(true);``.
  - D4's map landing for `ai` changes that line, so **S2 must be edited** (decision 5).
  - `planning-entry.spec.ts:289–306, 320–359` use unanchored `/plans/…` regexes and survive a `?view=map` suffix.
  - `local-finish-mints.test.ts` H6 (`:113–116`) pins the `local` navigation, which D4 leaves alone.
- **Guest gate — Brief ≠ code: there are two gates, and only one is the brief's.**
  - **Guest `myself`:**
    - The modal's `finish` (`plan-modal.tsx:1495–1520`) mints because `myself` requires it (`plan-steps.ts:110`).
    - `mintPlan` refuses at `PlanningContext.tsx:412–416` (**Brief ≠ code:** not `:409–413`) and opens `SignInModal` with
      **no `returnTo`**.
    - It returns before `commitPlan` (`plan-modal.tsx:1514` vs `:1519`), so city, dates and party are **never written**.
      Only the occasion slug written at open survives (`PlanningContext.tsx:354–356`).
  - **Guest `ai`:**
    - It never reaches `mintPlan`. `commitPlan` writes the guest pen, and `runBranch` opens the AI form in place.
    - The form has its **own** sign-in card, whose button is `window.location.href = "/api/login"`, with no return address
      (`EnhancedPlanningModal.tsx:425`, testid `button-signin-from-modal`).
  - **After sign-in (`SignInModal.tsx:136–154`):** a full reload to `sanitizeReturnTo(returnTo)`, then
    `sessionStorage["traveloure_return_to"]`, then the role home, which is `/dashboard` (`role-utils.ts:10`).
    `App.tsx:238–247, 290–302, 321–335` already carry a return-to mechanism.
- **The guest pen** is sessionStorage (`trip-context.ts:181–183`).
  - Its server push is refused for a guest (`server/routes/trip-context.routes.ts:229, 267`), so G2 holds today.
  - On sign-in `handOffGuestPen` (`trip-context.ts:718–757`) PUTs the guest's answers **only into an empty server pen**, and
    mints nothing.
  - **D3's record would sit beside this hand-off,** and the two could duplicate or disagree. (decision 6)
- **Precedent for D3's record:** `PENDING_GEM_RECOVERY_KEY` (`PlanningContext.tsx:227–258`) is a short-lived sessionStorage
  record read once after sign-in. It is the same shape D3 asks for.
- **Tests that change with the guest gate:**
  - `planning-entry.spec.ts:155–163` — `ai` shows `button-signin-from-modal`.
  - `planning-entry.spec.ts:165–170` — `local` goes to `/experts`, unchanged by D4.
  - `planning-entry.spec.ts:172–177` — `myself` shows `modal-sign-in`.
  - `rc1-finish-mints.test.ts` R1 (`:31–36`) — `ai` is not a required mint, so a guest reaches the AI form.
  - No signed-out round-trip e2e exists.

## D. Items 14–18 — Browse, filters, add, located, connectors

- **`MapControlCenter`:** `client/src/components/plancard/MapControlCenter.tsx`, 508 lines. Its `tripId` prop is required
  (`:66`); D3 makes that 8d's problem, not 8b-2's.
  - **Layers, Brief ≠ code:** two independent toggles, "Plan" and "Browse" (`:301–323`, state `:126–133`). They are not
    exclusive, and there is no "Your plan" layer. Browse is hidden when `readOnly` (`:133, 312`). (decision 7)
  - **What Browse lists today:**
    - listings: `/api/services?location=<city>[&categoryId=]` (`:156–157`);
    - partner places: `/api/affiliate/products?city=<city>&limit=100` (`:158–159`);
    - hosts: `/api/experts?location=<city>` (`:160–168`), the first 8 (`:184`), listed and never pinned ✓.
    - It has no tabs, no search and no budget filter. The only filter is the "Find a host" `categoryKey`, shown as
      "Showing … · show everything" (`:413–420`).
    - Category ids come from `/api/service-categories` (`:150–155`). **Brief ≠ code (minor):** the brief cites `:150–156`;
      `:156` is the listings URL.
  - **Add (item 16):** `POST /api/trips/${tripId}/itinerary-items` with `browseAddBody(place, dayNumber ?? 1)` (`:187–198`).
    - The day is the shown day's `dayNum` (`:145`) ✓.
    - The button reads "Add to day N" (`:444`). **Brief ≠ code:** the brief writes "Add to Day 2", and there is no
      "On Day 2 · Remove" state.
- **`client/src/lib/browse-supply.ts`, 90 lines:**
  - **Brief ≠ code (keys):** `PARTNER_CATEGORY_WORDS` (`:32–37`) is keyed `activity_provider`, `dining_venue`,
    `accommodation`, `private_transportation`. The brief's "dining" and "transfer" are those last two.
  - **There is no `tour_guide` entry**, so an Activities tab filtering by `tour_guide` drops every partner place. (decision 8)
  - **The "no category text stays out" rule (brief `:27–31`)** really says a *key with no words* filters partner places out.
    A row with empty text is dropped only when a key is set (`:43–44`).
  - **`listingPlaces` (`:15–25`)** reads `r.serviceType`, not a category key. Its price label is always `$N` (`:23`), even for
    `show_price = false` and quote-only rows. That is a **live §13 defect** in today's Browse; `offeringPriceLabel`
    (`expert-door.ts:52–61`) already answers "By quote".
  - `browseAddBody` (`:68–90`) always sends `itemType: "activity"`. It writes lat/lng when present, including a property
    listing's **jittered** coordinates (`locationApproximate`, `server/services/property-location-privacy.service.ts:92–108`).
    (decision 9)
- **Filter fields on the rows (item 15):**
  - **`GET /api/services`** (`content.routes.ts:2870–2880` → `storage.getAllActiveServices`, `storage.ts:3194–3231`):
    - it carries `categoryId` (no key), `price`, `priceType` (`fixed | variable | custom_quote | hourly | package_tiers |
      per_event | range | per_person`), `pricingTiers`, `showPrice`, `pricingUnit`, `priceBasis`, lat/lng;
    - the unit comes from `resolvePriceUnit` (`client/src/lib/price-unit.ts:52`), and `null` means no unit.
    - **There is no currency column on `provider_services`.** (decision 10)
    - The query filters one `categoryId`, so Activities (`activity_provider` + `tour_guide`) needs two reads or a client
      filter.
  - **`GET /api/affiliate/products`** (`content.routes.ts:8795–8819` → `affiliate-scraper.service.ts:555–607`):
    - it carries `category`, `subCategory`, `price`, `currency` (default USD), `coordinates` and `rating`, with URLs
      stripped;
    - the server already supports `minPrice`, `maxPrice`, `search` and `category`, unused by Browse.
  - **`GET /api/experts`** (`server/routes.ts:5423ff`): a list filtered by `location`, with no market parameter and no
    coordinates ✓.
- **The tab → supply table:** all five keys exist in migration 034 (`private_transportation :70`, `tour_guide :75`,
  `accommodation :85`, `dining_venue :90`, `activity_provider :95`).
  - **Brief ≠ code (minor):** `scripts/lib/taxonomy-registry.cjs` lists migration files (`:80–89`), not keys.
  - "Remaining categories" for Services would include `venue` (285) and the four `aff_*` affiliate-source keys, which LD 31
    says are not hireable roles. (decision 8)
- **Located (item 17) — Brief ≠ code, "one predicate":** there are three.
  - `isLocated` (`MapControlCenter.tsx:53–55`) ✓.
  - `map-scene.ts`'s own `located` (`:102–103`).
  - `isLocatedStop` (`client/src/lib/plan-stops.ts:114`).
  - "Not on the map yet" renders twice: per day in MCC (`:397–408`), and per trip in SlipView (`:2272–2276`).
  - The trip's "X of Y located" is SlipView's (`:2210–2221`), pinned by `no-ward-pins.test.ts:64–70`.
- **Connectors (item 18):** straight lines between located, non-ghost stops in day order (`map-scene.ts:151, :156`).
  **Brief ≠ code (minor):** `:152–153` is the anchor.
- **No reusable tab vocabulary and no budget or price-filter helper exist.** The Workstation's chips are inline literals
  (`pages/expert/workspace.tsx:3462, 3582`).
- **Tests on these files:**
  - `map-scene.test.ts`:
    - M3 (`:78–110`) pins located-only browse markers, the `activity_provider` filter, "hosts never pinned" and the add body.
    - M7 (`:181–188`) source-reads one exact line of `MapControlCenter.tsx`.
    - M8 (`:190–207`) pins MCC as the only map.
  - `check-trip-card-honesty.cjs:106` checks MCC for a `0,0` centre.
  - There is no browse-supply test.

## E. Items 20–21 — the re-route (D5)

- **Routes:**
  - `/experiences` is at `App.tsx:610–612`, wrapped in `Layout`.
  - `/experiences/:slug` (`:613–615`) and `/experiences/:slug/new` (`:616–618`) render `ExperienceTemplatePage` with **no
    `Layout`**; the page draws its own (`experience-template.tsx:2121`).
- **The start page cannot pre-pick an occasion today.**
  - `occasionSlug` always starts `""` (`experiences.tsx:43`), and only the city is pre-picked (`:35–36`,
    `experiences-entry.ts:26–28`).
  - Seeding it with the slug is enough: `OccasionPicker` already opens on the picked row's group (`OccasionPicker.tsx:49–53`),
    and an unknown slug leaves Continue off (`experiences-entry.ts:84`).
- **The three smoke-11 causes, confirmed:**
  1. **Path-style catalog keys.**
     - **Brief ≠ code:** there are five, not one: tiqets, wegotrip, viator-feed, activities-gyg and klook
       (`experience-template.tsx:338–354`, joined by `queryClient.ts:70`).
     - The server has only `?destination=` routes (`content.routes.ts:1523, 1543, 1562, 1653, 1672`).
     - They fire only when the saved tab is an activities tab (`:929`, `:2610`).
  2. **Geocode.** `POST /api/geocode` runs on mount whenever a destination exists (`experience-template.tsx:1300–1328`). The
     server answers `404 "Location not found"` (`content.routes.ts:4359, 4377`).
  3. **Context rewrite.** The persist effect `:1155–1216` calls `writeTemplatePen` (`:1203–1210`; `template-pen.ts:33–52`) on
     every filter, sort and tab change. It **unbinds the active plan on a city mismatch**
     (`switchTripContextPreservingId`, `trip-context.ts:448–457`), and merges `experienceSlug` when no plan is bound.
  - Rendering the start page instead removes all three, because none of that code runs.
- **Links into slug pages:**
  - `experience-card.tsx:42`
  - `landing/experiences-rail.tsx:33, 40`
  - `landing/moments-section.tsx:132`
  - `travelpulse/ExperienceTemplates.tsx:156`
  - `nav-config.ts:177–239`
  - `feed-stream.ts:80, 88, 96` — the slugs `photo`, `transport` and `dining` are **not occasions** (decision 11)
  - `curated-content-section.tsx:280` — `/experiences/travel/new?destination=<dest>`, the only one with a param;
    `preselectedMarket` would read it on an exact match.
- **Item 21's citations:**
  - `template-external-add.ts:13–19` ✓.
  - `server/routes.ts`: **Brief ≠ code (minor):** the route is at `:13155`, and `affiliateProductId` is handled at
    `:13259–13277`.
  - `slip-viewer-role.ts:35–37` ✓.
  - Browse already adds partner rows by `affiliateProductId` ✓.
- **Specs that break on the re-route, because they assert the template:** (decision 12)
  - `playwright/tests/selection-controls.spec.ts:34` (asserts at `:56, 82, 129, 155, 178`).
  - `playwright/tests/cosmetic-public-surfaces.spec.ts:86–88` (`[data-panel-group]` on three slug URLs).
  - The source-text unit tests that read `experience-template.tsx` keep passing while the file exists. 8c deletes it.
  - `check-planning-entry.cjs:147–151` requires `experienceSlug` from that file, and fails if the file goes. That is 8c's.

## Not proven

- I have hand-checked these against the code:
  - `MapControlCenter.tsx:264`;
  - `trip-plan.service.ts:851`;
  - the `PlanningContext.tsx:412–416` gate;
  - `smoke5-fixes` S2;
  - the `EnhancedPlanningModal` `/api/login` button;
  - the two `mapDisabledReason` pins;
  - the board's AI and tray strings.
- The rest comes from three read-only sweeps (map and Browse; landing and guest; re-route), with their `file:line` taken as
  reported.
- No e2e was run for Phase 0. Production data was not read: there is no answer yet on how many listings have a `show_price`
  false or quote-only price.

## Decisions the lane needs (not taken here)

1. **Day chips on an empty plan.** The plancard has no days until an item exists, so the map renders nothing and "Add to
   Day 2" is unreachable.
   - Option a: the map layout derives the day list from the trip's own window (`startDate..endDate`, both NOT NULL) when the
     plancard has none, in a pure helper. A day with no items shows an empty chip.
   - Option b: the server's plancard emits empty days.
   - **Recommend (a).** It is client-only, reads two columns the plan already has, and leaves the server DTO and its readers
     alone. A placeholder window (`dates_confirmed_at` NULL, LD 30) still has its days, and its label says so.
2. **The two "offered only when located" test pins** (`slip-rail.test.ts:539`, `slip-conformance.test.ts:421`). Item 10 makes
   the map always reachable.
   - **Recommend:** amend both pins' *wording* by ruling, from "offered only when located" to "honest about located".
   - Keep `mapDisabledReason`'s text as the "Your plan" empty-state line, rather than pass them on the identifier alone.
   - This needs your sanction as a test edit.
3. **The band's AI button and Finalize.** In map view `SlipRail` gives way to the Browse / Your plan rail (item 13), so the
   band needs `SlipDraftAiRow` and `FinishCard` at a **second JSX site**. Only one renders per view.
   - The binding counts are untouched: `SavePaymentMethodPrompt` stays at the top of `SlipView`, and `<TripPassCard` stays
     in `SlipRail`.
   - **Recommend** the second site, inside `SlipView.tsx`'s map branch. Otherwise keep `SlipRail` visible in map view and
     draw the board's band without them.
4. **Optimize on a non-empty plan in map view.** The board shows "Optimize · $5.99"; the brief puts the Optimize comparison
   out of scope.
   - **Recommend:** the band shows nothing for AI once the plan holds anything, and "Open list view" leads to Optimize.
   - Alternatively, portal the existing `OptimizerLead` into the band, which still never mounts a second optimizer.
5. **`smoke5-fixes` S2** pins the exact `/plans/${plan.tripId}` landing that D4 changes for `ai`. It cannot pass unedited.
   **Recommend:** a sanctioned edit to the new landing's exact form, with the same single-landing intent.
6. **D3's record against today's pen hand-off.**
   - **Recommend:** one sessionStorage record on the `PENDING_GEM_RECOVERY_KEY` pattern (`PlanningContext.tsx:227–258`),
     holding the answers, the door and the branch, with an expiry.
   - It is written at the guest gate for both `myself` and `ai`, and read once in `PlanningProvider` on the first signed-in
     render.
   - It is **cleared before** the one mint. A failed mint keeps the answers on the page to retry.
   - `handOffGuestPen` is **skipped when a record exists**, so the two cannot disagree.
   - The AI form's own `/api/login` button goes through `SignInModal` with the same record, so there is one gate, not two.
     That changes `planning-entry.spec.ts:155–163, 172–177` and `rc1-finish-mints` R1 (sanctioned edits).
7. **Layers.**
   - **Recommend:** keep MCC's two toggles, and name the Plan toggle "Your plan".
   - The rail follows whichever is shown, with Browse winning when both are on, so nothing in MCC's layer model is
     rewritten.
8. **Tabs and their keys.**
   - **Recommend:**
     - Activities = `activity_provider` + `tour_guide` listings, with partner words keyed to `activity_provider` only.
     - Services = the remaining categories **minus the four `aff_*` keys** (LD 31: sources, not roles).
     - `venue` stays in Services.
     - `PARTNER_CATEGORY_WORDS` gains no new words.
9. **Jittered property coordinates on an add.**
   - **Recommend:** a `locationApproximate` row adds **unlocated** (no lat/lng), because a deliberately blurred point is not
     an exact location (ruling 7, §13).
10. **Budget on listings with no currency column.**
    - **Recommend:** a listing price counts as USD for the filter only when `showPrice` is true and `priceType` is one with a
      single shown amount (`fixed`, `per_person`, `per_event`, `hourly`).
    - `custom_quote`, `range`, `variable` and `package_tiers` are left out and counted, per the brief.
    - Partner rows match only when `currency = 'USD'`.
    - Same build: fix today's `$N` label for hidden or quote-only listings through `offeringPriceLabel` (the §13 defect
      above).
11. **Slugs that are not occasions** (`/experiences/photo`, `/transport`, `/dining` from `feed-stream.ts`).
    - **Recommend:** the start page with nothing picked, never a nearest occasion. Same `Layout` as `/experiences`.
12. **The two template specs** (`selection-controls`, `cosmetic-public-surfaces` B1).
    - **Recommend:** re-point them at what the URL now renders (the start page with the occasion picked), as sanctioned test
      edits in 8b-2.
    - The template's behaviours they test leave with the page in 8c.

## Decisions as taken (decision-maker go, 2026-10-06: "8b-2 Phase 0 accepted. Go, base 66d12a8 or later.")

1. **Day chips** come from the trip's own start and end dates when there are no items. A plan with no dates gets a
   single Day 1. Client only (`client/src/lib/map-days.ts`).
2. **The two "only when located" pins** are amended (sanctioned). The old reason text becomes the empty "Your plan"
   line.
3. **`SlipDraftAiRow` and `FinishCard`** get a second placement inside SlipView's map view, and one renders per view.
   The two binding counts are unchanged, as these tests prove:
   - `SavePaymentMethodPrompt` is in exactly two files (`client/src/lib/__tests__/save-payment-prompt.test.ts` A6).
   - `<TripPassCard` appears once, in `SlipRail.tsx` (`client/src/lib/__tests__/slip-rail.test.ts` S8, and
     `client/src/lib/__tests__/step8b2-map-layout.test.ts` M10).
4. **No AI button** in the map band on a non-empty plan. "List" (the existing toggle) leads to Optimize.
5. **`smoke5-fixes` S2** is edited to the new landing (sanctioned).
6. **D3:** one short-lived browser record.
   - It is written at both gates, has a one-hour expiry, and never puts answers in the URL.
   - It is read once after sign-in and cleared before the plan is created.
   - The existing guest hand-off is skipped when the record exists.
   - The AI form signs in through the same sign-in modal.
   - The three guest tests are sanctioned.
7. **The two map toggles are kept.** "Plan" becomes "Your plan", and the side rail follows the shown layer.
8. **Tabs.** Activities = `activity_provider` + `tour_guide`. Services = everything else except the four
   affiliate-source keys. No new partner words.
9. **Blurred coordinates:** the add goes in unlocated, with no pin.
10. **Budget** counts only shown single-amount USD prices. Quote-only and range prices are left out and counted
    ("+ N by quote"). The "$N" label on hidden-price and quote-only listings is fixed with the existing "By quote"
    helper.
11. **Non-occasion slugs** (photo, transport, dining) go to the start page with nothing picked.
12. **The two template specs** are pointed at what the URL now shows (sanctioned).

**Added during the build (sanctioned 2026-10-06):** `playwright/tests/slip-rail-actions.spec.ts` A2 (`:122–124`,
`:140–142`). The map is enabled on both plans; the empty plan opens on Browse, with the old reason text as the empty
"Your plan" line. **The sanctioned list is nine.**

**Gate:** any test edit outside the nine is a stop-and-report.
