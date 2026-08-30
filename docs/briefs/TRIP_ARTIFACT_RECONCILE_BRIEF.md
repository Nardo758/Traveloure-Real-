# Trip-as-Artifact Reconcile Brief (amends UNIFIED_PLANNING_FLOW_SPEC_v2)

**Status:** Reconcile brief — Phase 0 read-only audit required before any build approval.
**Amends, does not supersede:** `UNIFIED_PLANNING_FLOW_SPEC_v2.md`. G1 (Trip canonical) is *reinforced*. The cart's role is *redefined*. G2's shape changes. All other gaps (G3–G8) survive with minor rewiring noted below.

---

## 0. The problem (read first — this is what you're mapping downstream effects against)

**Symptom:** items a user selects during *planning* land in the *cart*. There is no neutral holding state. The moment a user picks something — from Discover, a template, or the AI planner — it is treated as something they intend to buy.

**Why that's wrong:** consideration and commitment are different intents, and the platform's whole premise separates them. A user assembling candidate options for an expert to review has committed to nothing. Under the current model there is no way to express "I'm considering these, expert, what do you think?" without those same items sitting in a purchase container. Concretely, this breaks three flows:

1. **Expert handoff is polluted.** The expert receives (or the user must send) a *cart* — a purchase list — when what the expert should receive is a *plan under consideration*. The expert can't distinguish "user wants to buy this" from "user is curious about this."
2. **Checkout is ambiguous.** If the cart contains everything ever selected, checkout either buys things the user was merely exploring, or the user must manually prune the cart at the last second — deleting items they still want *in the plan*, just not in *this purchase*. Removing from cart destroys planning state.
3. **Partial routing is impossible.** A user cannot send half the trip to an expert and buy the other half, because both halves live in one undifferentiated container.

**Root cause:** the cart is doing double duty as planning container *and* purchase container. `cart_items` is an independent store that entry points write into directly, so "selected" and "will purchase" are the same fact in the data model. The v2 spec's flow (`entry points → CART → Trip`) bakes this in: the purchase container is *upstream* of the canonical object, inverted from where it belongs.

**Downstream-effect surface (what to trace in Phase 0):** every consumer of `cart_items` inherits this ambiguity. Anything that reads the cart to (a) create a trip, (b) compute checkout amounts, (c) build the expert request, (d) run the optimizer, or (e) migrate a guest session is currently reading "selections" when it may believe it's reading "purchases," or vice versa. Map each of these consumers and record which meaning it assumes — that assumption inventory is what Phase 1 will be scoped against. Where two consumers assume different meanings of the same rows, flag it explicitly: those are the latent bugs this reconcile is paying down.

**The fix in one line:** selections attach to the canonical Trip; routing to the expert or to checkout becomes a per-item status transition; the cart becomes a read projection of items the user explicitly marked for purchase.

---

## 1. Strategic reframe

The platform already has its canonical object — the **Trip** (G1, confirmed). This brief makes it the **work-in-progress artifact on a production line**: one object that moves through stations, where each station *operates on* the Trip but never *owns a copy* of its contents.

```
                    ┌─► EXPERT WORKSTATION  (receives Trip, refines, returns)
PLANNING (Trip) ────┤
  selections attach │
  to the Trip       └─► CART / CHECKOUT     (projection: items marked for purchase)
                              │
                              ▼
                          PURCHASED
```

**The core fix:** consideration ≠ commitment. Today the cart does double duty as planning container *and* purchase container. A user curating options for an expert has not decided to buy anything. Under this model:

- **Selections attach to the Trip**, regardless of entry point (Discover, template, AI planner).
- **The cart is a projection, not a store** — "the subset of trip items the user marked for purchase." It has no independent contents.
- **Routing is a state transition on the item, not a copy of the item.** "Send to expert" and "send to cart" flip item status. Nothing is duplicated between containers.

This eliminates a parallel-source-of-truth risk (planning items vs. cart items vs. workstation items drifting apart) — the same class of problem already stamped out with `fee_bands`, `transport-modes.ts`, and the single-canonical PlanCard.

## 2. Item state model

```
in_planning ──► with_expert ──► (expert returns) ──► in_planning
     │
     └────────► ready_for_checkout ──► purchased
                        │
                        └─► (removed from cart) ──► in_planning
```

- One status field per trip item (exact column/table per Phase 0 findings — likely on the `tripId`-linked item rows from G1).
- `with_expert` and `ready_for_checkout` are **not mutually exclusive across the trip** — a user can send half the trip to an expert and buy the other half. They are exclusive **per item**.
- Expert returns items to `in_planning` (possibly modified/added); the user re-routes. The expert never pushes items directly into `ready_for_checkout` — purchase intent is always a traveler action.
- Approval-lifecycle discipline applies: items are never born `purchased`.

## 3. What changes vs. what stays

| Element | v2 spec | This brief |
|---|---|---|
| Canonical object | Trip (G1) | **Unchanged — reinforced.** |
| Cart | The hinge; all entry points write to it; resolves *into* a Trip at the optimize gate | **A projection of the Trip** (items with `ready_for_checkout` status). No independent store. Entry points write to the **Trip**. |
| G2 guest cart | Session cart (`guest_sessions`) + migrate-on-signup | **Session Trip** (guest-owned trip, same session UUID mechanism) + migrate-on-signup. Same work, different shape. |
| G5 Discover → "Add to plan" | Extends `cart_items` for non-service content | Extends **trip items** for non-service content. Same requirement, retargeted. |
| G3/G4 optimize gate + fee | Optimizer takes the cart → creates Trip (G6) | Optimizer takes the **Trip directly**. G6 (trip auto-creation from cart) dissolves — the Trip exists from the first selection. |
| G7 push to PlanCard | Unchanged | Unchanged. |
| G8 expert branch | `expert_request` pre-filled with trip + context | **Unchanged in spirit** — now formalized: the workstation receives the Trip (or the `with_expert` subset), not a copy. |
| Checkout / money path | Server-computed amounts | **Unchanged and load-bearing:** checkout reads the `ready_for_checkout` projection and server-computes all amounts. No client-trusted totals, no fee literals, `fee_bands` resolver only. |

## 4. Phase 0 — read-only audit (HARD STOP before any writes)

Answer each with file:line evidence. No schema changes, no code changes, no branch creation for build work during Phase 0.

1. **`cart_items` today:** full schema, every reader and writer. Which paths treat `cart_items` as the source of truth for anything (pricing, availability, trip creation)?
2. **G1 status:** does the `tripId` FK on `user_experiences` exist and get populated? Where are trip items actually stored, and do they already carry any status/lifecycle field this state model can extend?
3. **G2 status:** what, if anything, has been built on guest session carts? Any `guest_sessions` table, migrate-on-signup endpoint, or session-UUID cart logic in flight?
4. **Trip creation points:** every code path that creates a `trips` row today. Which assume a cart precedes the trip?
5. **Checkout path:** where does checkout read its line items and compute amounts today? Confirm amounts are server-computed; flag any client-trusted input on this path (known recurring failure class).
6. **Expert handoff:** what does `expert_request` actually carry today — a trip reference, or copied content? Does the workstation read live trip data or a snapshot?
7. **NULL-userId exposure:** do any of the paths above sit in the known NULL-userId consumer sweep territory (money paths, existing trip queries)? List overlaps — this brief must not merge ahead of that sweep on shared paths.
8. **Migration posture:** which of these tables are push-managed vs. migration-managed? Any ORM-default vs. DB-default divergence on status/lifecycle columns (known push-canonical hazard)?
9. **Auth on affected routes:** are the routers for trips/cart/checkout mounted with `isAuthenticated` where required? (Unmounted-router bug class — verify, don't assume.)

**Phase 0 output:** findings doc with evidence → returns to conversation for review. Phase 1 scope is written *after* findings, not before.

## 5. Open decisions (flag in Phase 0 findings, decide before Phase 1)

- **Cart as pure projection vs. thin table:** if checkout infra is deeply coupled to `cart_items`, a thin compatibility layer (cart rows as materialized projection of `ready_for_checkout` items, single-writer) may be a cheaper Phase 1 than ripping it out. Phase 0 evidence decides. Either way, `cart_items` stops being an independent source of truth.
- **Snapshot-on-purchase:** at the moment of purchase, does the purchased item freeze (price/content snapshot, cf. clone-on-purchase in ready-mades) while the trip item lives on? Recommended: yes — mirrors the `ready_made_purchases` pattern.
- **Guest Trip retention/expiry policy** for abandoned session trips.

## 6. What NOT to do

- Do **not** copy items between planning, cart, and workstation. Routing = status transition on one row. Duplication is the failure mode this brief exists to prevent.
- Do **not** create a second query engine or parallel resolution path for cart contents — the projection is a filtered read of trip items.
- Do **not** let the expert workstation write purchase intent (`ready_for_checkout`) — traveler action only.
- Do **not** touch fee resolution. No fee literals; `fee_bands` resolver only; payment-intent amounts server-computed; Stripe idempotency keys on all charge operations; atomic `WHERE status='pending_payment'` on confirm.
- Do **not** merge `user_experiences` and `trips` — G1's link-don't-merge decision stands.
- Do **not** fork PlanCard or build a new trip renderer for any station view.
- Do **not** route mutate operations through `getTripRole` (known broken).
- Do **not** begin Phase 1 without explicit approval of Phase 0 findings. No direct-to-main commits. One lane, one branch, one agent.

---

*One Trip, many stations. Selections attach to the Trip; the expert workstation and the cart are consumers; routing is a status flip, never a copy; checkout is a server-computed read of the `ready_for_checkout` projection.*
