# Cut-list #1 · Slice C Phase 0 — one add action (+ sign-in claim with cart lines)

Base: `main` `bf77e5f25`; this branch sits on slice B (#1981, `9b666cac`) because C's first add opens B's calendar
with "Skip for now". The PR targets `main`; once #1981 merges, `main` is merged in and only C's commits remain.
Brief v3 slices C **and D** (the request folds D's claim into C). Read-only audit; every pin is on `bf77e5f25`.

## 1. Strings — what changes, and what deliberately does not

`WAITLIST_COPY.saveToPlan` ("Save to plan", `client/src/lib/waitlist-copy.ts:7`) is used for TWO different things:

1. **The add action** (this slice): `PLAN_ACTIONS_COPY.saveToPlan` `plan-actions.ts:27` → `saveLabel` `:55` →
   `PlanActions.tsx:160`; the map browse add `MapControlCenter.tsx:852`, `:862`, `:894`; the guest toast
   `guestSavedMessage` `waitlist-guest-plan.ts:217–224` ("Saved to Day {n}."); the signed-in plan picker toast
   `plan-picker.tsx:274` ("Saved to Day {n}."); the add dialog toast `add-to-experience-dialog.tsx:116–118`.
2. **The waitlist-mode stand-in for checkout/Book on items ALREADY on the plan** (P-1c): `LegRow.tsx:462`,
   `ActivitiesSection.tsx:490`, `:517`, `SlipView.tsx:1045`, `TransportSection.tsx:283`, `FinalizeBookingModal.tsx:83`,
   `SlipRail.tsx:1161`, `TripCardDays.tsx:278`, `:581`.

**Default:** the add surfaces (1) move to the new add copy; the P-1c sites (2) keep "Save to plan" / "Saved to plan"
untouched — renaming the shared constant would turn "Book" on a booked-in-plan leg into "Add to plan". Ledger row says
the new strings supersede P-1c/GATE-1's "Save to plan" (Nov 6) **for the add action** and QW-3's "Saved to Day {n}."
(Nov 7).

New strings, all **Wording approved — Leon (Nov 10)**: "Add to plan", "Add to Day {n}", "Added ✓", "Added to Day {n}.",
"Undo", "Change day", "View plan", "Retry". Kept as-is: the unlocated second sentence "We don't have this spot on the map
yet." and the failure sentence `guestSaveErrorMessage` `waitlist-guest-plan.ts:105`. "Retry" also already exists as a
label (`client/src/lib/admin-ops.ts:24`). "Day {n}" (the Change day sheet's buttons) is the existing day label.

## 2. One add button

`PlanActions` (`client/src/components/plan/PlanActions.tsx:135`) is already the one shared action row on the feed
(`city-feed-card.tsx:635`, `:1216`, `:1345`, `:1536`, `:1653`, `:1862`, `:1974`, `:2194`, `:2326`), recommendation,
catalogue, curated, landing hero, discover, deals, storefront and the anchor panel (sites `plan-actions.ts:118–129`).
The planning surface's add is `MapControlCenter.tsx:852–897` (three branches, two hand-built buttons). **Default:** one
`AddToPlanButton` (spinner + `aria-busy` while pending, label from one `addLabel()`, done state "Added ✓" inert) is the
save output of `PlanActions` AND the map browse add. `SaveToPlanButton.tsx` stays for the P-1c sites only.

**`/experiences` cards:** `client/src/pages/experiences.tsx` (211 lines) is the PlanEntry start page; its city and event
cards START a plan (`usePlanning().start`), they carry no add action on main. **Question:** is "/experiences cards" the
`/discover` experiences grid (`discover.tsx:708`, already `PlanActions`)? Default: covered through `PlanActions`; the
start page's pickers are unchanged.

## 3. Add flow anchors

- Guest add: `useBrowseSaveToPlan` `browse-save.ts:32` (first tap disabled while auth/mode settle `:71`, `:75`) →
  `saveToGuestPlan` `waitlist-guest-plan.ts:177` → `POST /api/guest-plans/current/items` `guest-plans.routes.ts:163`
  (`savesPerSession` `:96`).
- Signed-in add with a PlanItemRef already exists: `POST /api/trips/:tripId/itinerary-items` `server/routes.ts:13403`,
  ref branch `:13552` (same `resolvePlanItemRef` as the guest rail). **No new signed-in route.**
- Undo/Change day signed-in: existing `PATCH`/`DELETE /api/trips/:tripId/itinerary-items/:itemId`
  `server/routes/trips.routes.ts:3206`, `:3425`. Guest: **no item delete/patch on main** → two new routes on the guest
  rail (`DELETE`/`PATCH /api/guest-plans/current/items/:id`, `guestOnly`, own session only, rate-limited). No schema.
- There is no "move to day" picker on the slip today (only move up/down, `ItemRow.tsx:94–95`); Change day is one small
  sheet listing the plan's days, writing through the rails above.
- Mint door for a signed-in first add with no plan: `mintTripSlip` `client/src/lib/trip-slip.ts:295`.
- Toast actions: `client/src/components/ui/toaster.tsx:16`, `:25` (`action` slot).

## 4. Header chip "View plan"

Slice A's chip (`HeaderPlanCTA.tsx:46–66`) is a link labelled "Your {city} plan · {n}". **Default:** the chip gains a
"View plan" link to the same href, from `sm:` up (at 375px the label is already the link and the budget holds); the
toast carries Undo and Change day.

## 5. Sign-in claim → cart lines (brief slice D)

- Claim: `claimGuestPlans` `server/services/guest-plan.service.ts:489–519` (one atomic conditional, unchanged), route
  `guest-plans.routes.ts:200`, client watcher `App.tsx:1610`.
- Projection: `syncItemProjection(itemId)` `server/services/cart-projection.service.ts:242` reads the global `db` and
  the trip owner (so inside the claim tx it would see the pre-claim owner).
- Bookable: `platformListingBookability` `shared/buy-action.ts:564`; request/quote listings never become cart lines
  (`listingRequiresRequest`, LD 49); affiliate `BOOKING_TYPES` `shared/content-cta.ts:22`.
- **Default:** right AFTER the claim commits, for each claimed item that names an approved, active, instant
  (not request-mode) listing or an `in_platform_bookable` affiliate product: flip `routing_status` to
  `ready_for_checkout` (atomic conditional on `in_planning`) and call `syncItemProjection`. Each step is non-fatal
  (one warn line, the claim stands); keyed on `itinerary_item_id`, so a repeat claim adds nothing. This keeps the brief's
  guarantees (claim never rolls back, no duplicates) without threading a tx through `syncItemProjection`.

## 6. Not in this slice

"Check out" in the header (its own lane after the mode flip) and "Start over" (a later lane). **No migration.**
