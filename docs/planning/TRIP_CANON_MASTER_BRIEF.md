# Trip-Canon Master Brief — all findings, one plan

**Date:** Jul 31, 2026 · **Status:** consolidated execution plan, built from five ratified/reviewed documents.
This brief SYNTHESIZES — it does not restate. Detail and receipts live in the sources; this document owns the
merged gap registry, the diagrams, and the lane plan. When this brief and a source disagree, flag it — do not
silently pick one.

| Source | Owns |
|---|---|
| `docs/E2E_ITEM_LIFECYCLE.md` | Current-state edge map (E1–E12, receipts), holes H1–H8, reconcile Phase 0 findings |
| `docs/planning/TRIP_GRAVITY_AUDIT_FINDINGS.md` | S1–S21 × L1–L7 matrix, transition ownership, ranked P0–P3 inventory |
| `docs/briefs/TRIP_ARTIFACT_RECONCILE_BRIEF.md` | The target model (Trip-as-Artifact) |
| `docs/briefs/RECONCILE_PHASE1_SCOPE.md` | W1–W7 work items, phases 1a–1d, out-of-scope lane names |
| `docs/briefs/ROUTING_STATE_CONTRACT.md` | Per-component WRITES/READS/NEVER contract, refund reversal edge |

---

## 1. The whole story in three sentences

The platform is two internally-sound worlds — commerce (cart→checkout→booking→escrow) and planning
(trip→itinerary→Trip Card) — whose bridges strip an item's commercial identity going in and provide no way
back. The ratified fix (Trip-as-Artifact) makes the **Trip the single canonical container from the first
selection**: routing to the expert or to checkout becomes a per-item status flip, and the cart becomes a
single-writer projection of `ready_for_checkout` items. Everything below is either that build (Lane 1), a
finding that dissolves under it, or an independent gap with its own small lane.

## 2. The one diagram — every hole, and the lane that closes it

```mermaid
flowchart LR
  subgraph TODAY["TODAY (broken edges dashed; Lx = the lane that fixes it)"]
    cartT["cart_items<br/>(dual meaning: 2 consumers say<br/>PURCHASE, 6 say SELECTION)"]
    tripT["trips + itinerary_items"]
    bookT["service_bookings + escrow ✓"]
    cardT["Trip Card"]
    expT["Expert workspace"]
    shareT["Share page"]

    cartT -.->|"H1 convert drops serviceId → L1"| tripT
    cartT -.->|"H5 apply-to-trip drops link → L1"| tripT
    bookT -.->|"H2 purchase never reaches plan → L1"| tripT
    cardT -.->|"H3 no route-to-checkout action → L1"| cartT
    expT -.->|"reads live CART as the plan → L1"| cartT
    cardT -->|"H4 CLOSED → L4 (already done pre-brief)"| shareT
    tripT -.->|"coordination_states.tripId<br/>never written → L2"| coordT["Coordination"]
    tripT -.->|"status='completed' has a reader,<br/>no writer → L3"| adminT["Admin dashboard"]
  end
```

```mermaid
flowchart LR
  subgraph TARGET["TARGET (Trip-as-Artifact — Lane 1 builds this)"]
    entry["Discover / Templates / AI"] --> trip2["THE TRIP<br/>items carry serviceId +<br/>routing_status + booking_id"]
    trip2 <-->|"status flip, never a copy"| exp2["Expert workstation<br/>(with_expert subset)"]
    trip2 -->|"ready_for_checkout"| proj2["CART = single-writer<br/>projection"]
    proj2 --> pay2["checkout → booking → escrow<br/>(rails unchanged)"]
    pay2 -->|"→purchased, atomic,<br/>booking_id stamped"| trip2
    pay2 -.->|"refund → in_planning<br/>(reversal edge, via booking_id)"| trip2
    trip2 --> card2["Trip Card = command center<br/>+ routing actions + receipts"]
  end
```

Item routing state machine and the full component contract: `ROUTING_STATE_CONTRACT.md` §1–2.

## 3. Unified gap registry — every finding, exactly one lane

| Finding | Source | Lane | Disposition |
|---|---|---|---|
| Cart selection-vs-purchase disagreement (9 consumers, 2 meanings) — **P0** | Audit §5 / Lifecycle Q1 | **L1** | Dissolved by routing_status + projection |
| H1 convert-to-itinerary drops `serviceId`, deletes cart row | Lifecycle | **L1** (W3) | Conversion becomes a status flip |
| H2 purchases never reach the plan | Lifecycle | **L1** (W4) | `→purchased` atomic with booking; assembler reads bookings |
| H3 Trip Card has no route-to-money action | Lifecycle | **L1** (W7) | Routing actions on PlanCard (extend, never fork) |
| H5 apply-to-trip drops `providerServiceId` | Lifecycle | **L1** (W5) | Preserve link on applied variants |
| H6 apply-to-cart silently skips externals | Lifecycle | **L1** (W5) | Surface the skip; behavior unchanged |
| Expert workspace reads the live cart (`booking-actions.ts:649`) | Audit P1 | **L1** (W6) | Read trip items `in_planning`+`with_expert` |
| Refund leaves item `purchased` (H2's mirror) | Contract §1 | **L1** (W4 amend) | Reversal edge, refund-path sole writer |
| **Item↔booking key missing** (reversal can't find its item) | This session's flag | **L1** (1a amend) | `booking_id` FK ships WITH `routing_status` in the same migration |
| `getTripRole` mutate exposure + owner-less trips — **P0** | Audit P0 / L10 | **L0 — DONE** | Advisor predicate unified (landed earlier); 3 owner-less minters fixed + proven (`83e275ad`); merge pending |
| Saved-trip conversion owner-less minter | Audit P2 | **L0 — DONE** | Same commit |
| `coordination_states.tripId` reader-without-writer | Audit P1 | **L2** | Create paths write tripId where a trip exists |
| `trips.status` dead lifecycle field with believing admin reader; L4→L5→L6 unowned | Audit P2/P3 | **L3** | Own brief: own the transitions OR derive-and-drop the field (decision-maker call) |
| H4 share page renders old `ItineraryCard` (§18 violation) | Lifecycle | **L4 — CLOSED, was already stale** | Ground-truthed Jul 31 2026 (`claude/lane4-share-tripplan`): server (`GET /api/itinerary-share/:token`) and OG injection (`/itinerary-view/:token`) were already on the TripPlan variant producer via `ed19b0eb` (Jul 29), and the client already renders through the PlanCard family since `32787272`/`22d3c2cb` — both predate this brief. `ItineraryCard` has zero JSX importers. Proven: anon share fetch carries zero of `bookings`/`booking`/`routingStatus`/`budget`; owner `/plancard` fetch of the same trip carries all of them. Receipt: `docs/E2E_ITEM_LIFECYCLE.md` H4. |
| Optimizer is cart-based (spec said tripId) — W2 behavior-identical constraint | Audit P1 / Scope §0 | **L5b** | Re-point optimizer to the Trip; retires the W2 merge gate. **Gated on a decision-maker brief** — deliberately NOT bundled with L5a |
| **🔴 P0 paid-optimization gate not enforced on the live path** — the ONLY payment/free-re-run verification for `POST /api/itinerary-comparisons` lived in the §9 mount-order-dead twin in `trips.routes.ts`, so the live inline copy in `routes.ts` fired the costly LLM run for any authenticated caller. `POST …/:id/generate` had no gate in **either** copy. | Lane 5 Phase-0 audit | **L5a — DONE** | **Harvested per §9**: gate ported into the live `routes.ts` copy (both create and regenerate), dead twin handler DELETED. Regenerate rule: 24h free re-run ‖ this comparison's own paid run inside that window ‖ a fresh PI passing the same verification (recorded by atomic conditional claim); else 402 |
| **P0 apply-to-trip destroys routed/purchased items** — `deleteItineraryItemsByTrip` wiped `with_expert`/`ready_for_checkout`/`purchased` rows, severing `booking_id` (self-inflicted H2) | Lane 5 Phase-0 audit | **L5a — DONE** | New `deleteInPlanningItineraryItemsByTrip`; existing method's semantics untouched; additive honest `preservedRoutedItems` in the response |
| **P1 H9 — `providerServiceId` never reaches variant items** (producer-side; made apply-to-cart insert 0 rows forever and E4/E5's "intact" verdicts wrong) | Lane 5 Phase-0 audit / Lifecycle correction | **L5a — DONE** | `originalServiceId` threaded to the insert, **validated against the catalog set offered to the model**; hallucinated ids stay NULL (§13). See `docs/E2E_ITEM_LIFECYCLE.md` Jul 31 correction |
| `trip_contexts` keyed by userId, not tripId | Audit P2 | **L6** | Re-key after L1 lands |
| H7 no add-card flow (save-on-payment already honest) | Lifecycle | **L7** | SetupIntent "Add card" on the profile card |
| H8 dead Travel-Preferences chips | Lifecycle | **L7** | Wire to state + save, or remove |
| No linkage/contract invariant exists (H1+H5 were written twice) | Lifecycle §3 | **LG** | Tier-0 gates: linkage-preservation guard + contract-role assertions (1b/1d ship the in-code half) |
| **NEW (Lane 2 discovery):** `concierge_requests.tripId` accepted from body at create with NO ownership verification — §14-class unverified linkage grant | Lane 2 report / PR #343 | **filed** | Small ownership check at concierge create; assign with the Lane 4/5 batch |
| Guest expiry unowned · L7 afterlife (rebooking, RM prompts) · repeat-pair rails rate (spec-ahead) · guest-invite trip linkage (#154) · no RM review object | Audit P3 | **deferred** | Documented inventory; pulled only explicitly |

Deliberate non-gaps (snapshot-at-money posture, notification freezing, claim-at-pay slots, provider
booking-scope): recorded in the audit §3 tail so they are never re-found.

## 4. The execution plan

```mermaid
flowchart TD
  M["MERGE current branch<br/>(L0 + all five docs)<br/>= the Phase-1 sequencing gate"] --> L1a
  subgraph L1["LANE 1 — Reconcile (Opus builds, Fable reviews money hunks)"]
    L1a["1a schema: routing_status + booking_id<br/>explicit ALTER, information_schema default-parity proof"]
    L1b["1b transitions + single-writer projection<br/>gate: optimizer behavior-identical, proven"]
    L1c["1c four leak fixes W3–W6<br/>gate: behavioral proof per fix"]
    L1d["1d Trip Card routing UI W7<br/>gate: Playwright + expert-denied negative test"]
    L1a --> L1b --> L1c --> L1d
  end
  M --> L2["LANE 2 — coordination tripId writer<br/>(Sonnet, small, parallel)"]
  M --> L7["LANE 7 — profile fixes H7+H8<br/>(Sonnet, small, parallel)"]
  M --> LG["LANE G — Tier-0 static guards<br/>(linkage + read-gate + idempotency)"]
  L1d --> L4["LANE 4 — share → TripPlan channel"]
  L1d --> L5a["LANE 5a — optimizer defects<br/>(pay gate · routed-item wipe · providerServiceId)"]
  L5a --> L5b["LANE 5b — optimizer re-point to Trip<br/>(retires W2 constraint) — decision-maker brief first"]
  L1d --> L6["LANE 6 — trip_contexts re-key"]
  L3["LANE 3 — trips.status lifecycle<br/>NEEDS ITS OWN BRIEF (decision-maker)"] -.->|independent, decision first| M
```

**Order and rationale:**

| # | Lane | Tier | Blocked by | Why this position |
|---|---|---|---|---|
| 0 | **Merge the branch** (PR) | human read | — | Satisfies the scope's "after L10 remediation merges" gate; carries all governing docs |
| 1 | **Reconcile 1a→1d** | Opus, Fable money-review | merge | The core build; absorbs 9 of 19 registry rows; each phase gated per scope §3 + contract §4 |
| 2 | Coordination tripId | Sonnet | merge only | Independent of routing state; unblocks coordinator↔Trip Card join |
| 7 | Profile H7+H8 | Sonnet | nothing | Fully independent; can start today |
| G | Tier-0 guards | Sonnet | merge only | The durable half: any itinerary-item write from a service-bearing source must carry the id; public reads must gate on approval; concurrent same-key checkout ⇒ one charge |
| 4 | Share renderer | Sonnet | L1d | **CLOSED Jul 31 2026, was already stale** — ground-truth found the channel migration (server producer + client PlanCard rendering) landed pre-brief via `ed19b0eb`/`32787272`/`22d3c2cb`; no code change needed, only this doc correction |
| 5a | Optimizer defects (pay gate · routed-item wipe · `providerServiceId`) | Opus, Fable money-review | L1d | Three live defects found by the L5 Phase-0 audit; independent of the re-point and shippable ahead of it (**LANDED** — `claude/lane5a-optimizer-defects`) |
| 5b | Optimizer re-point (cart → Trip) | Opus | L5a + **decision-maker brief** | Retires the W2 behavior-identical constraint; touches the paid path |
| 6 | trip_contexts re-key | Sonnet | L1 | Context follows a specific trip once the Trip is canonical |
| 3 | trips.status | — | **decision-maker brief** | Two honest options (own the L4–L6 transitions vs derive-and-drop the field); neither is mine to pick |

**Standing rules that bind every lane** (from the sources, not new): one lane one branch one agent; no
direct-to-main; contract's WRITES/READS/NEVER is enforced in code where cheap; undeclared = NEVER; no fee
literals / client-trusted amounts / `getTripRole` mutations; PlanCard extended, never forked; PR descriptions
carry the consumer-disposition table (1b) and touched-contract-rows list (all).

**Baseline correction for gate-runners:** tsc baseline is **209**, not the 254 written in the scope.

## 5. What the decision-maker still owns

1. **Approve this consolidated plan** (the lane order above).
2. **The booking_id amendment to 1a** — flagged per contract §3; recommended shape: additive nullable FK →
   `service_bookings`, `ON DELETE SET NULL`, indexed, written atomically with `→purchased`.
3. **Lane 3's shape** — needs its own short brief before any code: own the trip lifecycle transitions, or
   make the admin dashboard derive from dates and drop the dead field.
4. Anything pulled from the deferred inventory.
5. **Lane 5b's brief** — the optimizer cart→Trip re-point. L5a deliberately did NOT touch it; the
   contract's two Optimizer rows are 5b's decision, not 5a's.

Everything else is scoped, contracted, and sequenced.

## 6. Known naming drift (recorded, not silently "fixed")

`docs/briefs/ROUTING_STATE_CONTRACT.md` §"Consumer matrix" carries two rows keyed
`Optimizer (until lane 6)` / `Optimizer (after lane 6)`. **Those say "lane 6", but the optimizer re-point is
LANE 5** in this brief (row 5b above); lane 6 is the `trip_contexts` re-key, which has nothing to do with the
optimizer's cart reads. The drift is naming only — the WRITES/READS/NEVER semantics of both rows are correct
and binding as written.

Left uncorrected on purpose: those two rows ARE the optimizer re-point's contract, so amending them is a
**Lane 5b** action taken together with the re-point decision (contract amendments are decision-maker calls
per §18). Lane 5a therefore records the drift here instead of editing the contract. Read "lane 6" in the
optimizer rows as "Lane 5b" until 5b lands.
