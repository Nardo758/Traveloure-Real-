# Routing-State Contract — Addendum to RECONCILE_PHASE1_SCOPE.md

**Purpose:** declare every independent component's relationship to `routing_status` at the field's birth, so it never becomes another `trips.status` — a state with believing readers and no contract. Lesson source: Trip-Gravity Audit §5 (class-D disagreements on `cart_items` and `trips.status` both trace to states introduced without a declared read/write contract).

**Rule:** a component's relationship to each state is exactly one of **WRITES** (may cause the transition), **READS** (must respect the state), or **NEVER** (must not touch or interpret it). Anything undeclared is NEVER. Adding a writer later requires amending this contract — not just shipping code.

---

## 1. The state machine (restated, with the backward edge added)

```
in_planning ──► with_expert ──► in_planning        (expert return)
     │
     └────────► ready_for_checkout ──► purchased
                        │                  │
                        ▼                  ▼
                  in_planning        in_planning    (refund/cancel reversal — NEW)
```

**Amendment to Phase 1 scope (W1):** the `purchased → in_planning` reversal edge is added to scope. Written **only** by the refund/cancellation path, atomically with the refund transaction (same discipline as the forward edge in W4). Without it, the Trip Card shows purchases the traveler was refunded for — H2's mirror image.

## 2. The contract matrix

| Component | in_planning | with_expert | ready_for_checkout | purchased | Notes |
|---|---|---|---|---|---|
| Traveler UI (W7 Trip Card) | WRITES | WRITES | WRITES | READS | Sole writer of `ready_for_checkout` — purchase intent is traveler-only |
| Expert workspace | READS | WRITES (return→planning only) | **NEVER** | READS | Reads `in_planning`+`with_expert` as "the plan" (W6); may add new items (born `in_planning`); return flips items back; never sets purchase intent |
| Checkout / payments | — | — | READS (consumes) | WRITES (forward) | Sole writer of forward `→purchased`, atomic with booking write (W4) |
| Refund / cancellation path | WRITES (reversal target) | — | — | WRITES (reversal source) | Sole writer of `purchased→in_planning`, atomic with refund |
| Projection sync (W2) | READS | READS | READS | READS | Reads all states to maintain `cart_items`; writes NO routing status ever — cart rows only |
| Optimizer (until lane 6) | — | — | READS (via projection) | — | Sees only the projected cart; behavior-identical merge gate holds |
| Optimizer (after lane 6) | READS | READS | READS | READS | Re-point lane inherits this row as its read contract |
| Ready-made clone-on-purchase | WRITES (birth override) | **NEVER** | **NEVER** | **NEVER** | Cloned items born `in_planning` — explicit override in clone path; spread-copy must NOT carry author-side status. Buying a ready-made buys the plan, not the services; born-purchased = born-approved violation |
| Ready-made authoring (expert builds) | WRITES (default at creation) | **NEVER** | **NEVER** | **NEVER** | Authored items are catalog content; routing is a buyer-side concept |
| Guest cart migration | WRITES (all migrated items) | **NEVER** | **NEVER** | **NEVER** | Migrated items land `in_planning` — a pre-split cart carried Q1 ambiguity; do not import it as purchase intent. User re-routes after signup |
| Logistics family (transport_legs, anchors, day-boundaries, expert notes) | — | — | **NEVER** | **NEVER** | **Non-routable trip furniture.** No routing_status semantics apply; W7 UI offers no routing actions on them. Declared so nobody "fixes" H6 by making them routable |
| Provider back-office | **NEVER** | **NEVER** | **NEVER** | **NEVER** | Booking-scoped by ratified posture (audit S8). Providers fulfil bookings; routing is traveler-plan state |
| Coordination (concierge) | READS | READS | — | READS | Post-lane-3: coordinator workspace joins via tripId and reads plan state; writes none in Phase 1. Any future coordinator-routing capability amends this contract first |
| Notifications | READS (transition-triggered) | READS | — | READS | **Named future emit point:** `→with_expert` transition is the hook for the expert PULL→PUSH lane. Notification lane subscribes to transitions, never polls status |
| Admin | READS | READS | READS | READS | Read-only observability. Admin never force-writes routing status; corrections go through the owning path |
| Reviews | — | — | — | READS (via booking) | Booking-gated regime unchanged; `purchased` is corroborating, not gating |
| Share / collaborators | READS | READS | READS | READS | Render-only; share surfaces never expose routing actions to non-owners |

## 3. Decisions this contract locks (flag any disagreement before Phase 1a merges)

1. **RM-cloned items born `in_planning`** with an explicit override in `ready-made-purchase.service.ts` clone path — the spread-copy at :88 must exclude/override `routing_status`.
2. **Refund reversal edge is in Phase 1 scope** (amends W1/W4) — refund path is its sole writer.
3. **Guest-migrated items land `in_planning`**, not `ready_for_checkout`.
4. **Logistics items are non-routable** — permanently, unless a future brief amends this contract.
5. **`→with_expert` is the notification emit point** — reserved now, wired by the notification lane later.
6. **Undeclared = NEVER**, and new writers require a contract amendment, not just a PR.

## 4. Enforcement

- This table ships as a doc **and** as assertions where cheap: transition endpoints validate caller role against the WRITES column (traveler-only on `ready_for_checkout` is enforced in code, not convention).
- Phase 1 gate addition (amends scope §3): each phase's PR description states which contract rows it touched; the Playwright pass in 1d includes a negative test — expert attempting `ready_for_checkout` is rejected.
- Contract violations found later get filed as class-D findings against this doc, same as the audit would.

---

*One sentence: every component's relationship to the new state is declared at the state's birth — writers are singular per edge, undeclared means never, and the two graveyards this prevents are already in the audit record.*
