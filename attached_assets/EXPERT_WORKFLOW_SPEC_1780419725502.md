# Traveloure — Expert Itinerary-Building Workflow

**Piece 2 of 4** (Expert itinerary-building services). **Type:** internal product spec, *reconcile + update* of `EXPERT_PROVIDER_LOGISTICS_INTEGRATION.md`.
**Source of truth:** code @ `main` `68d588e` (2026-06-02). Refs are `file:line`.
**Why this supersedes the old doc:** the prior logistics doc frames temporal anchors, day boundaries, and energy budgeting as *features to build*. They are **shipped** — tables, services, and endpoints all exist and run. This doc describes the workflow as wired today, and flags the one thing that is *not* wired: the expert's own surface (the Workspace) is blind to all of it.

---

## 0. The headline

There are **two parallel realities** in the itinerary-building flow, and they don't meet:

- **The constraint engine is real and good.** A genuine optimizer (`itinerary-optimizer.ts`, ~1,055 lines) generates ranked variants that respect immovable anchors, day boundaries, and energy budgets, scored on four axes, with template-specific presets for all seven experience types.
- **The expert never sees it.** That engine runs on the **traveler / AI-generation path**. The **Expert Workspace** (Piece 4) — the surface where the expert is supposed to *validate* the plan against real-world constraints — consumes **none** of it. Its only gap logic is a hardcoded "is there a dinner after 6pm" check. The person whose job is constraint-checking is working blind to the platform's constraint checker.

Everything below is the detail behind those two sentences.

---

## 1. The canonical build sequence

Matches the intended model, confirmed against code:

```
1. Traveler builds cart (activities)            → cart_items
2. AI optimizer sequences + scores               → itinerary-optimizer.generateOptimizedItineraries()
   (anchor-aware, boundary-aware, energy-aware; emits 2 ranked variants)
3. Expert reviews / modifies                     → Expert Workspace  ⚠ disconnected from step 2's engine
4. Transport legs calculated server-side         → activate-transport (post-finalization only)
5. Traveler views / customizes                   → PlanCard (Piece 3)
```

Transport is deliberately **post-optimization**: legs are computed only after activities are finalized (`/api/trips/:tripId/activate-transport`, `routes.ts:10765`), consistent with the "transport is post-optimization" principle.

---

## 2. The constraint engine (what's actually built)

### 2.1 Optimizer — `server/itinerary-optimizer.ts`
- **Entry:** `generateOptimizedItineraries()` (`:214`). Produces **2 optimized AI alternatives** per request.
- **Constraint loading:** reads `temporal_anchors` + `day_boundaries` for the trip up front (`:233`).
- **Anchor-aware prompting:** anchors are injected into the AI prompt as **immovable** blocks with buffer zones — *"You MUST NOT place activities during anchor times or their buffer zones"* (`:240`). Day boundaries are appended similarly (`:253`).
- **Experience-type-aware prompting:** prompt adapts to the experience type's group size, timing complexity (`high` → 30–45min buffers, `very_high` → 45+min), contingency level, and payment-flow type (`:168–208`).
- **Post-AI repair:** after generation, `applyAnchorConstraints()` runs per day (`:646`) and the result feeds `anchorNotes` + `energyNotes` into the variant's methodology summary (`:648–653`).
- **Scoring:** each variant gets `balance_score`, `wellness_score`, `pace_score`, `diversity_score`; `optimizationScore` = mean of balance/wellness/pace (`:328`). Plus a `methodology_summary` metric reporting how many sequencing rules were applied (`:875`).
- **Triggered from:** the comparison flow (`routes.ts:5766`, `:5969`), `ai/generate-itinerary` (`:8560`), and wrapped by `trip-optimization.service.ts`.

### 2.2 Smart sequencing — `server/services/smart-sequencing.service.ts`
`applyAnchorConstraints(activities, anchors, boundaries)` (`:1195`) is a **real repair pass**, not annotation:
- Derives day window from boundaries (`earliestActivityStart` → `latestActivityEnd`, defaults 8:00–22:00).
- Builds **blocked ranges** = anchor time ± `bufferBefore`/`bufferAfter`.
- **Pins** the anchor itself as a fixed item and re-flows the rest of the day's activities around the blocked ranges.
- Emits `MethodologyNote`s explaining each adjustment.

### 2.3 Temporal anchors — `temporal_anchors` (`shared/schema.ts:2793`)
Per-trip fixed commitments. Fields that matter: `anchorType`, `anchorDatetime`, `bufferBefore`/`bufferAfter` (minutes kept free), lat/lng + `radiusKm`, `mustReturnToHotel`, **`isImmovable`**, `dependsOnItemIds` (dependency graph).
- **Endpoints:** `GET`/`POST /api/trips/:tripId/anchors` (`routes.ts:13598/13617`); `POST /api/trips/:tripId/anchor-suggestions` (auto-suggest).
- **Impact propagation:** `POST /api/trips/:tripId/anchors/:anchorId/impacts` → `detectAnchorImpacts()` (`logistics-presets.service.ts:490`) returns conflicts with **severity** `warning | critical` when an anchor moves. This is the "vendor cancellation → cascade" mechanism from the old doc, and it's built.

### 2.4 Day boundaries — `day_boundaries` (`shared/schema.ts:2821`)
Per-day end-of-day constraints: `endLocation`, `mustReturnToHotel`, `latestActivityEnd`, `relocationRequired` + `transitDurationMinutes` + `earliestActivityStart` + `nextDayHotelLocation`. This is the "hotel relocation splits the day" logic — built and consumed by the sequencer (§2.2).

### 2.5 Energy budgeting — `energy_tracking` (`shared/schema.ts:2842`)
- **Endpoint:** `POST /api/trips/:tripId/calculate-energy` (`routes.ts:~13800`). Per day: `startingEnergy = 100`, depletion = Σ item `energyCost` (default **20/item**), `endingEnergy = max(0, 100 − depletion)`, `recoveryNeeded = endingEnergy < 20` with a recovery reason string. Persisted via `saveEnergyTracking` (`storage.ts:3195`).
- So burnout detection exists and is stored — but see §4: it's computed only when this endpoint is called, which the Workspace never does.

### 2.6 Template presets — `server/services/logistics-presets.service.ts`
Pre-built anchor + day-boundary presets for **all seven templates**: Wedding (ceremony as central immovable anchor), Proposal (secret anchor), Travel (flights as primary anchors), Birthday, Corporate, Date Night, Anniversary. `getPresetsForTemplate(slug)` (`:417`) returns them; `applyPresets` (`:464`) writes the boundaries. This means a new wedding trip starts with the ceremony-anchored timeline the old doc described as aspirational.

---

## 3. Where the expert *should* plug in (decisions baked in)

The expert enters between optimization (step 2) and delivery (step 5). Two recently-settled decisions define the edges of that slot:

- **Entry (DECIDED):** routing → **admin-confirm** → workspace. `lead-routing.service` proposes + logs; an admin reviews and manually confirms; confirmation writes the `trip_expert_advisors` row and opens the Workspace. So the expert receives an *admin-validated* assignment, not an auto-routed one. (Build target: the admin confirm action + the advisor-row write — not an auto-insert in routing.)
- **Economics (DECIDED):** the expert's fallback revenue share is **0.75** (75%, floor of the 75–85% range) for any expert without a configured service rate. The workflow's value proposition to experts rests on this number being the floor, not the 0.30 the code currently defaults to.

---

## 4. The disconnect — in detail (this is the work)

The engine in §2 is invoked on the **generation path**. The Expert Workspace (Piece 4) calls **none** of these:

| Capability (built) | Invoked by | Workspace uses it? |
|---|---|---|
| Optimizer variants + 4 scores | comparison flow, ai/generate-itinerary | ❌ |
| `applyAnchorConstraints` repair | optimizer (generation time) | ❌ |
| Anchor impact detection (warning/critical) | `/anchors/:id/impacts` | ❌ |
| Day-boundary enforcement | sequencer | ❌ |
| Energy / burnout calc | `/calculate-energy` | ❌ |
| Template presets | trip setup | ❌ |

What the Workspace *does* for "gaps": a single client-side heuristic — flag any day with items but no `dining`/`food` item after 18:00 (Piece 4, flag #4). No anchors, no energy, no boundaries, no optimizer score.

**Consequence:** an expert can deliver an itinerary that violates an immovable anchor, blows the energy budget, or ignores a hotel-relocation boundary, and the Workspace will show "All days have complete coverage." The platform *knows* better; it just doesn't tell the expert.

---

## 5. Recommended reconciliation (the actual scope for Piece 2 → build)

In dependency order:

1. **Compute constraints for expert-assigned trips.** Ensure anchors/boundaries/energy are populated when an assignment opens (presets on template, `calculate-energy` on entry). Cheap if the endpoints already exist.
2. **Surface them in the Workspace right panel.** Replace/augment the dinner heuristic with real signals: anchor conflicts (reuse `detectAnchorImpacts`, render `warning`/`critical`), day-boundary violations, per-day energy with `recoveryNeeded`. This retires Piece 4 flag #4 honestly.
3. **Show the optimizer's four scores** in the Workspace so the expert edits against the same metrics the AI optimized for, rather than a separate mental model.
4. **Run `applyAnchorConstraints` (or its impact-detection) on expert edits**, not just at generation — so an expert move that breaks an anchor is caught at edit time.

None of this is net-new engine work; it's wiring an existing engine into the one surface that ignores it.

---

## 6. Open / cross-doc dependencies

- **Workspace ↔ engine wiring** is the core of this doc and overlaps Piece 4 flags #3 (renderer divergence) and #4 (fake "AI Gaps"). Resolve together.
- **Commission floor (0.75)** decided here also governs Piece 1 (Offerings) and Piece 4 §5.6. Single source of truth.
- **Checkout vs. expert split** (flat 30% platform fee at checkout vs. 75% expert share) still needs one global reconciliation — flagged in the Lead Journey doc and Piece 4; not resolved by the 0.75 fallback decision, which only covers the *missing-rate* case.

---

*`file:line` refs against `68d588e`. `server/routes.ts` ~18.5k lines; `itinerary-optimizer.ts` ~1,055; re-verify offsets after any large refactor.*
