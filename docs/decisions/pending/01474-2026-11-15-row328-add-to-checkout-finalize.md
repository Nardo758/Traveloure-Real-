# 01474 — 2026-11-15 — row 328: Add to checkout opens Finalize with that item in hand

**PR:** [#2026](https://github.com/Nardo758/Traveloure-Real-/pull/2026) · branch `row328/add-to-checkout-opens-finalize` · base `main` @ `c200a2786`.

**Ruling (Leon, Nov 15):** keep "Add to checkout" on the Trip Card; tapping it opens Finalize with that item picked. The wording stays the same.

**Why it needed a channel, not a prop.** Phase 0 found the two halves in different components with no shared parent state: the control is `ActivitiesSection` (rendered by `PlanCard`), the modal is owned by `SlipRail`. `PlanCard` holds no reference to the modal, so `finalize-request.ts` is the one emitter between them — the same shape `plan-add-runner.ts` already uses for "one surface asks another to open".

**What "picked" means.** `focusItemId` is now READ by the modal: when the press named an item that goes to checkout, the modal's set — its `checkoutCount`, its `items` payload, and what the traveler confirms — is that item alone (`scopeItems`). Opened any other way (`focusItemId` null, or a self-book item) the whole-plan behaviour is unchanged.

**Files.** `client/src/lib/finalize-request.ts` (new, the channel) · `ActivitiesSection.tsx` (press names its item; wording and testid unchanged; route still staged) · `SlipRail.tsx` (subscribes, opens, passes `focusItemId`) · `FinalizeBookingModal.tsx` (accepts and reads it) · `client/src/lib/__tests__/row328-add-to-checkout-finalize.test.ts` (4/4).

**Numbers.** No migration. No new strings ("Add to checkout" unchanged). `tsc` 103 = main. Build 0. No priced or provider-submitting control added; #1705 untouched.
