# Reconcile Phase 1 — Scope (written against Trip-Gravity Audit findings, Jul 31 2026)

**Parent brief:** `TRIP_ARTIFACT_RECONCILE_BRIEF.md` · **Findings basis:** Trip-Gravity Audit Phase 0 + `E2E_ITEM_LIFECYCLE.md` §4–5 (Q1 nine-consumer inventory).
**Sequencing:** starts **after L10 remediation merges** — Phase 1 adds mutation surfaces (routing transitions) and must not build on the known-broken `getTripRole` gates. One lane, one branch, one agent. No direct-to-main.

---

## 0. What the findings changed from the original brief

1. **The optimizer is cart-based, not tripId-based** (routes.ts:5298 — spec was wrong, code is ground truth). Therefore: **the cart cannot become a pure projection in Phase 1.** The open decision from brief §5 is now resolved by evidence: **thin compatibility layer.** `cart_items` remains a physical table, but becomes a **single-writer materialized projection** of items in `ready_for_checkout` status. Nine consumers keep reading it; only the projection-sync path writes it.
2. **Expert-cart pollution is confirmed live** (booking-actions.ts:649) — in scope as a one-line-class fix (read trip items, not cart).
3. **H1/H2/H5 have exact coordinates** — scoped below as concrete fixes, not investigations.
4. **No per-item routing state exists anywhere** (transition table: L2→L3 UNOWNED) — greenfield column, no legacy semantics to migrate.

## 1. In scope (the whole list — nothing else)

**W1 — Per-item routing state.**
- New `routing_status` on trip item rows: `in_planning` (default) | `with_expert` | `ready_for_checkout` | `purchased`. Exclusive per item, mixed per trip.
- **Push-canonical hazard applies:** the column default must be set by explicit ALTER and verified via `information_schema`, not assumed from drizzle push. ORM default and DB default must be proven identical.
- Transitions: traveler-only for `→ready_for_checkout` (purchase intent is never expert-written); expert-return flips `with_expert→in_planning`; `→purchased` written only by the checkout confirm path, atomically with the booking write.

**W2 — Cart as single-writer projection.**
- One projection-sync module owns all writes to `cart_items`: item enters `ready_for_checkout` → row upserted; leaves → row removed; `purchased` → row removed.
- Every other current writer of `cart_items` is re-pointed to write trip items + routing status. The Q1 nine-consumer inventory is the checklist: **each consumer gets an explicit disposition (re-pointed / reads-projection / unchanged-and-why) in the PR description.**
- ~~**Standing constraint (merge gate):** the optimizer's cart read (routes.ts:5298) and its apply paths must behave identically before/after. This constraint holds until the optimizer re-point lane (lane 6) lands.~~
  **RETIRED Jul 31, 2026 by Lane 5b (the re-point), decision-maker ratified.** The constraint existed only to keep the cart read stable *until* the optimizer read the Trip instead — which it now does: the baseline is the trip's own `itinerary_items` (`in_planning` + `ready_for_checkout`), `purchased` items are anchor-style constraints, `with_expert` is never read (`docs/briefs/ROUTING_STATE_CONTRACT.md` §2, "Optimizer (Lane 5b)"). The cart⋈provider_services read survives ONLY as an explicitly-labelled guest-only branch, unreachable while these endpoints are `isAuthenticated`, retiring with G2. The projection module remains the sole writer of `cart_items` — **that rule is unchanged and not part of the retirement.**

**W3 — H1 fix (convert-to-itinerary, routes.ts:5645–5712).** Preserve `serviceId` through conversion; stop deleting the cart row as the mechanism of conversion — conversion is now a routing-status transition, and the projection sync handles the cart row.

**W4 — H2 fix (purchases reach the plan).** Checkout writes `service_bookings.tripId` (already does, keep) **and** flips the item to `purchased`; TripPlan assembler (trip-plan.service.ts) gains a read of `service_bookings` keyed by tripId so purchased items render as purchased on the Trip Card.

**W5 — H5 fix (apply-to-trip, plancard.routes.ts).** Preserve `providerServiceId` on applied variant items. Companion: surface H6's silent skip (routes.ts:6154) as a user-visible message — do not change its behavior, just stop it being silent.

**W6 — Expert workspace reads the trip, not the cart.** booking-actions.ts:649 cart read replaced with trip-item read filtered to `in_planning` + `with_expert`. The workstation's live-trip read (645–648) is already canonical — keep.

**W7 — Routing actions on the Trip Card (H3).** PlanCard gains per-item "send to expert" / "add to checkout" actions driving W1 transitions. **Extend the canonical component — never fork `components/plancard/`.** Role/stage-aware per the existing `<PlanCard role stage />` contract.

## 2. Explicitly OUT of scope (named lanes exist — do not absorb)

- Optimizer re-point to tripId → **Lane 5b** (retires the W2 constraint) — **LANDED Jul 31, 2026.** (Earlier drafts labelled this "lane 6"; corrected.)
- `getTripRole` / auth model → **L10 lane** (Phase 1 merely *sits behind* it).
- `trip_contexts` re-key to tripId → follow-up after this lane lands.
- trips.status lifecycle / admin completed-count → **lane 4**.
- H4 share renderer → **lane 5**.
- Guest session Trip (G2 reshape), guest expiry, repeat-pair rails rate, Phase 4 afterlife → deferred inventory.

## 3. Build order & gates

**Phase 1a — schema.** W1 column + explicit ALTER migration appended to `migration-files.ts` chain.
*Gate:* `information_schema` proves DB default = ORM default = `in_planning`; chain-integrity test green; `tsc --noEmit` no new errors vs. main's 254 baseline.

**Phase 1b — transitions + projection.** W1 transition endpoints (behind L10-remediated gates) + W2 projection-sync as the sole cart writer.
*Gate:* behavioral proof — a scripted run showing: item routed to checkout appears in cart; routed back, disappears; purchased, disappears; **optimizer run on a projected cart produces identical output to pre-change** (the merge-gate constraint, proven, not asserted). Fee-literal grep clean.

**Phase 1c — the four leak fixes.** W3, W4, W5, W6.
*Gate:* behavioral proof per fix: converted item retains `serviceId` and is buyable; a paid booking renders on the Trip Card; applied plan retains `providerServiceId`; expert view shows trip items with a cart-free query plan (proven via query, not grep). H6 message renders.

**Phase 1d — Trip Card routing UI.** W7.
*Gate:* Playwright pass on route→expert and route→checkout journeys using the standard test accounts; no forked PlanCard (`git diff` shows extension only); no swallowed assertions (gate-integrity discipline).

**Merge:** human read required — this lane touches money-adjacent paths (checkout transition write) and the expert path. Every phase PR description carries the W2 consumer-disposition table and the optimizer-constraint proof.

## 4. What NOT to do

- ~~Do **not** break or "improve" the optimizer's cart read — identical behavior is a merge gate until lane 6.~~ *(Discharged: Lane 5b replaced the read outright, Jul 31 2026. What replaces this rule: no logged-in caller may read the cart as an optimizer baseline — the Trip is the only baseline for a signed-in user.)*
- Do **not** let any path other than the projection-sync module write `cart_items` after 1b.
- Do **not** let the expert (or any non-traveler role) set `ready_for_checkout`.
- Do **not** introduce fee literals, client-trusted amounts, or client-trusted userId anywhere touched; `fee_bands` resolver only; Stripe idempotency + atomic `WHERE status='pending_payment'` untouched.
- Do **not** route new mutations through `getTripRole` — use the L10-remediated gates.
- Do **not** backfill `routing_status` speculatively on historical rows beyond the honest default — null/default is honest; fabricated history is not.
- Do **not** fork PlanCard, and do not absorb any §2 item because it's "right there."

---

*Phase 1 in one line: give every trip item a routing status, make the cart a single-writer projection of one of those statuses, fix the four leaks the audit located, and put the routing actions on the Trip Card — all without disturbing the optimizer's cart read until its own lane retires it.*
