# Adopt/Finalize — mock-conformance audit (Phase 0, read-only)

`audited@c757678ca` (origin/main HEAD, post-Trip-Card-rebuild) · **no code changed** · **HARD STOP — Leon rules on fix scope (§D)**

> Dispatch: walk `docs/design/adopt-optimization-mock.html` in a browser FIRST, write its flow as a numbered
> sequence, then map every step to live code and produce the conformance table. Ruling this encodes (filed for
> the ledger at build time): **adopt = merge, finalize = lock; two vocabularies, two presses, never one button
> doing both.** Companion spec: `docs/design/ADOPT_OPTIMIZATION_SPEC.md` (its §4 contracts R-A/R-B/R-C are
> cited below — this audit confirms which have landed and which haven't).

---

## TL;DR

- **The core invariant HOLDS in code today: no button fuses adopt and finalize.** The slip's button ONLY
  finalizes (never merges); the comparison's Apply ONLY merges and lands you on the slip (never locks). The
  rot is **vocabulary and structure**, not a fused press.
- **The slip's finalize control wears the adopt name.** `SlipView.tsx:892` renders the finalize trigger as
  **"Adopt Optimization"** — the word "Finalize"/"Make final" appears on no slip button — and it renders only
  while `!finalizedAt`, so on a finalized trip the control vanishes entirely (the observation that opened this
  lane). The mock's toolbar carries **"Finalize plan"** as a standing solid primary.
- **Batch "Adopt selected stops" is MISSING** (spec R-A, still unbuilt). Today the `+` tick adopts ONE stop
  instantly with a toast — no selection arming, no "Bring these into your plan?" confirm, no batch endpoint.
- **Adopting never LOCKS** — no adopt path flips `finalized_at`. But `adopt-stop` DOES write a `trip_finals`
  v+1 when the trip is ALREADY final (`plancard.routes.ts:360` — the **ratified** auto-v+1), while
  `apply-to-trip` does not: the two adopt paths are inconsistent, and the dispatch's "adopt … does not create
  a version" **conflicts with two ratified rulings**. This is the one genuine ruling call in §D — v10 on the
  California trip is the accumulated ratified auto-v+1s (suggestion-accepts, adopt-stops, mid-trip buys),
  **not** adopt flipping the lock.
- The finalize chooser (`FinalizeBookingModal`) already IS the mock's "You're set — how do you want to book
  it?" with all four lanes wired to real rails — but its footer still says **"hands them a copy"**, which the
  mock (updated per R-C) and the stationary-slip erratum both reject in favor of **"gives them access."**

---

## §A — The mock's flow, as walked (Playwright, 1280×950; captures in the lane workspace)

The mock narrates itself in steps; captions quoted verbatim.

1. **Step 1 · On your slip.** Action row: `Share · Preview Trip Card · Add all to checkout (3) ·`
   `✨ Optimize this plan · Finalize plan` — **Finalize plan is a standing solid button in the slip's own
   action row** ("start here — the ✨ Optimize this plan button sits in your slip").
2. **Popup 1 — "Build around a location"** (from *Optimize this plan*). Auto — recommended (default) or pin a
   Hotel / Neighborhood / Activity anchor; candidate list with fit scores; custom location; footer:
   *"Optimization is a paid step — you confirm here before anything runs or is charged."* CTA:
   *"Generate 3 versions around {X}"*.
3. **Step 2 · Review the proposals — "nothing is applied until you choose."** Four columns: *"As you built
   it"* with **Keep this plan** and **Adopt selected stops** (rendered DISABLED; ticking `+` stops arms it to
   **"Adopt 2 selected stops"**), and three proposals each with **Adopt entire plan** + per-stop `+` ticks.
4. **Popup 2a — adopt-entire confirm: "Adopt {proposal name}?"** — *"This replaces the still-in-planning
   portion of your current plan with the complete optimized version."* Back / **Adopt entire plan**. Footer:
   *"Adoption changes only your still-in-planning items. Purchased, in-checkout, and with-expert items stay
   put; nothing is purchased here."*
5. **Popup 2b — adopt-selected confirm: "Bring these into your plan?"** — *"Only the selected stops change.
   Everything else in your current plan stays as it is."* Lists the picked stops (*FROM OPTIMIZED PROPOSALS*).
   Back / **Adopt N selected stops**. Footer (the dispatch's semantic anchor): *"One confirmation adds the
   selected items to your existing plan. Nothing is purchased."*
6. **The landing.** *"Your plan is the landing spot… they will land here."* After adopting — whole or partial
   — the traveler is back on the slip with the merged content, still in planning. Nothing locked, charged, or
   versioned by the adopt press.
7. **Popup 3 — "You're set — how do you want to book it?"** (from *Finalize plan*, a SEPARATE press). Lede:
   *"Your finalized plan is locked in. Choose how the bookings get made — do it yourself, or hand it to
   someone. Either way your plan stays yours."* Lanes: ☑ **Book it myself** (default — "Book each stop
   in-platform at your own pace — add to cart and check out when ready. Nothing handed off.") · *or have
   someone book it for you* · **Booking agent** ("Books it as-is") · **Travel expert** ("Refines, then
   books") · **Concierge** ("Handles end-to-end"). Back / Continue. Footer: *"Choosing a person gives them
   **access** to your finalized plan to book on your behalf — you keep ownership, and nothing is charged until
   you or they confirm a booking."*

---

## §B — The dispatch's five questions, answered

**1. What does the slip's "Adopt Optimization" button actually do?** It ONLY finalizes. Handler
(`SlipView.tsx:881-894` → `runFinalize` `:616` → `useFinalizeMutation` `:475`) POSTs
`/api/trips/:tripId/finalize` (the Phase-1 `finalizeTrip` spine — snapshot + lock in one transaction), then on
a fresh finalize opens `FinalizeBookingModal` (`:621`). It merges nothing, adopts nothing. It is the mock's
"Finalize plan" press wearing the wrong name, gated `isOwner && !trip.finalizedAt` (hidden once final; hidden
forever on a past trip since reopen is also date-suppressed — R-F).

**2. What does the comparison's Adopt path do?** Merge-and-return-to-slip, exactly mock step 6. Client
(`itinerary-comparison.tsx:934-955`): confirm dialog → `POST …/select` → `POST …/apply-to-trip` → toast →
`setLocation('/plans/'+tripId)`. Server (`plancard.routes.ts:46-…`): replaces the `in_planning` set with the
variant's items (purchased/in-checkout/with-expert preserved — the rebuild-guard predicate). **No
`finalizeTrip`, no `reFinalizeIfCurrentlyFinal`, no `finalized_at` write** in the apply-to-trip handler.

**3. Does the "Bring these into your plan?" selected-stops confirm exist?** **No.** There is no multi-select:
the `+` tick (`ProposalColumn.tsx:164-180` → `adoptStopMutation`, `itinerary-comparison.tsx:961-977`) adopts
ONE stop immediately — no arming, no batch, no confirm, toast only ("Added to your plan… nothing is
purchased"). The mock's baseline-column "Adopt selected stops" button and popup 2b have no counterpart. Spec
R-A (batch contract: destination day/time, idempotency, conflict semantics, one confirmation) is the named,
still-unbuilt rail. The whole-variant path DOES have a confirm (`dialog-apply-confirm`,
`itinerary-comparison.tsx:1866-1915`): "Apply {name} to your plan?" — substance matches mock popup 2a
("replace the items still in planning… purchased items stay pinned, and nothing is purchased by applying")
but in "Apply" vocabulary, and it adds "**The other proposals will be discarded**" (see §D-4 vs R-B).

**4. Does the finalize dialog match the mock, and which booking paths are real?**
`FinalizeBookingModal.tsx` matches mock popup 3 in structure and near-verbatim copy: same title, same lede,
same four lanes with the same blurbs, myself as default, "or have someone book it for you" divider,
Back/Continue. All four lanes are wired to REAL rails:
- **myself** → `runBulkRouteToCheckout` → items to `ready_for_checkout`, land on `/cart` (route exists,
  `App.tsx:475`). Real.
- **agent** → `POST /api/affiliate-booking-requests` per partner-bookable stop by opaque `bookingToken`
  (§16; `content.routes.ts:7087`). Real, and honestly DISABLED with a reason when the plan has no
  partner-bookable stops ("No partner-bookable stops in this plan") — a stricter posture than the mock, which
  draws all four lanes enabled.
- **expert** → `POST /api/expert-requests` (`booking-actions.ts:171`) with
  `requestType: "ai_plan_polish"`. Real — but note R-C recommends the mechanism be the existing
  **advisor-access grant** (`trip_expert_advisors`), not only a request row; today it creates a request.
- **concierge** → navigate `/concierge?intent=…` (route exists, `App.tsx:381`; the concierge surface owns the
  quote). Real.
Deltas: the modal's footer reads "Choosing a person **hands them a copy** — your plan is never edited out
from under you…" — the mock (updated per R-C) says "**gives them access** to your finalized plan… you keep
ownership." The "copy" wording contradicts the ratified stationary-slip erratum
(`SLIP_EXPERIENCE_DISPATCH.md` §0). The separate pre-gate `confirm-finalize-unbooked` ("Finalize without
booking?", `SlipView.tsx:896-916`) has no mock counterpart — the mock's chooser itself carries the
no-purchase framing.

**5. Does adopting ever create a `trip_finals` row today?** **It never LOCKS** — no adopt path flips
`finalized_at` (only `POST /finalize` does; `finalizeTrip`/`reFinalizeIfCurrentlyFinal` are the table's sole
writers and `reFinalizeIfCurrentlyFinal` no-ops unless the trip is ALREADY final). But on an
already-finalized trip, **`adopt-stop` writes a new version**: `plancard.routes.ts:360` calls
`reFinalizeIfCurrentlyFinal` after appending (best-effort, non-fatal) — the **ratified auto-v+1**
(`2026-08-31-trip-card-snapshot-render`; same semantics as suggestion-accept `booking-actions.ts:1051` and
mid-trip purchase `content.routes.ts:7422`, `2026-08-31-mid-trip-purchase-versions`). `apply-to-trip` has
**no** such call — the two adopt paths disagree. So the California trip's **v10** is the accumulation of
ratified auto-v+1 re-snapshots on an already-final trip, not adopt-locking; "adopt has been finalizing" is
**false for the lock, true (adopt-stop only) for version-writing** — and that version-writing was ruled, not
drift. The conflict with this dispatch's "adopt … does not create a version" is §D-1.

---

## §C — Conformance table

| # | Mock step (§A) | Code today | Verdict |
|---|---|---|---|
| 1 | Slip action row carries **Finalize plan** as a standing solid primary | Finalize trigger exists but labeled **"Adopt Optimization"** (`SlipView.tsx:892`), rendered only `isOwner && !finalizedAt` (`:881`) — gone once final; never reads "Finalize"/"Make final" | **drifted** (label + presence) |
| 2 | Popup 1 "Build around a location" (paid-step footer, anchors, generate-3) | `BuildAroundDialog` per spec §2.3, opened from `slip-action-optimize` (`SlipView.tsx:814`); paid confirm unchanged | **conforms** (visual detail out of scope here) |
| 3 | Board: baseline **Keep this plan** | `applyLabel: "Keep this plan"` for the baseline column (`itinerary-comparison.tsx:647`) | **conforms** |
| 4 | Board: proposals say **Adopt entire plan** | Variant button reads **"Select this plan"** (`:647`) | **drifted** (vocabulary) |
| 5 | Board: **Adopt selected stops** — disabled until `+` ticks arm it ("Adopt 2 selected stops") | No multi-select, no armed batch button; each `+` adopts one stop instantly (`ProposalColumn.tsx:164`, `adoptStopMutation`) | **missing** (spec R-A unbuilt) |
| 6 | Popup 2a adopt-entire confirm "Adopt {name}?" + stays-put/nothing-purchased footer | `dialog-apply-confirm` "Apply {name} to your plan?" (`itinerary-comparison.tsx:1866`) — same substance, "Apply" vocabulary; adds "other proposals will be discarded" | **conforms in substance, drifted in vocabulary** (+ §D-4) |
| 7 | Popup 2b adopt-selected confirm "Bring these into your plan?" / "One confirmation adds… Nothing is purchased." | Does not exist (no batch to confirm) | **missing** |
| 8 | Landing: adopt merges → back on the slip, still planning; no lock, no charge | Whole-apply navigates `/plans/:tripId` after merge; per-stop stays on board; nothing charged; `finalized_at` untouched by both | **conforms** (with §D-1 on version-writing) |
| 9 | Adopt creates **no version** (dispatch reading of the footer) | `adopt-stop` → auto-v+1 on an already-final trip (`plancard.routes.ts:360`, RATIFIED); `apply-to-trip` → no re-snapshot (inconsistent) | **ruling conflict** — §D-1 |
| 10 | Finalize is its own press → popup 3 "You're set — how do you want to book it?" | `runFinalize` → `POST /finalize` → `FinalizeBookingModal` on fresh finalize (`SlipView.tsx:616-621`) | **conforms** (never fused with adopt) |
| 11 | Popup 3 lanes: myself default / agent / expert / concierge, all drawn enabled | All four wired to real rails (§B-4); agent honestly disabled without partner-bookable stops | **conforms+** (stricter than mock — keep? §D-3) |
| 12 | Popup 3 footer: "gives them **access**… you keep ownership" | Footer says "hands them a **copy**" (`FinalizeBookingModal.tsx:221`) — pre-R-C copy; contradicts the stationary-slip erratum | **drifted** |
| 13 | No separate pre-finalize gate; the chooser carries the no-purchase framing | Separate "Finalize without booking?" dialog before finalize when staged-unbooked > 0 (`SlipView.tsx:896`) | **drifted** (structure — dispatch: fold into the chooser) |
| 14 | Two vocabularies, two presses, never one button doing both | Holds mechanically everywhere; broken **nominally** by row 1 (the finalize button wears "Adopt") | **conforms mechanically / drifted nominally** |

---

## §D — Tensions needing Leon's ruling (nothing below resolved silently)

1. **"Adopt creates no version" vs the ratified auto-v+1.** `2026-08-31-trip-card-snapshot-render` ratified:
   adopting a stop / accepting a suggestion on a CURRENTLY-final trip re-snapshots to v+1 *so the accepted
   change shows on the Trip Card immediately*; `2026-08-31-mid-trip-purchase-versions` extended it to
   purchases ("everything a traveler does mid-trip lands on their card"). The dispatch reads the mock's footer
   as "adopt … does not create a version." Options: **(a)** keep auto-v+1 and word the new ruling "adopt never
   *locks*; on an already-final trip the ratified auto-v+1 re-snapshot applies so the card stays current" —
   then `apply-to-trip`'s missing `reFinalizeIfCurrentlyFinal` is a **bug** to add (consistency with
   adopt-stop); **(b)** strike auto-v+1 for adopt paths — then a stop adopted onto a final trip is invisible
   on the Trip Card until a manual re-final, reopening the exact gap those rulings closed. *Recommend (a).*
   (Note the mock's footer literally promises no **purchase**, not no version — the no-version reading is the
   dispatch's extension.)
2. **The control's label.** The mock's toolbar says **"Finalize plan"**; the dispatch/ruling text says the
   control reads **"Make final"**. Name the winner (recommend "Make final" per the ruling; the mock is
   appearance-of-record but the ruling text is later and explicit). Also rule its **presence**: standing solid
   primary that, once final, gives way to the ready-banner (today's behavior) — or standing always with a
   finalized state? (Today it disappears entirely; the mock only draws the pre-final state.)
3. **Agent-lane honesty.** Mock draws all four lanes enabled; code disables Booking agent (with reason) when
   no partner-bookable stops exist. Keep the stricter honest-disable (recommend), or match the mock?
4. **"The other proposals will be discarded."** The live apply-confirm says this; R-B ratified variants as
   *revisitable proposals*. Rule whether apply consumes the comparison (then R-B's wording needs the
   supersession) or proposals stay revisitable (then the dialog copy — and any server-side consumption — is
   the defect).
5. **Expert-lane mechanism.** R-C recommends the handoff be the existing **advisor-access grant**; today the
   expert lane files an `ai_plan_polish` request. Confirm the request rail is acceptable for now or order the
   grant wiring in this lane.
6. **R-A batch contract.** Building "Adopt selected stops" + popup 2b needs the batch endpoint contract
   (destination day/time, grounded `provider_service_id`, idempotency, duplicate/conflict behavior,
   preservation of purchased/in-checkout/with-expert). Confirm this lane builds it, or defer to a separate
   lane and ship vocabulary/structure fixes (rows 1, 4, 6, 12, 13) first.

**HARD STOP.** Nothing built beyond this report. `[guarded]`: finalize writes `trip_finals`; the chooser
fronts booking paths; no behavior changed in Phase 0.
