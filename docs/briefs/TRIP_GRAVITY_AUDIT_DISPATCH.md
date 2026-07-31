# Trip-Gravity Audit — Dispatch (platform-wide gap map)

**Status:** Phase 0 read-only audit. **No writes of any kind** — no schema changes, no code changes, no build branches. Output is a findings document that returns to conversation for triage before anything is approved.
**Companion doc:** `TRIP_ARTIFACT_RECONCILE_BRIEF.md` (the planning/cart/expert slice of this same principle). This dispatch generalizes it to the whole platform. Do not start the reconcile build as part of this audit.

---

## 0. The organizing principle

Traveloure is a logistics-and-marketplace platform. Its center of gravity is the **Trip** — the canonical work-in-progress artifact (G1, confirmed) that selections attach to, stations operate on, and money flows against.

**The audit rule that follows:** every surface on the platform must have a defined relationship to the canonical Trip. It either **reads** it, **writes** to it, or **transitions its state**. A surface that does none of those — or does them against a parallel copy — is by definition a gap. This audit does not hunt for bugs; it enumerates relationships and lets the holes fall out mechanically.

**Validation that the method works:** G1–G8 from `UNIFIED_PLANNING_FLOW_SPEC_v2.md` were all instances of the four gap classes below, found ad hoc by staring at one flow. This audit runs the same detection systematically across every flow.

---

## 1. The lifecycle spine

The Trip's full life, birth to afterlife. Every column of the matrix:

```
L1 created          — trip row comes into existence (any entry point, incl. guest)
L2 selecting        — items attach (Discover, template, AI generate, expert adds)
L3 routed           — per-item: with_expert | ready_for_checkout (reconcile brief §2)
L4 purchased        — money moves; snapshot semantics apply
L5 live             — trip in progress; PlanCard is the control center
L6 completed        — trip ends
L7 afterlife        — reviews, rebooking, convert-to-ready-made (Phase 4 candidate),
                      provider repeat-pair rails-rate attribution
```

For each stage, the audit must also answer: **who owns the transition into it?** A lifecycle stage with no code path that moves trips into or out of it is an ownerless transition (gap class C).

## 2. The surface inventory

Rows of the matrix. Audit each against every lifecycle stage. If the codebase contains a trip-adjacent surface not listed here, **add it — do not skip it**; flag additions in findings.

| # | Surface | Notes |
|---|---|---|
| S1 | Discover feed / gems | "Add to plan" path (G5) |
| S2 | Experience templates | six templates, selection controls |
| S3 | AI trip planner (generate) | free draft |
| S4 | AI optimizer (paid) | takes tripId |
| S5 | Cart / checkout | per reconcile brief: projection, not store |
| S6 | Expert workspace | incl. dual-mode ready-made authoring |
| S7 | Expert request / matching | `expert_request` payload |
| S8 | Provider back-office | bookings, availability jsonb, attributed links |
| S9 | Provider attribution | `acquired_via_provider_id`, repeat-pair rails rate |
| S10 | Concierge (AI / expert / full) | per-task fees |
| S11 | PlanCard | canonical renderer, all four output surfaces |
| S12 | Ready-mades ("Trips by Locals") | clone-on-purchase, `ready_made_purchases` |
| S13 | Guest sessions | session trip / migrate-on-signup (G2 reshape) |
| S14 | Notifications / email | incl. expert PULL→PUSH lane |
| S15 | Reviews & ratings | post-experience |
| S16 | Payments / payouts | Stripe Connect, fee_bands, admin-initiated payouts |
| S17 | Admin surfaces | approval lifecycles, fee config |
| S18 | Collaborators / sharing | share kits, attributed deep links |

## 3. The matrix — one question per cell

For each (surface × lifecycle stage) cell, answer:

> **Does this surface touch the canonical Trip, a copy, or nothing?**

Record the cell as exactly one of:

- **`CANON`** — reads/writes/transitions the canonical Trip (cite file:line of the query/mutation).
- **`COPY`** — operates on a snapshot, duplicate, or parallel table that can drift from canonical (cite the copy's table/field and the point of divergence).
- **`NONE`** — no relationship exists.
- **`N/A`** — no relationship *should* exist (justify in one line; unjustified N/A is treated as NONE).

Every `CANON` claim requires file:line evidence. Grep alone is insufficient — where a claim is behavioral ("the optimizer reads live trip data"), cite the actual query path, not the presence of a string. "Compiles" and "renders" are not evidence.

## 4. Gap classification — the four species

Every non-CANON finding gets classified:

**A. Orphan writers** — surfaces creating trip-shaped data outside the Trip.
*Known instances:* `user_experiences` pre-G1; the current cart. *Hunt for:* provider bookings, concierge tasks, guest artifacts, expert drafts that exist with no `tripId` lineage.

**B. Orphan readers** — surfaces reading a copy/snapshot that can drift.
*Hunt for:* expert workstation snapshots, email/notification payloads with frozen trip content, PlanCard derivations reading anything other than the canonical source artifact, checkout reading non-canonical line items.

**C. Ownerless transitions** — lifecycle stages nothing moves trips into/out of.
*Hunt for:* who flips L5→L6 (completed)? Who owns "expert returned it" (L3→L2)? Who triggers L7 conversion to ready-made? Who expires abandoned guest trips? An unowned transition means artifacts silently accumulate in a stage forever.

**D. Semantic disagreements** — two consumers reading the same rows under different assumed meanings.
*Known instance:* selection-vs-purchase on `cart_items` (reconcile brief §0). *Hunt for:* draft-vs-published on expert content, held-vs-confirmed on availability jsonb, platform-sourced vs. provider-sourced on bookings (commission band vs. rails rate — this one is a **money-path** disagreement if found).

## 5. Money-path overlay (mandatory second pass)

After the matrix, re-walk every cell that touches money (S5, S8, S9, S10, S12, S16 at minimum) and verify against the standing non-negotiables. Any violation found is automatically **P0** in triage regardless of gap class:

- No fee literals anywhere; `fee_bands` single resolver, no parallel resolution paths.
- Payment-intent amounts server-computed; no client-trusted fee amounts or userId.
- Approval lifecycle draft→submitted→approved; nothing born-approved.
- Stripe idempotency keys on all charge/transfer operations.
- Atomic `WHERE status='pending_payment'` on confirm (TOCTOU).
- NULL-userId consumer exposure on any trip/money query (overlaps the outstanding sweep — flag overlaps, do not duplicate that lane's work).
- No mutate operations routed through `getTripRole` (known broken).

## 6. Triage rubric — the output is an inventory, not a to-do list

**Expect more gaps than should be fixed.** The deliverable is a *ranked* inventory. Rank every finding:

- **P0 — money & trust:** money-path violations, auth gaps on trip mutations (incl. unmounted-router class — verify mounting, don't assume), semantic disagreements where the two meanings imply different charge amounts.
- **P1 — active-flow integrity:** gaps in L1–L4 on flows shipping now (planning, expert handoff, checkout, provider bookings). Includes reconcile-brief scope — cross-reference, don't re-scope.
- **P2 — drift risk:** COPY cells on live surfaces not yet causing user-visible harm but structurally guaranteed to (snapshots without refresh semantics, dual defaults on push-managed status columns).
- **P3 — afterlife & deferred:** L6–L7 gaps, guest-trip expiry, Phase-4-candidate blockers. **Document, do not fix.** These sit in the inventory until explicitly pulled.

Per finding: `[Px] [class A–D] [surface × stage] — one-line description — file:line evidence — one-line blast radius (what breaks or drifts if left alone)`.

## 7. Deliverables

1. **The matrix** — S1–S18 (+ additions) × L1–L7, every cell filled with CANON/COPY/NONE/N/A + evidence.
2. **Transition-ownership table** — for each L-boundary: owning code path (file:line) or "UNOWNED."
3. **Ranked gap inventory** — per §6 format, sorted P0→P3.
4. **Assumption inventory for shared rows** — everywhere two consumers read the same table, what each assumes the rows mean (extends reconcile brief §0 platform-wide).
5. **Surfaces added** to the S-list during the audit, if any.

Findings return to conversation for human triage. **Hard stop.** No Phase 1 exists until it is scoped *from* these findings and explicitly approved.

## 8. What NOT to do

- Do **not** write any code, schema, migration, or seed during this audit. Read-only means read-only.
- Do **not** fix anything you find, however small or "obvious." Findings go in the inventory.
- Do **not** start the `TRIP_ARTIFACT_RECONCILE_BRIEF` build — that lane is scoped separately and gated on its own Phase 0.
- Do **not** duplicate the NULL-userId sweep or the gate-integrity audit — flag overlaps by reference.
- Do **not** report a cell as CANON from grep alone; behavioral evidence (the actual query/mutation path) is required.
- Do **not** trust spec documents over code where they disagree — code is ground truth; record the disagreement as a finding.
- Do **not** collapse P3 items into P1 scope to make the inventory look actionable. Deferred means deferred.
- Do **not** exceed one agent, one branch (for the findings doc only, if committed to `docs/planning/`). No direct-to-main.

---

*One artifact, one rule: every surface reads it, writes it, or transitions it — anything else is a gap. Enumerate the relationships; the holes fall out. Rank them; fix only what the rank says.*
