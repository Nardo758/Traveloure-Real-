# Step 8 brief — the Experiences entry and the map planner

**For Track A. Revision 2, 5 Oct 2026 (ET): carries rulings 4–10 of
`docs/planning/briefs/experiences-map-planner-rulings-2.md`.** Reference: surface spec v1.3.7 as amended by
R330; `docs/planning/briefs/experiences-map-planner.md` (A1, A3; its Lanes 3 and 4 are built here, as 8a and
8b + 8d); the Phase 0 audit `experiences-map-planner-phase0-audit.md` (cited below as "audit"); boards in
`docs/design/experiences-map-planner/`.

**Base:** `main` HEAD at dispatch, after #1306 merges. The dispatcher fills in the SHA; the lane's first
action is `bash scripts/check-lane-base.sh <sha>`. **Precondition:** the deploy and smokes 12 and 13 are
done before 8a starts.

Four PRs in this order: **8a, 8b, 8c, 8d.** One ledger row each, the next R-number. No migration is
expected; needing one is a hard stop.

Where this brief and the code disagree about what exists today, the code is right: report it.

## Rulings that shape this step

- **The map planner is a planner in its own right (A3.1), on the one plan store (LD 39).** In code it is a
  map-first layout of the same plan: the same `MapControlCenter`, `DayBlock`, `ItemRow` and writers. It is
  not `experience-template.tsx` revived and not a second set of components. Everything can be done there
  without opening the list: add, remove, pick a day, the AI button, the expert door, Finalize.
- **Groups first (A3.4).** Five labels, one home: "A trip", "One evening", "A celebration",
  "A hosted event", "A group getaway".
- **Ruling 4. Proposal sits under "One evening".** `experienceGroupFor` already puts it there. Its
  `default_visibility: "hidden"` hides the plan from sharing; it does not hide the occasion from the picker.
  No catalog change.
- **Ruling 5. An occasion in no group** (`plain_plan`) appears only under "See all occasions" and in search,
  in an ungrouped list. There is no sixth label. No seeded row is ungrouped today; production was not read.
- **Ruling 6. `/experiences` stops opening `IntakePanel` in 8a.** The guard
  `scripts/check-planning-entry.cjs` is amended in the same PR.
- **Ruling 7. No area marks on the map.** Ledger `2026-10-03-no-ward-pins` stands. An item with no exact
  location is listed and labelled "Not on the map yet"; it gets no pin, ring or shading.
- **Ruling 8. No day-less items.** An add from Browse goes to the day being shown, as the slip does today.
  `itinerary_items.day_number` stays NOT NULL.
- **Ruling 9. The map opens on an empty plan, showing Browse.** Only the "Your plan" layer waits for
  located stops.
- **Ruling 10. Signed-out map browsing is 8d, last.** 8b ships with sign-in at the finish, as now.
- **AI button:** LD 41 unchanged. Free only while the plan is empty. Amounts resolve from `fee_bands`; the
  "$2.99" and "$5.99" on the boards are beta values, never literals in code.
- **Coral:** filled buttons this step touches use the fill colour (`#C8443D`) through its token, not a hex.

## 8a — Entry

Boards: `Experiences`, `ExperiencesMobile`, `PlanModal`.

1. **One picker component**, used by the page and by the modal's occasion step
   (`plan-modal.tsx:1903–1950`, a flat grid today). Groups, then the occasions in the chosen group, then
   "See all occasions" and search. The group comes from `experienceGroupFor` run on the rows
   `GET /api/experience-types` already returns. The picker ends with `setOccasionSlug`, so
   `resolvePlanSteps` is untouched and a door carrying an occasion still skips the step.
2. **`/experiences` is the starting state:** the picker on the left, Where on the right (the eight city
   cards and the map with eight pins). Continue opens the one modal at When with the occasion and city
   set. The door table lives in `client/src/lib/plan-steps.ts`; do not restate it.
3. **`IntakePanel` leaves `/experiences`** (`experiences.tsx:121–127, 215–220`). Amend
   `scripts/check-planning-entry.cjs:82–86, 169–175, 238–245` so the page must open the one modal through
   the shared picker, and still fails on a second intake. Other `IntakePanel` callers are not touched here
   (the D11 collapse is its own lane): list them in the report.
4. **`/experiences/:slug` and `/experiences/:slug/new`** render the same starting state with that occasion
   picked. The URLs stay. `experience-template.tsx` is no longer mounted from 8a on; its code goes in 8c.
5. **The three smoke-11 defects end here** because the template page stops mounting: the five catalog
   requests that 404, the geocode request that 404s, and the visit setting the active plan. The audit did
   not reproduce the cause (likely `writeTemplatePen`, `experience-template.tsx:1155–1216`). A visit to
   the new page writes nothing: prove it with the e2e below, not by inference.
6. **The label guard.** Nothing guards the labels today (audit, Lane 3). Add one assertion: the five
   strings come from one home, and the picker renders exactly those five as group labels.
7. **e2e specs that click `option-occasion-*` straight after opening** (`planning-entry.spec.ts:80, 105,
   112, 131, 141`; `j-kyoto-trips-golden-path.spec.ts:202, 234, 249`) click a group first. Keep the tile
   test ids.
8. Fix the copy "Choose from 8 curated experience templates" (`experiences.tsx:108`); 29 are seeded and the
   page no longer shows a count.

Between 8a and 8b a new plan still lands on the slip's list view, as today.

## 8b — The map layout of the plan

Boards: `ExperienceMap`, `ExperienceMapMobile` (member states only; the guest states are 8d). The board
file name is unrelated to the old `ExperienceMap` component, which 8c deletes.

9. **A map-first view of the plan.** The slip's view is local state today, defaulting to list
   (`SlipView.tsx:1472`). Assumption, for Phase 0 to confirm or replace: a `?view=map` query read once for
   the first view, following `?handoff=open` (`HandoffChooser.tsx:278–279`). No stored preference; that
   would need a migration.
10. **It opens on an empty plan.** The Map toggle is disabled when nothing is located
    (`SlipView.tsx:1489–1492, 2036`). Change: the map view is always reachable; with no located stops it
    opens on Browse; "Your plan" shows its empty state ("Nothing on your plan yet…").
11. **Landing.** A plan started from Experiences, or finished with "Draft it with AI" or "Plan it myself"
    from that entry, opens on the map view. Set it at the finish (`source.onFinish`, or the param on the
    `/plans/:tripId` navigation in `runBranch`, `PlanningContext.tsx:492–516`). Every other door lands
    where it does today.
12. **The rail** beside `MapControlCenter` follows the map's layer: Browse or Your plan.
13. **Browse.** Supply is what `MapControlCenter` reads today (`:156–168`). The board's five tabs are not
    mapped onto those reads (audit, Lane 4 item 5): Phase 0 maps them and reports; a tab with no supply
    behind it is not built. Add from a card or a pin through the existing Browse add (`:187–199`), to the
    day shown; the button says which day ("Add to Day 2") and, once added, "On Day 2 · Remove".
14. **Located and not.** One predicate, `isLocated` (`MapControlCenter.tsx:53`). Located items get a pin.
    The rest are listed with "Not on the map yet", and the rail says how many ("2 here are not on the map
    yet"). Hosts stay a list, never pins.
15. **Your plan.** Days, numbered stops, straight connectors between located stops in day order
    (`map-scene.ts:151–156`), "X of Y located".
16. **The band.** Plan name, dates, party, the manifest tools (`ToolsTray`), the expert door
    (`HandoffChooser`), the AI button, Finalize within reach.
17. **Rules it must not inherit from the template page (LD 39):** partner picks going to the cart with a
    plan in hand (`template-external-add.ts:13–19`), and the trip-less cart write. Editing rights reuse
    `canEditPlanItems` (`slip-viewer-role.ts:35–37`).

Not in 8b: the "All" day chip on the boards. `MapControlCenter` shows one day at a time (`:271–283`) and
that stands unless ruled; leave the chip out and say so in the report.

## 8c — Retirements (spec §10)

18. `experience-template.tsx` planning features, its dead Sheets and dialogs, the template cart UI; the last
    `ExperienceMap` mount (`experience-template.tsx:3019`) and `client/src/components/experience-map.tsx`;
    the "View in Trip Planner" links to `/trip/:id` (`:2136, 3078`).
19. `cart_items` becomes checkout-only. Phase 0 lists every remaining writer first, including the trip-less
    path (`experience-template.tsx:1752–1764`). The trip-less guest cart is a sanctioned fallback until G2:
    if a caller outside Experiences still needs it, report and hold that caller. Do not delete it.

## 8d — Signed-out browsing on the map

Boards: the guest states of `ExperienceMap` and `ExperienceMapMobile`.

20. Browse on the map with no plan. `MapControlCenter` requires `tripId` today: it needs a plan-less mode
    for the Browse layer only.
21. The first write opens sign-in. The pending action is kept across it (sign-in ends in a full reload,
    `SignInModal.tsx:146–154`; `traveloure_return_to` is the precedent). After sign-in the plan is created
    and the pending write runs once.
22. Guest plans stay held (`POST /api/trips` is 401 for anonymous callers). If the pending write cannot
    survive the round trip cleanly, stop and report. Do not build a guest store.

## Out of scope

The Ask AI drawer and the Optimize comparison on the map layout; pets (the pet lines on the trip boards
belong to the pets lane); the Wedding, Proposal and Birthday planners (drawn, not ruled); the Events page;
Trip Pass on the map; guest plans (G2); routed legs (step 9); the `IntakePanel` collapse elsewhere (D11).

## Gates

- **Phase 0 first for each PR, read-only, `file:line` for every claim, then a hard stop for a go.** For 8a:
  every `IntakePanel` caller and what the amended guard will require. For 8b: whether `SlipView` hosts the
  map-first view or needs a sibling layout; the tab-to-supply map; where the landing is set. For 8c: every
  `cart_items` writer. For 8d: where the pending action lives and what `MapControlCenter` needs to render
  with no plan.
- **Fixture tests.** The page and the modal list the same occasions in the same groups from one source.
  The five labels come from one home. `proposal` is under "One evening". A row with NULL switches appears
  only under "See all" and in search. An add from Browse writes one `itinerary_items` row with the shown
  day, through the existing writer, and shows in the list view. An unlocated item produces no map mark.
  The free-draft button is absent on a plan that holds anything.
- **e2e, signed in.** Experiences → A trip → Travel → Kyoto → dates → party → the plan opens on the map,
  on Browse, with nothing on it → add one to Day 2 → it is on Day 2 in the list. A visit to
  `/experiences/travel` alone leaves the active plan unchanged and the network log free of 404s.
- **e2e, signed out (8d).** Browse, add, sign in, and the plan exists with that one item, once.
- **8c.** A source test that nothing imports `experience-map` and that nothing outside checkout writes
  `cart_items`.
- tsc at or below the baseline in `build.yml`; guard batch clean, including the amended
  `check-planning-entry.cjs`; mutation-auth counts regenerated.
- **Success gate (§16, measured after deploy, not a merge gate):** entry → drafted plan ≥ 40%. Report three
  numbers, because the path now has a middle: entry → plan created, plan created → drafted, entry → drafted.

Report back with the Phase 0 findings before building, then per PR: the PR, the tests above, and anything
on the boards the shared components cannot express.
