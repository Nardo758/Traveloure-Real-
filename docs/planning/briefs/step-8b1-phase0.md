# Step 8b-1 — Phase 0 re-check (Track A, read-only)

> Written 2026-10-06 by Track A for `docs/planning/briefs/step-8-brief.md` revision 3.1, section "8b-1 — Extraction,
> no behaviour change" (item 8).
> Base: `main` `c94176a88ea6a99f9bac5910c149e16cbd625647` (`bash scripts/check-lane-base.sh c94176a88` → OK).
> **Nothing was built:** no product code, no migration, no commit, no branch. `file:line` is at that base.
> Where the code and the brief disagree, the code is right; each case is marked **Brief ≠ code**.
>
> **Out of bounds by dispatch:** `WhatsOn.tsx` and the city-events files. Events' 2a (#1311) is merging on this
> head as R347. Nothing below touches them, and 8b-1 does not need to.

**Migrations:** none needed. 8b-1 is client-only.

**The brief's item 8, verbatim:** "`SlipView` (2,466 lines, one JSX tree) cannot take a layout switch cleanly.
Move its calculations into one shared hook and expose the header, AI button and Finalize pieces. **Nothing a
traveler sees changes.** The existing tests pass without edits; a test edited to pass is a finding to report."

---

## 1. SlipView today

- `client/src/components/plancard/SlipView.tsx` is **2,466 lines** ✓. Its one export component is
  `SlipView` at `:1360–2466`.
- **The calculations** are `:1369–1856`. `return (` is at `:1857`, and there are no early returns. That block
  holds:
  - 6 `useState`, 6 `useMemo`, 5 `useQuery`, 3 `useEffect`, 1 `useMutation`, 1 `useRef`;
  - `usePenPrincipal`, `usePlanning`, `useOccasionSwitches`, `useOptionSets`, `usePlacePhotos`,
    `useExpertDoorState`, `useToast`;
  - two render closures that return JSX from inside the calculation block: `renderAnchorPanel` `:1606–1622`
    and `renderAirportLeg` `:1730–1746`.
- **What the calculations produce, grouped by the reader 8b-2 needs:**
  - **Header:**
    - `partyLabel` (`planHeaderCountLabel`, `:1799–1805`; it needs `invitedCount` from the guest-roster query
      at `:1419–1426`);
    - `stopsLine` and `zoneLine` (`:1854–1855`);
    - `askParty` (`:1823–1852`);
    - `occasion`, `occasionResolved`, `occasionIsHidden` (`useOccasionSwitches`, `:1569–1580`);
    - the Trips anchor line (`tripsAnchor`, `:1598`);
    - the expert-door control (`expertDoorLive` and its state, `:1449–1450`).
  - **Map:**
    - `slipView`, `setSlipView`, `mapDay` (`:1474–1475`);
    - `locatedActivities` and `unlocatedActivities` (`:1481–1482`);
    - `mapBrowse` and `openFindHost` (`:1484–1488`);
    - `mapDisabledReason` (`:1489–1492`);
    - `mapAnchor`, `shading`, `mapAreas` (`:1672–1685`);
    - `mapVersions` (`:1694–1707`).
  - **List:**
    - `daySlots` (`buildSlipDaySlots`, `:1638–1658`) and `dayByNum`;
    - `dayOpen`;
    - `dayPhotos` (`:1687–1693`);
    - the row highlight (`:1494–1507`);
    - travel anchors and `airportLeg` (`:1708–1746`).
  - **Rail inputs:** `budgetLine` (`:1758`), `cardReady` (`:1466`), `isPrimary` (`:1463`), `hasBookableRows`
    (`:1476`).
  - **Shared:** `days`, `allActivities`, `sortedDays`, `planActivities`, `optionSets`, `anchorItemId`,
    `whereToStay`, `anchorSurface`, `openTool`, `planEvents`, `groupByEvent`, `experienceGroup`.
- `SlipView` is mounted once, by `client/src/pages/slip-view.tsx:11`, which owns the plancard query.
  `SlipData` is imported as a type by `PlanSlipStrip.tsx:4`, `itinerary-comparison.tsx:79`, `my-trips.tsx:31`
  and `plan-versions.tsx:19`.
- **No unit test renders `SlipView` or `SlipRail`.** The visible behaviour is pinned by Playwright:
  `slip-rail-actions.spec.ts` (its own blocking workflow, `.github/workflows/slip-rail-actions-gate.yml:47`),
  `j-kyoto-trips-golden-path.spec.ts`, `home-gate.spec.ts`, `e2e/specs/journey-2.spec.ts` and
  `e2e/supply-demand/d1-build-it-yourself.spec.ts`.

## 2. The header, the AI button and Finalize — where they live

- **Header:** `SlipHeader` is local to `SlipView.tsx` (`:328–570`), not exported. It is a pure props component
  (13 props, `:328–345`) and has no hooks of its own. Exporting it is a one-word change.
- **Brief ≠ code: the AI button and Finalize are not in `SlipView`.** Both live in
  `client/src/components/plancard/SlipRail.tsx` (1,388 lines):
  - **AI button:** the action is resolved once in `SlipRail`:
    `slipBuildAiAction(slipDraftItemCount(planGate?.draftItemCount, activities.length))` at `:1326`, reading the
    server's draft count off the cached plancard (`:1322–1325`). It is passed to `BuildCard` (`:282`) and to
    `AskAiDrawer` (`:1367–1372`). In `BuildCard`:
    - `draftDisabledReason` is at `:448`;
    - the `draft` mutation is at `:453`;
    - the "Draft it with AI" row is at `:524–537`;
    - the optimizer block is at `:474` and is portalled into SlipView's slot at `:545`. That slot is
      `optimizerSlot`, `SlipView.tsx:1563` and `:1986`.
  - **Finalize:** `useFinalizeMutation` is at `:1020`, and `FinishCard` at `:1086–1273`. `FinishCard` owns the
    `FinalizeBookingModal` mount (`:1166`), the reopen (`use-reopen-mutation`) and the "Finalize Plan" / "Make it
    final again" label (`:1236`).
  - Neither file exports `BuildCard`, `FinishCard` or `useFinalizeMutation` today. `SlipRail` is the only export
    (`:1274`).
- So "expose the header, AI button and Finalize pieces" is three edits:
  - export `SlipHeader` from `SlipView.tsx`;
  - lift the AI action and its draft row out of `BuildCard` into an exported piece;
  - export `FinishCard`, or a Finalize piece cut from it, from `SlipRail.tsx`.

  The optimizer portal stays as it is (out of scope for 8b, per the brief's "Out of scope": "the Optimize
  comparison on the map layout").

## 3. The constraint that decides the shape: tests read these files as text

**41 files** outside these two components mention `SlipView.tsx` or `SlipRail.tsx`. 29 of them are tests, and
most of the tests `readFileSync` the source and assert on strings. Every check below reads the whole file;
**none is scoped to SlipView's calculation block.**

- **19 assertions would fail if the calculations moved to a NEW FILE.** Each asserts text that lives in
  `:1369–1856` and appears nowhere else in `SlipView.tsx`:

  | Test | Line | Asserts | SlipView |
  |---|---|---|---|
  | `rc345-active-plan` | A5 :170–172 | `const penPrincipal = usePenPrincipal();`, `activateOpenedPlan(\n openedTrip`, `data.tripRole,\n penPrincipal,\n );` | :1375, :1378, :1393–1395 |
  | `save-payment-prompt` | A7 :218–219 | `const hasBookableRows = useMemo(`, `routingStatus === "ready_for_checkout" \|\| isPurchasedRow(a)` | :1476–1477 |
  | `slip-first-paint` | A3, A5 | `planHeaderCountLabel(…occasionResolved,)`, `isResolved: occasionResolved` | :1799–1804, :1575 |
  | `slip-small-additions` | :235, :256, :262, :268, :269 | `hasAdvisor = isExpertViewer \|\| !!`, `slipZoneLine(`, `planHeaderCountLabel(`, `` `/api/trips/${tripId}/guests` ``, `totals?.invited` | :1447, :1855, :1799, :1420, :1427 |
  | `slip-conformance` | :766–767 | exactly ONE `slipStopsLine(` and ONE `slipZoneLine(` in `SlipView.tsx` (`equal(…, 1)`) | :1854–1855 |
  | `slip-own-your-plan` | :310, :366 | `const canEditItems = canEditPlanItems(viewer);`, `items: [...day.activities],` | :1399, :1652 |
  | `smoke5-fixes` | S… | `<AnchorPanel\b` (inside `renderAnchorPanel`) | :1608 |
  | `rc12-party-size` | :133 | `focusStep: "who"` | :1848 |
  | `ea-delegate-reads` | :41 | `enabled: !!tripId && data.tripRole === "owner"` | :1422 |

  Four more checks would survive because they also match a comment or a JSX use: `slip-small-additions`
  :255/:271, `mapDisabledReason` in `slip-rail` S9 / `slip-conformance` :421, and `slip-own-your-plan` :320.
- **About 16 assertions are slice- or position-scoped**, for example:
  - `smoke9-fixes` slices between `onOpenToolChange={setOpenTool}` and `slip-optimizer-slot`;
  - `smoke8-fixes` checks `indexOf` order inside `DayBlock`;
  - `slip-conformance` has `functionBody` slices of `SlipStatusStrip`, `SlipHeader`, `TripCardPrimaryBanner`,
    `ExpertCard` and `RailRow`.

  All of them target the JSX or the helper components, **not** the calculation block. They hold as long as
  those functions stay in their files and their text is unchanged.
- **About 25 assertions target `BuildCard` and 4 target `FinishCard`.** `BuildCard` is checked by `feedback-tap`
  T4, `smoke9-fixes`, `slip-rail` S2/S3/S8, `slip-conformance`, `optimize-preview-on-slip`,
  `advisor-conversation-context` A5 and `ea-delegate-reads`. `FinishCard` is checked by `help-article-links`,
  `traveler-fee-preview`, `trip-card-one-page` and `slip-rail`'s `card="finish"`. Notable details:
  - `ask-ai-drawer` :268 and `smoke9-draft-gate.db` require `const aiAction = slipBuildAiAction(` **in
    `SlipRail.tsx`**.
  - `ask-ai-postfinal` M2 requires `aiAction={aiAction}` on `<AskAiDrawer` there.
  - No test asserts on `useFinalizeMutation` or on the "Draft it with AI" text itself.
- **Mount walks:**
  - `save-payment-prompt` A6 (`:205–213`) walks `client/src` and requires `SavePaymentMethodPrompt` mounted
    in exactly two files, `SlipView.tsx` and `TripPassCard.tsx`.
  - `slip-rail` S8 counts `<TripPassCard` as exactly one, in `SlipRail.tsx`.

  A new layout file that mounted either component would fail them.
- **No guard script reads either file** (`scripts/check-*.cjs`: none).

**What follows from this.** The brief's "one shared hook" and "the existing tests pass without edits" are
compatible **only if the hook is defined inside `SlipView.tsx`** (exported from there) and its body keeps the
moved lines textually identical. Then every whole-file check still matches, and the two `equal(…, 1)` counts
stay at one call each. A hook in its own file (say `use-slip-view-model.ts`) needs edits to 19 assertions in 9
test files, which the brief says is a finding. Likewise, the AI and Finalize pieces stay inside `SlipRail.tsx`
as named exports; they do not move to new files.

## 4. Smaller facts the build needs

- **The brief's references for 8b-2 are unchanged at this base:** `mapDisabledReason` is at `:1489–1492` and
  the toggle's `disabled` at `:2036` ✓. The 8a re-route did not move them.
- **The map is already mounted inside the slip.** `MapControlCenter` is at `:2088`, under
  `slipView === "map" && data.trip`. Two queries are gated on `slipView === "map"`:
  - city neighbourhoods, `:1678–1682`;
  - versions, `:1694–1699`.

  The hook has to keep those `enabled:` conditions reading the same view state, or a list-only render would
  start fetching them (a network change, though not a visible one).
- **`optimizerSlot`** is a `useState<HTMLDivElement | null>` (`:1563`) set by a ref in the JSX (`:1986`). It is
  DOM wiring, not a calculation, but it lives in the calculation block today. It can move with the hook as a
  state pair; the portal in `BuildCard` is untouched.
- **Two render closures** (`renderAnchorPanel`, `renderAirportLeg`) are JSX built inside the calculations.
  `smoke5-fixes` pins `<AnchorPanel\b` in the file, so they can sit in the same-file hook, or stay in
  `SlipView` as closures over the hook's values.
- **The handoff chooser host** (`HandoffChooserHost`, `:1928`) and the toasts are components, not
  calculations. They stay in the layout.
- **Rules of hooks:** `SlipView` has no early return before `:1857`, so all of `:1369–1856` can become one
  hook call with no ordering change.

## Not proven

- I found the 19-assertion count with a read-only sweep of the 41 referencing files, and checked three of the
  claims by hand: `slip-conformance` :766–767, `rc345` A5 and `save-payment-prompt` A6/A7. The rest is the
  sweep's file:line, not re-read one by one.
- Playwright was not run for this Phase 0. The "nothing a traveler sees changes" proof is the build's job:
  `slip-rail-actions` (blocking), the Kyoto golden path and the unit batch, all unedited.

## Decisions the lane needs (not taken here)

1. **Where the hook lives.**
   - Option a: `export function useSlipViewModel(tripId, data, highlightItemId)` defined in `SlipView.tsx`, with
     its body made of the current `:1369–1856` lines moved verbatim. `SlipView` calls it, and 8b-2's map layout
     imports it from the same module.
   - Option b: a new file, plus edits to 19 assertions in 9 tests, which the brief calls a finding.
   - **Recommend (a).** It is the only shape that meets "tests pass without edits".
2. **What "expose" means for the three pieces.**
   - Option a: named exports in place:
     - `SlipHeader` from `SlipView.tsx`;
     - from `SlipRail.tsx`, a small `useSlipAiAction(tripId, activities)` (the `:1322–1326` lines) used by
       `SlipRail` itself, plus `FinishCard`;
     - the "Draft it with AI" row and its mutation lifted from `BuildCard` into an exported `SlipDraftAiRow`
       that `BuildCard` renders.
   - Option b: new component files, which breaks the whole-file assertions above.
   - **Recommend (a).** One caveat: `ask-ai-drawer` :268 and `smoke9-draft-gate.db` match the literal
     `const aiAction = slipBuildAiAction(` in `SlipRail.tsx`. A `useSlipAiAction` hook in the same file must
     keep that exact line, which it can.
3. **The two mount counts.** `SavePaymentMethodPrompt` (exactly two mounts) and `<TripPassCard` (exactly one in
   `SlipRail.tsx`) are policy, not incidental (LD 43(d), the one Trip Pass card). 8b-1 does not move them.
   8b-2's map band must reach them through the same components rather than a second mount, or the tests are
   amended by ruling. **Recommend:** state it now, so 8b-2 does not discover it.
4. **The map-only queries.** Keep `enabled: slipView === "map"` inside the hook, so the list view's network
   traffic is identical. **Recommend** yes, and prove it with the unedited tests plus `slip-rail-actions`.

## Decisions as taken (decision-maker go, 2026-10-06: "8b-1 Phase 0 accepted. Go, base c94176a88 or later.")

1. **`useSlipViewModel` is defined and exported in `SlipView.tsx`**, and the calculation block is moved into it
   verbatim. No new file.
2. **Named exports in their current files.**
   - `SlipHeader` from `SlipView.tsx`.
   - The AI-action hook `useSlipAiAction` from `SlipRail.tsx`, keeping the exact
     `const aiAction = slipBuildAiAction(` line.
   - The "Draft it with AI" row `SlipDraftAiRow` from `SlipRail.tsx`.
   - `FinishCard` from `SlipRail.tsx`.
3. **The two mount counts are recorded for 8b-2** (section below and the brief). 8b-2 reuses these components and
   never mounts them a second time.
4. **Map-only conditions stay inside the hook**, so the list view's network traffic is unchanged.

Gate: **zero test-file edits.** If any test must change, the lane stops and reports before changing it.

## For 8b-2: two mount counts the map layout must respect

These are policy, not incidental, and tests pin them:

- **`SavePaymentMethodPrompt` is mounted in exactly two files**, `SlipView.tsx` and `TripPassCard.tsx`
  (`client/src/lib/__tests__/save-payment-prompt.test.ts` A6, `:205–213`; LD 43(d)'s "two mounts and no third").
- **`<TripPassCard` appears exactly once, in `SlipRail.tsx`** (`client/src/lib/__tests__/slip-rail.test.ts` S8).

The map layout reaches both through the existing components: `SlipView`'s Finalize-area prompt and the rail's Build
card. It never adds a second mount. Changing either count is a ruling, not a test edit.
