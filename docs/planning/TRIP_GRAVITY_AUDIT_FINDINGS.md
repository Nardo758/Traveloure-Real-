# Trip-Gravity Audit — Findings (Phase 0, read-only)

**Dispatch:** `docs/briefs/TRIP_GRAVITY_AUDIT_DISPATCH.md` · **Companion:** `docs/briefs/TRIP_ARTIFACT_RECONCILE_BRIEF.md`
(its Phase 0 findings live in `docs/E2E_ITEM_LIFECYCLE.md` §4–5 and are **cross-referenced here, not re-scoped**).
**Date:** Jul 31, 2026. Read-only — no code, schema, or seed changes were made. **HARD STOP:** findings return for
human triage; no Phase 1 exists until scoped from these findings and approved.

**Method note.** Cells marked with receipts from the item-lifecycle map (`E2E_ITEM_LIFECYCLE.md` §2) reuse that
evidence rather than repeating it; new evidence gathered for this audit is cited inline. Where the dispatch's own
description disagrees with code, code wins and the disagreement is recorded (per dispatch §8).

---

## 1. The matrix — S1–S21 × L1–L7

Legend: **CANON** canonical Trip · **COPY** parallel/snapshot data that can drift · **NONE** no relationship ·
**N/A** justified absence · `—` stage not applicable to surface. Cell evidence keyed per row.

| Surface | L1 created | L2 selecting | L3 routed | L4 purchased | L5 live | L6 done | L7 afterlife |
|---|---|---|---|---|---|---|---|
| S1 Discover/gems | CANON¹ | **COPY²** + CANON¹ | NONE | — | — | — | — |
| S2 Experience templates | NONE³ | **COPY³** | NONE | — | — | — | — |
| S3 AI generate | CANON⁴ | CANON⁴ (defect H5) | — | — | — | — | — |
| S4 AI optimizer (paid) | — | **COPY⁵** | COPY⁵ | — | — | — | — |
| S5 Cart / checkout | CANON⁶ (defective) | **COPY⁶** | **NONE⁶** | CANON⁶ (defect H2) | — | — | — |
| S6 Expert workspace | CANON⁷ | CANON⁷ | COPY⁷ (trip-level only) | — | CANON⁷ | NONE | CANON⁷ (ship-to-store) |
| S7 Expert request/matching | — | — | CANON⁸ | — | — | — | — |
| S8 Provider back-office | — | — | — | CANON⁹ (booking-scoped) | N/A⁹ | — | — |
| S9 Attribution | — | — | — | CANON¹⁰ (booking-scoped) | — | — | **NONE¹⁰** |
| S10 Concierge/coordination | — | — | — | CANON¹¹ (fee) | **COPY¹¹** | — | — |
| S11 PlanCard / Trip Card | — | — | NONE (H3) | **NONE¹² (H2)** | CANON¹² | NONE | — |
| S12 Ready-mades | CANON¹³ | CANON¹³ | — | CANON¹³ (snapshot, deliberate) | — | — | CANON¹³ |
| S13 Guest sessions | **NONE¹⁴** | COPY¹⁴ (guest cart) | — | — | — | — | **NONE¹⁴** (expiry) |
| S14 Notifications/email | — | — | — | N/A¹⁵ | N/A¹⁵ | — | — |
| S15 Reviews | — | — | — | — | — | CANON¹⁶ (via booking) | CANON¹⁶ |
| S16 Payments/payouts | — | — | — | CANON¹⁷ (booking-scoped) | — | — | — |
| S17 Admin | — | — | — | CANON¹⁸ | — | **CANON¹⁸ reads a state with NO writer** | — |
| S18 Collaborators/sharing | — | — | **NONE¹⁹** | — | COPY¹⁹ (H4 renderer) | — | NONE¹⁹ |
| S19 Saved trips (added) | CANON²⁰ (owner-less defect) | COPY²⁰ | — | — | — | — | — |
| S20 TripContext (added) | — | **COPY²¹** | — | — | — | — | — |
| S21 Logistics family (added) | — | CANON²² | — | — | CANON²² | — | — |

**Evidence per row:**
1. Quick-add dialogs write real trips/items (`add-to-experience-dialog.tsx:99+`, `curated-content-section.tsx`, `CityGrid.tsx` — `POST /api/trips` + itinerary items). CANON, though item linkage quality varies.
2. "Add to cart" writes `cart_items` — the reconcile brief's orphan-writer instance (E1).
3. `/experiences/:slug` flows write the cart with `experienceSlug` — no trip until conversion; the conversion is H1.
4. `generate-itinerary` wipes+inserts `itinerary_items` on a real trip (`routes.ts:~896`, P0-b-gated); `ai-itinerary-builder.tsx:292` creates the trip. Defect: the variant→trip apply drops linkage (H5).
5. **Spec-vs-code disagreement (recorded per dispatch §8): the dispatch says the optimizer "takes tripId" — it does not.** It reads the CART (`routes.ts:5298`) and writes variant copies (`itinerary_comparisons`/variant items); apply paths return to cart (E5) or lossily to trip (E7/H5).
6. Cart store = COPY (reconcile). L1: `convert-to-itinerary` creates trips (`routes.ts:5645`, defective — H1). L3: **no routing state exists** — the reconcile brief's core build. L4: checkout → `service_bookings.tripId` (`payments.routes.ts:283+`), but the purchase never lands on the itinerary (H2).
7. Workstation reads LIVE trip (`booking-actions.ts:645–648`), writes linked items (`service-picker-modal.tsx:95`), advances `workspaceStatus draft→delivered`; ready-made authoring builds ARE trips (`ready-made.routes.ts:86`). L3 is **trip-level** assignment status only — no per-item `with_expert` (reconcile scope). Defect: also reads the live CART (`booking-actions.ts:649` — Q1 pollution).
8. `expert_requests` carries `tripId`/`variantId`/`comparisonId` FKs + jsonb context — reference-based (reconcile Q6).
9. Provider sees `service_bookings` (booking-scoped; `tripId` nullable and often NULL). `bookingDetails` snapshot is the **ratified** snapshot posture, not drift. L5 N/A justified: providers fulfil bookings, not trips.
10. `service_bookings.acquisitionRef` → `short_links` (migration 139, `schema.ts:804`) — booking-scoped, works. **The dispatch's "repeat-pair rails rate" does not exist in code** — spec-ahead-of-code, recorded.
11. Coordination fee capture is CANON money (§7). But **`coordination_states.tripId` is a reader-without-writer**: a live GET reads by tripId (`routes.ts:7014` → `storage.ts:2519`) while neither known create path (concierge Phase 1a `routes.ts:6342`, template optimize) writes it. An engagement never links to the trip it coordinates.
12. TripPlan assembler is the canonical renderer (§18) and reads live trip data — but **never reads `service_bookings`** (H2: blind to purchases) and offers no routing action (H3). L5 mode-aware command center: landed.
13. Builds are trips (`userId NULL + authorId`); clone-on-purchase spread-copies all columns (`ready-made-purchase.service.ts:88`); L7 ship-to-store is the expert-side afterlife conversion — **owned**. Traveler-side conversion: N/A (deliberate seller-side feature).
14. Guest cart machinery exists (`storage.ts:1886, 280` `migrateGuestCart`) but **a guest cannot have a Trip** (G2 reshape target), and **nothing expires abandoned guest rows** — unowned.
15. Notifications carry `relatedId`/`relatedType` references + frozen `title`/`message`/`data` (`schema.ts` notifications). Frozen content is the *nature* of a notification — N/A justified, with the note that deep links resolve by reference (fresh).
16. Reviews are booking-gated (`bookingId` NOT NULL FK) → trip lineage via `booking.tripId`. Honest-aggregates regime (§13) holds.
17. Escrow/payout rails attach to bookings, not trips — justified; trip lineage via `booking.tripId` where set. Money overlay: see §4.
18. Admin reads trips canonically — **including counting `status === "completed"` (`admin.routes.ts:4088`) — a value NOTHING in the codebase ever writes.** The completed-trips stat is structurally zero forever.
19. Share: the share API renders from the canonical TripPlan producer (`trips.routes.ts:2321`), but the **client** share page renders the old `ItineraryCard` (H4 — parallel renderer, COPY-class). Collaborators: **no code path ever writes an `expert`/`friend` collaborator row** (L10, schema-only 3-tier) — ownerless. Guest invites (`event_invites`) carry **no trip linkage** (grep: none) — task #154 pending.
20. Saved-trip conversion creates trips via raw SQL (`booking.service.ts:994`) — one of the L10 **owner-less minters**.
21. `trip_contexts` (migration 130) mirrors planning context **keyed by userId, not tripId** — a parallel planning state that cannot be reconciled to a specific trip. COPY by construction.
22. `transport_legs` (trip-scoped, migration 154), anchors, day-boundaries, per-item `expert_note` (migration 152) — all trip-FK'd. CANON.

---

## 2. Transition-ownership table

| Boundary | Owner | Status |
|---|---|---|
| →L1 created | 7 paths (convert, quick-start, AI builder, saved-conversion, checkout auto-trip, RM clone, workstation) | OWNED — but **2 are raw-SQL owner-less minters** (`booking.service.ts:94, 994` — L10 overlap) |
| L1→L2 selecting | item writers (E1, E11, quick-adds) | OWNED |
| L2→L3 routed (per item) | **NOBODY** — no per-item routing state exists | **UNOWNED** — the reconcile brief's core build |
| L3 expert-return (trip-level) | `workspaceStatus` advance + Suggest/approve flow (booking-actions) | OWNED (trip-level only) |
| L3→L4 purchased | `/api/checkout` (cart-based, not item-based) | OWNED (shape changes under reconcile) |
| L4→L5 live | **NOBODY** — `trips.status` is never advanced; "live" is date-derived in renderers | **UNOWNED** (low harm: derivation works) |
| L5→L6 completed | **NOBODY** — zero writers of `status='completed'`; admin dashboard reads it (`admin.routes.ts:4088`) | **UNOWNED — reader-without-writer, proven** |
| L6→L7 reviews | booking `confirm-completion` → review gate | OWNED (booking-scoped) |
| L7 ship-to-store | Workstation → ready-made listing (expert only) | OWNED |
| L7 rebooking / traveler afterlife | — | **UNOWNED / NONE** |
| guest-trip expiry | — | **UNOWNED** (no TTL anywhere on guest rows) |

---

## 3. Ranked gap inventory

Format: `[Px] [class] [surface×stage] — description — evidence — blast radius`.

**P0 — money & trust**
- **[P0] [D] [S5×L4]** Cart selection-vs-purchase disagreement: checkout buys rows six other consumers treat as "under consideration" — `E2E_ITEM_LIFECYCLE.md` §5 Q1 (9-consumer inventory) — a traveler charged for items they were only considering; the expert-handoff container IS the purchase container. *Cross-ref: reconcile lane; do not re-scope here.*
- **[P0] [A/auth] [S11×L2]** Mutates routed through `getTripRole`: per-item PATCH/DELETE + transport-leg `/status` sit on model-A gates while `isExpertAssignedToTrip` is status-blind (rejected advisor passes) and the trip owner gets no role — §13 L10, `utils/trip-role.ts`, `storage.ts:4610` — under-grant 403s owners; over-grant admits rejected advisors to mutations. *Cross-ref: L10 remediation lane (Fable-designed); flagged per dispatch §5, not re-scoped.*

**P1 — active-flow integrity**
- **[P1] [A] [S5×L2]** H1 `convert-to-itinerary` drops `serviceId` + deletes the cart row — `routes.ts:5645–5712` — items become permanently unbuyable. *Reconcile scope.*
- **[P1] [B] [S11×L4]** H2 purchases never reach the plan; assembler never reads `service_bookings` — `payments.routes.ts` (no write), `trip-plan.service.ts` (no read) — traveler pays, Trip Card unchanged. *Reconcile scope.*
- **[P1] [C] [S5×L3]** No per-item routing state (`in_planning/with_expert/ready_for_checkout`) — nothing owns L2→L3 — partial routing impossible; the brief's raison d'être. *Reconcile scope.*
- **[P1] [A] [S3/S4×L2]** H5 `apply-to-trip` drops `providerServiceId` — `plancard.routes.ts` — AI-applied plans lose commerce. *Reconcile scope.*
- **[P1] [C] [S10×L5]** `coordination_states.tripId` reader-without-writer — reader `routes.ts:7014`, no writer at `routes.ts:6342` — a paid coordination engagement cannot be found from its trip; the coordinator workspace and Trip Card can never join.
- **[P1] [B] [S6×L2]** Expert workspace reads the traveler's live CART (`booking-actions.ts:649`) — expert sees the purchase container as "the plan" — the pollution instance, live.
- **[P1] [D] [S4×—]** Spec-vs-code: optimizer is cart-based, not tripId-based (dispatch §2 S4 is wrong about the code) — `routes.ts:5298` — any plan built on "optimizer takes tripId" mis-scopes.

**P2 — drift risk**
- **[P2] [B] [S18×L5]** H4 share page renders parallel `ItineraryCard`, not TripPlan — `itinerary-view.tsx:15` — share drifts from canonical rendering (§18 violation).
- **[P2] [B] [S20×L2]** `trip_contexts` keyed by userId not tripId — migration 130 — context cannot follow a specific trip; two concurrent plans share one context.
- **[P2] [D] [S17×L6]** `trips.status` vocabulary disagreement: admin treats it as a lifecycle (counts `completed`); nothing else writes past creation defaults; renderers ignore it and derive from dates — `admin.routes.ts:4088` — dashboard stats structurally wrong; any future reader of `status` inherits a dead field.
- **[P2] [A] [S19×L1]** Saved-trip conversion raw-SQL owner-less minter — `booking.service.ts:994` — L10 overlap (converted trip's owner 403s on model-A gates).
- **[P2] [B] [S5×L2]** H6 `apply-to-cart` silently skips non-service variant items — `routes.ts:6154` `if (item.providerServiceId)` — externals vanish from an applied plan with no message.

**P3 — afterlife & deferred (document, do not fix)**
- **[P3] [C] [—×L6]** Trip completion unowned — no writer of `completed` — afterlife features (reviews-of-trip, rebooking, convert-to-ready-made prompts) have no trigger to hang off.
- **[P3] [C] [S13×L7]** Guest cart/trip expiry unowned — abandoned guest rows accumulate forever.
- **[P3] [—] [S9×L7]** "Repeat-pair rails rate" not built — dispatch references a mechanism absent from code — spec-ahead-of-code.
- **[P3] [—] [S18×L2]** Guest invites (`event_invites`) carry no trip linkage — task #154 (deliberately pending).
- **[P3] [—] [S15×L7]** No trip-level or ready-made review object (service reviews only) — fine today; blocks RM social proof later.

**Deliberate non-gaps (recorded so they aren't re-found):** `bookingDetails`/RM-clone/insideCounts snapshots
(ratified snapshot-at-money posture); notifications' frozen content (nature of the artifact); provider L5 absence
(providers fulfil bookings); slot claim only at checkout (no hold state — consistent, no held-vs-confirmed
disagreement found: `vendor_availability_slots.status` default `available`, claimed atomically at pay).

---

## 4. Money-path overlay (S5, S8, S9, S10, S12, S16)

Walked against the standing non-negotiables. **No NEW P0 violations found.** Receipts: fee literals — grep-gated,
`fee_bands` single resolver holds (§8); amounts server-computed (§14 across checkout/coordination/optimize/RM);
born-approved closed (F2/D1a, RM `submitted`); Stripe idempotency + atomic claims (§15 — checkout unique index now
DECLARED in schema, coordination `coord-fee-<id>`, payout claim, RM/template confirm transitions); NULL-userId —
overlap flagged at the two raw-SQL trip minters (cross-ref, not duplicated); `getTripRole` mutate exposure — the
one standing violation, listed as P0 above by cross-reference to the L10 lane.

## 5. Assumption inventory for shared rows (platform-wide extension)

| Shared rows | Consumer A assumes | Consumer B assumes | Verdict |
|---|---|---|---|
| `cart_items` | checkout/apply-to-cart: purchase list | 6 consumers incl. expert workspace: plan under consideration | **Class-D, P0** (reconcile Q1, 9 consumers) |
| `trips.status` | admin dashboard: full lifecycle incl. `completed` | creators: write-once at birth; renderers: ignore, derive from dates | **Class-D, P2** — dead field with a believing reader |
| `service_bookings.tripId` | checkout: "trip this purchase belongs to" (sometimes set) | TripPlan assembler: never read; provider: ignored | **Class-D enabler of H2** — the join key exists, nothing joins |
| `coordination_states.tripId` | GET-by-trip reader: real linkage | creators: never written | reader-without-writer (P1) |
| `vendor_availability_slots.status` | all consumers: claimed-at-pay | — no second meaning found | consistent ✓ |

## 6. Surfaces added during audit

S19 Saved trips/wishlist · S20 TripContext (client planning context + `trip_contexts` mirror) · S21 Logistics
family (transport_legs / anchors / day-boundaries / expert notes). All three were trip-adjacent and absent from
the dispatch's S-list.

---

**HARD STOP.** Findings returned for triage. Recommended reading order for triage: §3 P0s (both cross-refs to
already-scoped lanes), then the three findings unique to this audit — `coordination_states.tripId`
(reader-without-writer), `trips.status` (dead lifecycle field with a believing admin reader), and the L5/L6
unowned transitions — since those are the ones no existing lane covers.
