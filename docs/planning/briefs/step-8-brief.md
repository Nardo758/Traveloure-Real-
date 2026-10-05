# Step 8 brief — the Experiences entry and the map planner

**For Track A. Revision 3.1, 5 Oct 2026 (ET).** It carries rulings 4–10 of
`docs/planning/briefs/experiences-map-planner-rulings-2.md`, and the six decisions and the tab-to-supply
map from Track A's Phase 0 report of 5 Oct (section "Decisions from Phase 0" below). 3.1 folds in Track
A's corrections from its re-read: the `plan-steps.ts` edit, the finish named by branch, the partner rows
that stay out, and the flights flag. Reference: surface
spec v1.3.7 as amended by R330; `docs/planning/briefs/experiences-map-planner.md` (A1, A3; its Lanes 3
and 4 are built here); the Lane 0 audit `experiences-map-planner-phase0-audit.md` (cited as "audit");
boards in `docs/design/experiences-map-planner/`.

**Base:** `main` HEAD at dispatch, after #1306 merges. The dispatcher fills in the SHA; the lane's first
action is `bash scripts/check-lane-base.sh <sha>`.
**Before 8a starts:** #1306 merged with the update pack, the deploy done, smokes 12 and 13 run, the branch
rebased, and this revision re-read against that `main`.

**Five PRs in this order: 8a, 8b-1, 8b-2, 8c, 8d.** One ledger row each, the next R-number. Every merge
leaves `main` deployable; there is no deploy hold. No migration is expected; needing one is a hard stop.

Where this brief and the code disagree about what exists today, the code is right: report it.

## Rulings that shape this step

- **The map planner is a planner in its own right (A3.1), on the one plan store (LD 39).** In code it is a
  map-first layout of the same plan: the same `MapControlCenter`, `DayBlock`, `ItemRow` and writers. It is
  not `experience-template.tsx` revived and not a second set of components. Everything can be done there
  without opening the list: add, remove, pick a day, the AI button, the expert door, Finalize.
- **Groups first (A3.4).** Five labels, one home: "A trip", "One evening", "A celebration",
  "A hosted event", "A group getaway".
- **Ruling 4. Proposal sits under "One evening".** `experienceGroupFor` already puts it there. Its
  `default_visibility: "hidden"` hides the plan from sharing, not the occasion from the picker.
- **Ruling 5. An occasion in no group** (`plain_plan`) appears only under "See all occasions" and in search,
  in an ungrouped list. No sixth label. All 29 seeded rows fall into the five groups; production was not read.
- **Ruling 6. `/experiences` stops opening `IntakePanel` in 8a.** The guard
  `scripts/check-planning-entry.cjs` is amended in the same PR.
- **Ruling 7. No area marks on the map.** Ledger `2026-10-03-no-ward-pins` stands. An item with no exact
  location is listed and labelled "Not on the map yet"; it gets no pin, ring or shading.
- **Ruling 8. No day-less items.** An add goes to the day being shown, falling back to day 1.
  `itinerary_items.day_number` stays NOT NULL.
- **Ruling 9. The map opens on an empty plan, showing Browse.** Only "Your plan" waits for located stops.
- **Ruling 10, as refined below.** Signed-out browsing on the map is 8d, last.
- **AI button:** LD 41 unchanged. Free only while the plan is empty. Amounts resolve from `fee_bands`; the
  "$2.99" and "$5.99" on the boards are beta values, never literals in code.
- **Coral:** filled buttons this step touches use the fill colour (`#C8443D`) through its token, not a hex.

## Decisions from Phase 0 (5 Oct)

- **D1. The pop-up may open at When from the Experiences start page.** This amends rule 4 in
  `client/src/lib/plan-steps.ts` ("steps 2 and 3 are never skipped", LD 33) and its `CLAUDE.md` text,
  narrowly: the traveler answers Where on the page itself, so nothing is skipped. Conditions: Continue is
  disabled until an occasion and one of the eight cities both show as picked on the page; Where stays
  reachable by Back; every other door keeps the rule as written. This is the one edit to
  `resolvePlanSteps`: `focusStep` is typed `"who"` only today (`plan-steps.ts:222`, read at `:272–279`), so
  8a widens it for this door, with its test and the LD 33 text.
- **D2.** Ruling 8 above. No migration.
- **D3. One short-lived browser record carries a guest through sign-in.** Today the guest gate drops the
  answers (`PlanningContext.tsx:409–413`). Split: **8b-2** covers the answers and the return address;
  **8d** adds at most one pending add and plan-less browsing. Rules for the record:
  - `sessionStorage`, with an expiry; it holds answers and one action, never credentials.
  - After sign-in it is read once and **cleared before the plan is created**, so a reload cannot make a
    second plan.
  - If creating the plan then fails, the answers are still in hand on that page and the traveler can retry;
    they are not silently dropped.
  - The plan is created through the one existing mint and the add through the existing writer. Nothing is
    stored for a guest on the server (G2 stands).
- **D4. A new `experiences` door** in the closed door list (`DOORS_THAT_START_A_NEW_PLAN`,
  `plan-steps.ts:152`). The landing is keyed on the finish's branch, not its label. Map view: a plan
  started from the `experiences` door and finished on branch `ai` ("Plan with AI", `nav.json:141`) or
  `myself`; and a plan finished on branch `ai` from any door (A3.6). Branch `local` keeps its current
  landing from every door.
- **D5. No deploy hold.** In 8a `/experiences` becomes the start page; `/experiences/:slug` and
  `/experiences/:slug/new` stay on the old template page. The re-route and the three smoke-11 fixes move
  to 8b-2.
- **D6. The "Show / Festival · Plan around it" card on the start board is not built in step 8.** It is an
  unruled door, and a third reader of event data before the Events lane reconciles the two lists.

## 8a — Entry

Boards: `Experiences`, `ExperiencesMobile`, `PlanModal`.

1. **One picker component**, used by the page and by the modal's occasion step
   (`plan-modal.tsx:1903–1950`, a flat grid today). Groups, then the occasions in the chosen group, then
   "See all occasions" and search. Built from the catalog: the group comes from `experienceGroupFor` run
   on the rows `GET /api/experience-types` already returns; no hardcoded occasion list. The picker ends
   with `setOccasionSlug`, so the picker itself leaves `resolvePlanSteps` untouched; D1's door change is
   the one edit there.
2. **`/experiences` is the starting state:** the picker on the left, Where on the right (the eight city
   cards and the map with eight pins). Continue opens the one modal at When (D1), through the new
   `experiences` door (D4).
3. **`IntakePanel` leaves `/experiences`** (`experiences.tsx:121–127, 215–220`). Amend
   `scripts/check-planning-entry.cjs:82–86, 169–175, 238–245` so the page must open the one modal through
   the shared picker, and still fails on a second intake. Other `IntakePanel` callers are not touched (D11
   is its own lane): list them in the report.
4. **The label guard.** Nothing guards the labels today. Add one check: the five strings come from one
   home, and the picker renders exactly those five as group labels.
5. **e2e specs that click `option-occasion-*` straight after opening** (`planning-entry.spec.ts:80, 105,
   112, 131, 141`; `j-kyoto-trips-golden-path.spec.ts:202, 234, 249, 250, 316, 326`) click a group first. Keep the tile
   test ids.
6. The page no longer shows a template count ("Choose from 8 curated experience templates",
   `experiences.tsx:108`, goes).
7. `FOLLOWUPS.md`: cart edits and deletes can desync a row that mirrors a plan item; the cart's "convert to
   itinerary" can duplicate a projected item.

Until 8b-2 a new plan lands on the slip's list view, as today, and the old slug pages still work.

## 8b-1 — Extraction, no behaviour change

8. `SlipView` (2,466 lines, one JSX tree) cannot take a layout switch cleanly. Move its calculations into
   one shared hook and expose the header, AI button and Finalize pieces. **Nothing a traveler sees
   changes.** The existing tests pass without edits; a test edited to pass is a finding to report.

## 8b-2 — The map layout of the plan

Boards: `ExperienceMap`, `ExperienceMapMobile` (member states; the guest add-gate states are 8d). The
board file name is unrelated to the old `ExperienceMap` component, which 8c deletes.

9. **A sibling map layout at `/plans/:id?view=map`**, using the same map, day and item components as the
   list. No stored preference.
10. **It opens on an empty plan.** The Map toggle is disabled when nothing is located
    (`SlipView.tsx:1489–1492, 2036`). Change: the map view is always reachable; with no located stops it
    opens on Browse; "Your plan" shows its empty state.
11. **Landing** as D4, set at the finish (`source.onFinish` or the navigation in `runBranch`,
    `PlanningContext.tsx:492–516`).
12. **A guest who finishes the pop-up on branch `ai` or `myself` keeps their answers through sign-in** (D3, first half) and lands on
    the new plan's map view, not `/dashboard`.
13. **The rail** beside `MapControlCenter` follows the map's layer: Browse or Your plan.
14. **Browse tabs and supply.** Three sources: listings (`GET /api/services`), partner places
    (`GET /api/affiliate/products`), hosts (`GET /api/experts`, a list under the map, never pins).

    | Tab | Supply |
    |---|---|
    | Activities | Listings in `activity_provider` / `tour_guide`; partner places by `PARTNER_CATEGORY_WORDS.activity_provider` |
    | Hotels | Listings in `accommodation`; partner places by the accommodation words |
    | Services | Listings in the remaining `service_categories` |
    | Dining | Listings in `dining_venue`; partner places by the dining words |
    | Transportation | Listings in `private_transportation`; partner places by the transfer words |

    There is no Flights tab: flights stay the "Getting there" tool on the band. By its own header,
    `FLIGHT_LOOKUP_ENABLED` gates only the schedule lookup; with it off the sheet takes a manual time
    (`server/config/flight-lookup.config.ts:4–5`). Confirm at the 8b-2 re-check that the chip still shows
    with the flag off; if it does not, report it. A partner place with no
    category text stays out of a tab; it is never guessed in (`browse-supply.ts:27–31`).
15. **Filters. A filter ships only where the row carries the field.** First cut:
    - **Budget**, on every tab. It matches only rows with a shown price in USD. A row with no price, a
      hidden price (`provider_services.show_price` false), a quote-only price type, or another currency
      (`affiliate_products.currency`) is not matched, and the rail says how many were left out for that
      reason. A hidden price is never used to filter. The card shows the price's unit (per person, per
      night, per hour) where the row states one and the bare price where it does not; a unit is never
      guessed.
    - **Category**, on Services (`/api/service-categories`, already wired at `MapControlCenter.tsx:150–156`).
    - **Search**, new (the template's box was never wired).
    - **Not built:** rating (listings have no rating, so it would drop every listing), hotel stars (they
      exist only in the Amadeus hotel cache, not in Browse), distance (a radius around a guessed centre),
      and the seeded tag controls (no listing has tags).
16. **Add** from a card or a pin through the existing Browse add (`MapControlCenter.tsx:187–199`), to the
    day shown; the button says which day ("Add to Day 2") and, once added, "On Day 2 · Remove".
17. **Located and not.** One predicate, `isLocated` (`MapControlCenter.tsx:53`). Located items get a pin.
    The rest are listed with "Not on the map yet", and the rail says how many.
18. **Your plan.** Days, numbered stops, straight connectors between located stops in day order
    (`map-scene.ts:151–156`), "X of Y located".
19. **The band.** Plan name, dates, party, the manifest tools (`ToolsTray`), the expert door
    (`HandoffChooser`), the AI button, Finalize within reach.
20. **The re-route (D5).** `/experiences/:slug` and `/experiences/:slug/new` render the start page with
    that occasion picked. The URLs stay. This ends the three smoke-11 defects, whose causes Phase 0 found:
    query keys that build `/api/catalog/tiqets/Kyoto` where the server has only the `?destination=` form;
    the geocode route's own "Location not found"; and a page effect that rewrites the plan context on
    every change. On the new pages a visit writes nothing: prove it with the e2e below.
21. **Rules it must not inherit from the template page (LD 39):** partner picks going to the cart with a
    plan in hand (`template-external-add.ts:13–19`) and the trip-less cart write. Browse avoids the first
    only because its partner supply is `affiliate_products`, whose add sends `affiliateProductId`, which
    the item route accepts (`server/routes.ts:13255–13265`). The template's other partner rows (cached
    hotels, activities, Fever events) cannot reach a plan without the cart, so they stay out of Browse.
    Bringing them in is its own lane. Editing rights reuse
    `canEditPlanItems` (`slip-viewer-role.ts:35–37`).

Not in 8b: the "All" day chip on the boards. `MapControlCenter` shows one day at a time (`:271–283`) and
that stands unless ruled.

## 8c — Retirements (spec §10)

22. `experience-template.tsx` planning features, its dead Sheets and dialogs (three can never open), its
    scripted "expert chat", the template cart UI; the last `ExperienceMap` mount (`:3019`) and
    `client/src/components/experience-map.tsx`; the "View in Trip Planner" links to `/trip/:id`
    (`:2136, 3078`).
23. **`cart_items`.** The template's two write paths go: the signed-in path at `:1730` (its "guest fallback"
    comment is wrong) and the partner-pick path. Four callers outside Experiences still create trip-less
    cart rows and are **held, not deleted**: the Discover guest-pending migration, the cart upsell, visa
    help, and the comparison upsell. Each goes to `FOLLOWUPS.md` against G2.

## 8d — Signed-out browsing on the map

Boards: the guest add-gate states of `ExperienceMap` and `ExperienceMapMobile`.

24. Browse on the map with no plan. `MapControlCenter` requires `tripId` today: it needs a plan-less mode
    for the Browse layer only.
25. The first add opens sign-in. The D3 record carries that one add; after sign-in the plan is created and
    the add runs once.
26. If the add cannot survive the round trip cleanly, stop and report. Do not build a guest store.

## Out of scope

The Ask AI drawer and the Optimize comparison on the map layout; pets (the pet lines on the trip boards
belong to the pets lane); the Wedding, Proposal and Birthday planners (drawn, not ruled); the Events page
and the "Plan around it" card; Trip Pass on the map; guest plans (G2); routed legs (step 9); the
`IntakePanel` collapse elsewhere (D11).

## Gates

- **Phase 0 is done for 8a–8c** (Track A, 5 Oct). Before each PR, re-check its `file:line` claims against
  the rebased `main` and report anything that moved. 8d gets its own Phase 0 and hard stop.
- **Fixture tests.**
  - 8a: the page and the modal list the same occasions in the same groups from one source; the five labels
    come from one home; `proposal` is under "One evening"; a row with NULL switches appears only under
    "See all" and in search; Continue is disabled without both an occasion and a city.
  - 8b-2: an add from Browse writes one `itinerary_items` row with the shown day, through the existing
    writer, and shows in the list view; an unlocated item produces no map mark; Budget never matches a row
    with a hidden, missing or non-USD price and reports the count; the free-draft button is absent on a
    plan that holds anything; the sign-in record is cleared before the plan is created, and a reload after
    sign-in leaves exactly one plan.
  - 8c: nothing imports `experience-map`; no Experiences surface writes `cart_items`; the trip-less
    callers are exactly the four named above, as a fixed list that can only shrink.
- **e2e, signed in (8b-2).** Experiences → A trip → Travel → Kyoto → dates → party → the plan opens on the
  map, on Browse, with nothing on it → add one to Day 2 → it is on Day 2 in the list. A visit to
  `/experiences/travel` alone leaves the active plan unchanged and the network log free of 404s.
- **e2e, signed out.** 8b-2: start on Experiences, finish the pop-up, sign in, and land on the new plan's
  map with the answers kept. 8d: browse, add, sign in, and the plan exists with that one item, once.
- tsc at or below the baseline in `build.yml`; guard batch clean, including the amended
  `check-planning-entry.cjs`; mutation-auth counts regenerated.
- **Success gate (§16, measured after deploy, not a merge gate):** entry → drafted plan ≥ 40%. Report three
  numbers, because the path now has a middle: entry → plan created, plan created → drafted, entry → drafted.

Per PR, report: the PR, the tests above, and anything on the boards the shared components cannot express.
