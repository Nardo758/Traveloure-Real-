# Flow-audit #2 — Trip surfaces (slip vs details vs cards)

`audited@7cc61fbdd` (origin/main HEAD) · read-only Phase 0 · **no code changed** · **HARD STOP — Leon rules**

> Question: are `/plans/:tripId` (slip) and `/trip/:id` (details), plus the two card components, **one trip
> surface with two states** (→ **A**, state-driven modes) or **two surfaces needing a hard mutate/read
> boundary** (→ **B**)? The inventory below decides; the recommendation is at the end and is Leon's to rule.

---

## TL;DR diagnosis

They are **not** one surface with two clean states, and they are **not** a clean mutate/read pair either. They
are **two parallel PLANNING surfaces that never merged and never agreed on a state signal.** The slip
(`SlipView`, born `3611e9ab4`, Spec A/B/C) is the newer, canonical, **review-first** planning surface with an
honest item-level record projection. `trip-details.tsx` is the older planning surface that kept accreting
*incidental* features (fix-waves, invites, partner-catalog, affiliate, testid sweeps) and **never adopted the
item projection** — it still echoes the ratified-dead `trips.status` and derives no mode at all. The "record"
role `/trip/:id` is supposed to play barely exists: its one record-ish tab (Bookings) reads a **stale
`generated_itineraries` blob** with a different predicate than the slip's live projection.

- **~80% of `trip-details` is PLANNING** — either duplicating the slip's planning stack (it mounts the same
  `<PlanCard stage="full">`) or adding parallel planning rails (regenerate, expert-assign, suggestions,
  anchors, marketplace add-to-cart) the slip has a *divergent* version of or doesn't need.
- **A clean state signal exists** — item `routing_status` + `booking` presence (`isPurchasedRow`) — but it is
  **not shared, not trip-level, and the two pages disagree**: the slip uses it; details echoes dead
  `trips.status`; the router uses a *third* signal (dates) at only 2 of ~30 entry points.
- The two pages **never traded features directly.** They grew in parallel and only **share one endpoint**
  (`GET /api/trips/:id/plancard`), which each types differently (`SlipData` vs `PlanCardData`).

**Recommendation: (A) one surface, state-driven modes** — with the finding that for *this* pair, **(B)
collapses into (A)**: because details is almost entirely mutation, "move misplaced features to their home"
means moving nearly the whole page onto the slip, which *is* making details the slip's record-mode view.
Reasoning in full at the end. **Leon rules.**

---

## 1. Feature inventory (classified across both surfaces)

Classification: **PLANNING** (mutates item/trip state) · **RECORD** (displays purchased/confirmed reality) ·
**SHARED** (both need it) · **DUPLICATED** (on both — cites both file:lines, notes divergence) · **MISPLACED**
(a PLANNING feature on the "record" page, or a RECORD feature on the slip).

### 1a. Slip surface — `slip-view.tsx` (page, 58L) → `plancard/SlipView.tsx` (the real component)

The slip does **not** mount `PlanCard`; it reuses the PlanCard *family* piecemeal (RoutingActions/RoutingBadge
from `ActivitiesSection`, `MapControlCenter` for the map).

| feature | file:line | reads / writes | class |
|---|---|---|---|
| Title / dates / party / tracking ref / plan version | SlipView 159-195 | read-only | SHARED |
| Phase chip (upcoming/active/past) | SlipView 164-172 (derive 117) | **derived from dates vs now — never `trips.status`** | SHARED |
| Status strip counts (planning/with-expert/in-checkout/purchased) | SlipView 203-244 | per-item `routingStatus`/`booking` | SHARED |
| Booked "· #ref" secondary line | SlipView 266-272 | `a.booking`, `confirmationNumber` (gate: purchased) | RECORD |
| Anchor glyph "fixed point" | SlipView 322-335 | purchased **AND** `hasOptimized` | RECORD |
| Per-item routing actions: Send to expert / Add to checkout / Recall / Remove | ActivitiesSection 196-262 | POST `/api/trips/:id/items/:itemId/route` | PLANNING |
| Bulk "Add all to checkout" | SlipView 702-765 | loops POST `.../route {to:ready_for_checkout}` | PLANNING |
| **Optimize this plan** (review-first) | SlipView 604-635, 768-785 | POST `/api/itinerary-comparisons` → `/itinerary-comparison/:id` | **DUPLICATED** (see D-1) |
| Build-around anchor dialog | BuildAroundDialog 70-379 | GET `/api/trips/:id/anchor-candidates` | PLANNING |
| Optimization pay-gate + Stripe sheet | SlipView 637-838; optimization-gate | POST `/api/optimization-payments`(+`/confirm`) | PLANNING |
| **Adopt Optimization** (finalize) | SlipView 471-498, 842-859 | POST `/api/trips/:id/finalize` | PLANNING |
| Finalize chooser (self / agent / expert / concierge) | FinalizeBookingModal 43-236 | 4 rails incl. POST `/api/expert-requests {ai_plan_polish}` | **DUPLICATED** (see D-4) |
| Back to planning (reopen) | SlipView 500-514 | POST `/api/trips/:id/reopen` | PLANNING |
| Plan approval banner (approve / request changes) | PlanApprovalBanner 42-156 | POST `/api/trips/:id/plan-review` | PLANNING |
| Trip Card **primary banner** → View Trip Card | SlipView 516-558 | nav → **`/trip/:id`** | RECORD (points at details for the record view) |
| Logistics row (transport leg) | SlipView 360-385 | read-only (no mode-switch UI on the slip) | SHARED |
| List / Map toggle + `MapControlCenter` (pins/transport/notes) | SlipView 905-1008; MapControlCenter | read-only | SHARED |
| Transition/diary log footer | SlipView 416-461 | `recentTransitions` | SHARED |
| Share | SlipView 729-742 | clipboard/navigator.share of `/itinerary/:id` | SHARED |
| **Concierge card** (page-level) | slip-view 50; concierge-card | GET `/api/ready-made/purchases/by-clone/:tripId`; POST `.../request-revision` | RECORD + PLANNING (gate: ready-made clone) |
| **Trip Pass card** (page-level) | slip-view 54; TripPassCard | GET/POST `/api/trips/:id/trip-pass(/purchase)(/confirm)` | PLANNING (entitlement) |

**Slip net: overwhelmingly PLANNING + SHARED, with a few honestly-gated RECORD read-outs.** Its record CTA
*navigates away to `/trip/:id`.*

### 1b. Details surface — `trip-details.tsx` (1523L)

| feature | file:line | reads / writes | class |
|---|---|---|---|
| Hero: title / dates / duration / party | 447-528 | GET `/api/trips/:id` (`Trip`) | SHARED |
| **Status badge** | 486-488 | **`trip.status` — the ratified-DEAD field, rendered verbatim** | MISPLACED / stale (see §3) |
| Expert-workspace status badge (gate: `expertWorkspaceStatus`) | 493-510 | additive field (cast `as any`) | RECORD |
| "Plan ready" optimized banner (gate: `?optimized=1`) | 534-576 | `plancardData.optimizationDelta` | RECORD |
| Share + link dialog | 612-624, 1452-1487 | POST `/api/trips/:id/share` | SHARED |
| **Regenerate / Generate itinerary** (+ destructive-rebuild confirm) | 625-636, 707-732, 1497-1520 | POST `/api/trips/:id/generate-itinerary` | **DUPLICATED / divergent** (D-1) |
| **`<PlanCard stage="full">`** (add/reorder/route/transport-mode via child sections) | 736-764 | self-fetches `/api/trips/:id/plancard` | **DUPLICATED** (D-2) |
| Booking Summary "Total Pending" (gate: `generatedItinerary`) | 771-818 | **stale `generatedItinerary.itineraryData.days` blob, `a.booked`** | RECORD (divergent source — see §5) |
| "Add a Booking" button (inert, no handler) | 820-831 | — | RECORD (dead) |
| Assigned-expert card + Message expert | 846-904 | GET `/api/trips/:id/expert-advisor`; nav `/chat` | PLANNING |
| **Add a local expert / Work with a Trip Planner** + full assign picker | 915-928, 1234-1397; assign 340-356 | POST `/api/trips/:id/expert-advisor` | **DUPLICATED** (D-3) |
| **EscalationCTA "Request expert / polish"** (rendered twice — direct + inside PlanCard) | 943-947; PlanCard 1195-1211 | POST `/api/expert-requests` | **DUPLICATED** (D-4) |
| Expert Suggestions list + Approve ("& add to itinerary") / Decline | 951-1073; review 319-338 | PATCH `/api/trips/:id/suggestions/:sid` (approve materializes an item) | PLANNING (slip has no equivalent) |
| Available Services grid + **Add to cart** | 1075-1161; addToCart 389-400 | GET `/api/services`; POST `/api/cart` | **DUPLICATED / divergent** (D-5) |
| Logistics tab: `TripLogisticsDashboard`, `TemporalAnchorManager` (×2), `ScheduleValidator`, `EnergyBudgetDisplay`, `AnchorSuggestionsPanel`, `WeddingAnchorPresets` | 647-671, 1168-1186 | write temporal anchors | PLANNING (details-exclusive) |
| Guests tab: `GuestInviteManager` / "Set up guest list" (gate: `isEventTrip`) | 1191-1223; POST `/api/user-experiences` | write invites/RSVPs | SHARED (event/party; details-exclusive) |

**Details net: ~80% PLANNING.** The genuinely record-appropriate, details-only content is thin (the Bookings
tab, itself stale-sourced; the two status badges). Everything else is either a duplicate of the slip's planning
stack or a parallel planning rail.

### 1c. The DUPLICATED rows (both file:lines + divergence)

| # | Capability | Slip | Details | Divergence |
|---|---|---|---|---|
| **D-1** | Optimize / regenerate the plan | Optimize → `POST /api/itinerary-comparisons` (SlipView 610) — **review-first, paid-gated, no auto-apply** | Regenerate → `POST /api/trips/:id/generate-itinerary` (td 626/718/1512) — **direct destructive rebuild, confirm dialog** | **Real divergence.** Two mechanisms, two endpoints, two safety models. The ratified path is review-first (`1b78a1eff`); details' destructive regenerate is the older one. |
| **D-2** | Item planning stack (add/reorder/route/transport-mode) | reuses `ActivitiesSection` RoutingActions from the same family (SlipView 354 / ActivitiesSection 196-262) | mounts full `<PlanCard stage="full">` (td 757) whose child sections carry the same actions | Same family, two entry shapes; slip promotes routing actions to first-class, details gets them via the mounted card. |
| **D-3** | Expert engagement | per-item "Send to expert" routing + plan-approval banner (ActivitiesSection 249; PlanApprovalBanner) | trip-advisor assign picker + suggestions approve/decline (td 340-356, 951-1073) | **Divergent granularity** — slip routes *items* to `with_expert`; details assigns a *trip advisor* and manages suggestions. Overlapping, not identical. |
| **D-4** | "Polish / escalate to expert" | Finalize → expert rail, `POST /api/expert-requests {ai_plan_polish}` (FinalizeBookingModal 108) | EscalationCTA → same `POST /api/expert-requests`, **rendered twice** on the page (td 943 + PlanCard 1195) | Same endpoint, three surfaces. |
| **D-5** | Checkout-prep | "Add all to checkout" routes items to `ready_for_checkout` (SlipView 702) | "Add service to cart" `POST /api/cart` from the marketplace grid (td 389) | Different mechanisms feeding the same cart; details' path is marketplace add, slip's is item-routing. |

---

## 2. The card components

**`plancard/PlanCard.tsx`** — its "pins / transport / expert-notes" three-layer model lives in `MapControlCenter`
(`layers = {activities, transport, expertNotes}`, MapControlCenter 306). **The three layers are FORKED across 8
mount sites, not consumed identically:**

| # | mount | stage/role | layer provenance |
|---|---|---|---|
| 1-3 | dashboard 394 / **trip-details 757** / itinerary 648 | full/owner | canonical — self-fetches `/plancard`, all 3 layers from that DTO |
| 4 | itinerary-view 618 | full/**viewer** | **FORK** — `days` passed as prop → DTO fetch **disabled** (`enabled:!daysProp`); trip-level `expertTravelerNote` can never populate |
| 5 | experience-template 1938 | **summary** | FORK — `PlanCardSummary`, no 3-layer map |
| 6-7 | expert/workspace 3947/3973 | full/**expert**, `embedded` | FORK — `embedded` strips traveler chrome |
| 8 | itinerary-comparison 609 | **proposal** | FORK — `ProposalColumn` only, no fetch, no 3-layer map |

Owner "full" mounts derive all three layers from one `/plancard` DTO; the public viewer mount (#4) forks to
prop-injected days and loses the trip-level expert-note layer; summary/proposal are different renderers entirely.

**`components/trip-card.tsx`** (standalone My-Plans card) — **DEAD CODE.** Grep finds **zero imports** anywhere
in `client/src`. It reads only its `trip` prop, branches its badge on **dead `trips.status`** (trip-card 47),
and links to **`/trip/:id`** (trip-card 21). The *live* My-Plans card is a **different, inline** component
(`my-trips.tsx:138`, mounted ×3) that is date-derived and navigates to **`/plans/:tripId`** (my-trips 151). So
the two "cards" diverge on both state signal (dead status vs dates) and nav target (`/trip` vs `/plans`) — and
the one that's wrong on both is the dead one.

---

## 3. Routing + state truth

### Route decls
`/trip/:id` → `TripDetails` (App.tsx 633); `/plans/:tripId` → `SlipViewPage` (App.tsx 651). Feeders:
`/itinerary/:id`, `/my-itinerary/:id` → `/trip/:id?tab=itinerary`.

### The date rule — governs only 2 of ~30 entry points
`planningRouteForTrip` (PlanningContext.tsx 66-76): `end = endDate+T23:59:59`; **`end < Date.now()` → `/trip/:id`
(record); else, including no dates → `/plans/:tripId` (slip).** Used **only** by TripStrip (trip-strip 221) and
the "Continue {trip}" chooser row (PlanningContext 250). **Every other entry hard-targets one route regardless
of date:**
- **→ slip:** My Plans "View" & card body, cart/comparison/ready-made success, notification bell (rewrites
  `/trip/`-prefixed `workspacePath` → `/plans/`), chat, all dashboard nudges (TodaysMove, PlanSlipStrip,
  SavedTrips), AI-generate panels, ready-made clone.
- **→ details:** My Plans "Trip Card" secondary, PlanCard body + all sub-CTAs, EA rows, **Plus occasion email**
  (`email.service.ts:262` → `/trip/:id?tab=itinerary`), CityGrid add-city, experience-template links, dead
  `trip-card.tsx`.

So the slip-vs-record decision is centralized in *two* paths and **bypassed everywhere else** — the same trip
resolves to details-via-email and slip-via-bell **by design** (`email.service.ts:1636`).

### State signal
- **`trips.status` is dead-by-ruling ("ruling 2, derive-and-retire") but not retired.** Live reads of the trip
  row's `status`: **`trip-details.tsx:487` renders it verbatim in a hero badge**; `trip-card.tsx:47` branches on
  it (dead file); `expert/workspace.tsx:2903` passes it through. Everywhere else explicitly avoids it (my-trips,
  EA, admin/plans, SlipView all carry in-code "status is dead" notes).
- **The honest signal is item `routing_status`** (`in_planning|with_expert|ready_for_checkout|purchased`,
  schema 45/4251) — a strip-and-derive privileged field, flipped to `purchased` (+ `bookingId`) only by
  checkout-confirm, never client-writable.
- **Purchased = per-item projection, computed in ONE place:** `isPurchasedRow(a) = !!a.booking ||
  routingStatus==='purchased'` (SlipView.tsx:136, **non-exported**). There is **no trip-level purchased
  boolean.**
- **The two pages do NOT share a derivation.** Slip derives record-ness from the item projection + a date-based
  phase chip. Details derives **no** page-level mode — it always renders the same tab shell and just echoes dead
  `trips.status`. The router uses a *third* signal (dates). Three signals, three places.

---

## 4. Drift history (last ~30 commits)

`SlipView.tsx` grew **almost entirely from slip-owned lanes** (born `3611e9ab4`; then map toggle `3171eb918`,
review-first optimize `1b78a1eff`, finalize `51f47dabf`) — plus **3 incidental card mounts** stacked on by
lanes about something else: Trip-Pass label/plumbing (`167ca0f90`, `01e2aa8e8`, `6ed99a9f3`), the CC-11 approval
banner (`a27303857`), the concierge card (`d1640ec1c`).

`trip-details.tsx` is the **opposite — almost every touch is incidental**: fix-waves (`bcf525a5b`, `7e75d409e`,
`22a47faa5`), guest invites (`d1a0371a8`), partner-catalog (`3555c18ca`), affiliate closure (`5e96579b9`),
testid sweeps (`68a36994e`), plancard refactor spillover (`1729d7aa1`). Only the nav-strip (`ad9fd5349`),
trip-card structural (`aa18f3ed1`), anchor-capture (`1a313aaf1`), and generate-repoint (`707d697d6`) touches
were that page's own job.

**The two never traded features directly.** They grew in parallel; the only thing they share is the plancard
endpoint (§5). The "merging" the dispatch reports is not cross-pollination — it is **two pages independently
implementing the same planning capabilities against the same data**, because no ruling ever said which page owns
what.

---

## 5. Data contracts

- **Shared endpoint:** `GET /api/trips/:id/plancard` — same queryKey string in both (slip-view 22, td 151), so
  they **share the React-Query cache**, but consume it under **two different types**: `SlipData` (SlipView 100,
  a superset with `SlipTrip` + `recentTransitions` + `meta.deliveredBy`) vs `PlanCardData` (plancard-types 361).
- **Three distinct trip shapes, no shared trip DTO:** (1) `Trip = trips.$inferSelect` (full Drizzle row) — held
  **only by details** via `useTrip`; (2) `PlanCardData.trip` — a **narrow 2-field** `{finalizedAt,
  expertTravelerNote}` (plancard-types 396); (3) `SlipTrip` — a **wide ~9-field** shape (SlipView 83-98) — held
  **only by the slip**.
- **Details-only endpoints:** `/api/trips/:id`, `/generated-itineraries/:id`, `/services`,
  `/trips/:id/expert-advisor`, `/user-experiences`, `/trip-experts`, `/offering-types/experts`,
  `/trips/:id/suggestions`. **Slip-only:** none at page level beyond `/plancard` (its extra pulls are inside the
  `ConciergeCard`/`TripPassCard` children).
- **Purchased projection — no shared helper.** The `ready_for_checkout → cart_items` projection *is* shared and
  server-side (`cart-projection.service.ts:155 syncItemProjection`, the single writer of `cart_items`). There is
  **no analogous purchased projection.** The slip computes `isPurchasedRow` locally from live `booking` /
  `routingStatus` (SlipView 136); **details computes a *different* "Total Pending" projection inline** from the
  **stale `generatedItinerary.itineraryData.days` blob** using an unrelated `a.booked` boolean (td 782-786) —
  different source, different field, different meaning (pending, not purchased). The two surfaces' notion of
  "booked" shares **no type, source, or predicate.**

---

## HARD STOP — diagnosis & recommendation (Leon rules)

**How much is DUPLICATED/MISPLACED:** high. Of `trip-details`'s user-visible capabilities, ~80% are PLANNING;
D-1…D-5 cover its optimize, item-stack, expert engagement, escalation, and checkout-prep — every one of them a
duplicate (often divergent) of a slip capability. The details-exclusive planning tools (temporal anchors,
suggestions approve/decline, guest invites, marketplace grid) are not duplicates but are still **PLANNING on the
surface that's supposed to be the record**. The genuinely RECORD, details-only content is thin and, where it
exists (the Bookings tab), is sourced from a **stale blob** with a predicate that disagrees with the slip's live
projection.

**Does a clean state signal exist?** Yes at the item level — `routing_status` + `booking` (`isPurchasedRow`) is
already the honest, privileged, derive-only signal. But it is **not consolidated**: it lives non-exported in one
component, there is no trip-level "this is a record now" derivation, and the three surfaces use three different
signals (item projection / dead `trips.status` / dates). The signal is real but **unbuilt as shared
infrastructure** — exactly the gap the cart-is-slip projection already closed on the checkout side.

**Recommendation: (A) one surface, state-driven modes.** Reasoning:

1. **The signal to drive modes already exists and is already the honest one** — the item projection. Promoting
   it to a shared derivation (ideally a server-side *purchased projection* mirroring `syncItemProjection`, plus
   a trip-level "record-ready" boolean derived from it) is a **known, precedented move** (cart-is-slip), not new
   architecture.
2. **The two pages are already one data source** — the shared `/plancard` endpoint, typed twice. That's evidence
   they are one surface wearing two type hats, not two surfaces.
3. **For this pair, (B) collapses into (A).** B says "details reads only; move misplaced PLANNING to its home."
   But details is ~80% mutation — enforcing B moves nearly the entire page onto the slip, leaving details as a
   near-empty shell that renders the record view. That shell *is* the slip's record-mode. So B's endpoint is A's
   endpoint, reached with more churn and a lint rule to police a boundary that history shows nobody respected
   (every incidental lane added mutation to details anyway).
4. **A fixes an honesty bug B would entrench.** Details' record surface reads a stale generated-itinerary blob; a
   record *mode* of the slip reads the same live item projection the slip already computes — one source of truth
   for "purchased," not two.

**Shape of the (A) lane, if ruled (NOT in this dispatch):**
- Keep `/trip/:id` as an **alias/redirect** into the unified surface so **no link breaks** — the occasion email,
  EA rows, PlanCard sub-CTAs, and `?tab=`/`?item=`/`?addCity=`/`?optimized=1` deep-links all hard-target it.
- Define the **purchased projection** analogously to the cart projection; derive the **record-vs-working mode**
  trip-level from it (+ dates as a secondary phase), and **replace `planningRouteForTrip`'s date-only rule** with
  that derivation so all ~30 entry points agree.
- **Mount `PlanCard` once**; fold the details-exclusive tools (temporal anchors, suggestions, guest invites,
  marketplace grid) into the unified surface as mode-gated panels — they are not duplicates and must not be
  dropped.
- **Reconcile D-1 to one optimize path** — the ratified review-first Optimize→comparison — and retire details'
  divergent destructive `generate-itinerary` regenerate.
- **Retire the last `trips.status` reads** (`trip-details.tsx:487`, dead `trip-card.tsx`) per ruling 2.
- **Delete dead `components/trip-card.tsx`** (zero imports) — or, if kept, fix its `/trip` link + dead-status
  branch; recommend delete.
- Regression net: `journey-traveler` + the planning-entry spec, updated in the same lane.

**If Leon rules (B) instead:** the move-only lane is large (nearly all of trip-details' PLANNING rows migrate),
and a lint rule must forbid mutations in `trip-details.tsx`. Same destination, more commits, a boundary with a
poor historical track record.

*Prior lean toward (A) was set aside until the inventory; the inventory raises the confidence because the state
signal turned out to already exist and details turned out to be almost entirely mutation. Leon rules.*
