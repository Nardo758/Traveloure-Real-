# Cut-list #1 · Slice B Phase 0 — one range calendar

Base: `main` `bf77e5f25` (after slice A #1976 `1e7c42ee8` and slice 0 #1979). Brief v3 (Drive
`1v4KpuwcKyeij_K_1a2nJk7HJy4uz9K3Lo504ABw99Jg`), slice B. Read-only audit; every pin is on `bf77e5f25`.

## 1. Existing date pop-ups — audit before adding anything

There is exactly ONE plan-dates panel on main, and every dates entry point already opens it:

| Surface | Where | Opens |
|---|---|---|
| The panel itself (two `type="date"` fields, prefilled, "Save dates" / "Not now") | `client/src/components/plan/SlipAnchorPanels.tsx:50` (`InlineDatesPanel`), fields `:109`, `:113` | — |
| Slip header "Set your dates" chip | `client/src/components/plancard/SetPlanDates.tsx:69`, `:77` → `SlipHeaderMeta.tsx:143` → `SlipView.tsx:632` | `InlineDatesPanel` |
| Slip tools tray "dates" | `SlipView.tsx:2512` | `InlineDatesPanel` |
| Dates gates (Quick draft, Optimize, Trip Pass, cart) | `DatesGate` `SlipAnchorPanels.tsx:145`; callers `SlipRail.tsx:342`, `:628`, `TripPassCard.tsx:187`, `cart.tsx:2775` | `InlineDatesPanel` |
| Leg sheet travel options | `LegSheet.tsx:94` | `InlineDatesPanel` |
| Free draft first ask | `useSlipFreeDraft.tsx:125` | `InlineDatesPanel` |
| Guest plan (`/plans/new`) | `SlipView.tsx:632` / `:2512` with `submit` → `updateGuestPlan` `waitlist-guest-plan.ts:137` (`PATCH /api/guest-plans/current`) | `InlineDatesPanel` |
| PlanEntry (new plan) — two steps | `PlanEntry.tsx:649`/`:651` and `:736`/`:738`, scope `:275` | its own two inputs |
| Header chip "Add dates" (slice A) | `HeaderPlanCTA.tsx:46–65`: the dates text `:62` sits INSIDE the chip `<Link>` `:50`, so it navigates to the plan; no picker | — |

**Decision (reuse, not a second pop-up):** the range calendar becomes the body of the existing
`InlineDatesPanel`, so every row above that already opens the panel gets the calendar with no
new mount. PlanEntry's two steps render the same calendar component. The header chip's dates
segment opens the SAME `InlineDatesPanel` in a popover (signed-in: `PATCH /api/trips/:id`;
guest: its existing `submit` rail). No new dialog, no new write rail.

Out of the brief's file list and NOT changed: the plan edit window's When step
(`client/src/components/trip/plan-modal.tsx:1657`, `:1697`, `:1707`, `:1737`). Flagged as the one
remaining two-field date entry; a later lane if wanted.

## 2. Anchors

- Header state: `client/src/lib/header-plan.ts:47` (`HEADER_ADD_DATES_LABEL = "Add dates"`), `:92`
  (`headerPlanState`), `:136` (`headerDatesLine`); `layout.tsx:655` (computed once), mounts `:943`
  (desktop), `:997` (phone menu).
- Calendar primitive: `client/src/components/ui/calendar.tsx:3`, `:17` (react-day-picker 8.10.1).
- Prefill of unconfirmed dates: `SlipAnchorPanels.tsx:71–72` (`useState(() => dayOf(startDate))`).
- Inverted sentence to replace: `SlipAnchorPanels.tsx:118` ("The end date can't be before the start date.").
- PlanEntry silent clamp to replace: `PlanEntry.tsx:649`, `:736` (`endDate < start ⇒ end = start`).

## 3. Same-day trips — both write rails already accept them

- Signed-in: `server/routes/trips.routes.ts:590` refuses only `end < start`.
- Guest: `server/services/guest-plan.service.ts:112`, `:124` (`endDate >= startDate`).

So slice B is client-only. **No migration. No server change.**

## 4. Strings

New, all stamped — Wording approved — Leon (Nov 10, 11:27 AM ET): "When are you going?",
"Add dates" (already on main), "Leave date must be after your arrive date."; Wording approved —
Leon (Nov 10, 11:44 AM ET): "Skip for now" (rendered only when a caller passes `onSkip`; only
slice C's first add will). Reused as-is: "Save dates", "Saving…", "Not now". The month caption and
the previous/next-month labels are react-day-picker's built-ins (unchanged library strings).
No other new string.

## 5. Tests that type into the old fields (to move onto the calendar)

`playwright/tests/journeys/j-map-layout.spec.ts:77–79`, `j-kyoto-draft-stub.spec.ts:86–87`,
`j-kyoto-trips-golden-path.spec.ts:261–262`, `:351–352`, `playwright/tests/planning-entry.spec.ts:137–142`,
`:310–311`, `e2e/supply-demand/lib/flows.ts:971–972`; unit `client/src/lib/__tests__/e1-zero-questions.test.ts`
(`datesPanelCanSave`). One shared Playwright helper picks a range on the calendar.
