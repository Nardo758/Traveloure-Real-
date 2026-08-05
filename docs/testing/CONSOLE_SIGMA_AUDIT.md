# CONSOLE_SIGMA_AUDIT — Expert Console Sigma Test Lane · Phase 0

**Lane:** `console-sigma-test` · **Branch:** `lane/console-sigma-test`
**Audited commit (ground truth):** `5941a4ff3096b0cf9030342a0a9bc35970e99152` (main, 2026-08-04)
**Spec baseline being re-verified:** EXPERT_WORKSPACE_SPEC / EXPERT_WORKFLOW_SPEC @ `68d588e` (2026-06-02)
**Mode:** read-only. No DB writes, no code changes, no state-mutating test executions. DEV DB reads only; production DB untouched.
**Method note:** findings below were gathered by static code tracing (read-only searches) plus read-only SQL on the DEV database. No live requests were executed against any endpoint.

**Headline:** the spec is materially stale. Of the six flagged defects pinned at `68d588e`, **four are fixed** (dead `saveMutation`, 5-stage UI, lead→workspace bridge, engine disconnect incl. "AI Gaps") and the commission fallback now resolves expert-favorably from `fee_bands` with a 0.75 safety net. The two genuine as-is baseline gaps that remain: **no transition logging on `workspaceStatus`** (ABSENCE) and **client-computed `next` status** (STATE_DIVERGENCE risk, benign while the machine is linear). Per the HARD STOP rule, the surprising findings are collected in §8 as questions for Leon before Phase 1.

---

## 0.1 Ground truth re-pin

- `main` SHA at audit time: **`5941a4ff`**. All `file:line` refs below are against this SHA.
- Spec line numbers from `68d588e` are confirmed stale: the workspace endpoints have moved out of the `routes.ts:17xxx` region — most now live in **`server/routes/booking-actions.ts`**; itinerary items in `server/routes.ts:8706/8784`. Full relocation table in §0.4.

## 0.2 Status machine (code, not spec)

| Item | Finding | Evidence |
|---|---|---|
| `validTransitions` map | `{ draft: ["in_review"], in_review: ["delivered"], delivered: [] }` — unchanged, linear, forward-only | `server/routes/booking-actions.ts:1119-1123` |
| Enforcement | Server-side in `PATCH /api/expert/assignments/:assignmentId/workspace-status`; rejects transitions not in the allowed set; a current-status guard in `storage.updateExpertAssignmentWorkspaceStatus` protects against races | `server/routes/booking-actions.ts:1114-1138` |
| Client `next` computation | **Client still computes `next` itself**: `const next = current === "draft" ? "in_review" : "delivered"` and sends it in the PATCH body. Server validates but does not dictate. Benign today (linear machine); becomes STATE_DIVERGENCE the moment a branch is added. | `client/src/pages/expert/workspace.tsx:2695-2708` (computation at `:2699`) |
| 5-stage UI vs 3-state server (flag #6) | **FIXED.** `STEPS` array is now exactly `draft / in_review / delivered`; stage pill renders from `STEPS` via `findIndex` (breadcrumb `StateChip`s). No `notes`/`pending` phantom stages, no "of 5" counter. | `client/src/pages/expert/workspace.tsx:222-226`, `:4009-4020` |
| Transition logging | **NONE (recorded absence).** The status PATCH handler writes the status and fires a trip-owner notification (`booking-actions.ts:1144-1153`) — no `item_transition_log` row, no audit insert, same-transaction or otherwise. `item_transition_log` is used only for per-item `routing_status` (lead routing; `server/routes/plancard.routes.ts`). Searched scope: `rg "item_transition_log" server/`, full read of the PATCH handler `booking-actions.ts:1114-1211`, `server/services/booking-actions.service.ts`, patterns `logItemTransition` / insert calls within handler scope. | — |
| Dead `saveMutation` (flag #2) | **FIXED (removed).** No PATCH to the status endpoint with an empty body exists in `workspace.tsx`. Notes now auto-save via `autoSaveNotesMutation` (`workspace.tsx:2715`); status changes only via `advanceStatusMutation`. | `client/src/pages/expert/workspace.tsx` (searched whole file for the status endpoint + empty-body PATCH) |

## 0.3 Assignment bridge (`expert_requests` → `trip_expert_advisors`)

**Flag #1 is FIXED — the admin-confirm bridge is BUILT**, in the exact shape the 2026-06-02 decision specified (admin review → manual confirm → advisor row):

- `confirmLeadAssignmentHandler` — `server/routes/admin.routes.ts:5655-5712`. Selects the `expert_requests` row (`:5662`), and **in one transaction** inserts the `trip_expert_advisors` row (`:5684`) and updates `expert_requests.status` to `assigned` (`:5705`).
- Triggered by `POST /api/admin/routing-queue/:requestId/confirm` (`admin.routes.ts:5726`; also mounted as `/api/admin/leads/:expertRequestId/confirm`).
- Other insert sites into `trip_expert_advisors`: `server/storage.ts:4815` (`createTripExpertAdvisor` helper), `server/routes.ts:4637` (`handleOwnerBookingStatus` — expert accepting a booking via `PATCH /api/expert/bookings/:id/status`), `server/services/admin-query.service.ts:807` (shared admin service logic).

**Baseline entry condition:** the harness journey CAN start at the routed lead (`expert_requests` → admin confirm → advisor row) — manual seeding of `trip_expert_advisors` is no longer the only entry. The confirm step requires an admin session.

## 0.4 Feature-endpoint inventory

| # | Endpoint | Current handler | Auth guard | Assignment scoping |
|---|---|---|---|---|
| 1 | GET `/api/expert/assigned-trips` | `server/routes/experts.routes.ts:606` (dup mount `booking-actions.ts:696`) | `isAuthenticated` | scoped to caller via `getExpertAssignedTrips(userId)` (`storage.ts:4795`) |
| 2 | GET `/api/trips/:tripId/my-assignment` | `server/routes/booking-actions.ts:1488` | `isAuthenticated` | `getTripExpertAdvisoryAssignment(tripId, userId)`; 404 if no assignment row |
| 3 | GET `/api/trips/:tripId/itinerary-items` | `server/routes.ts:8706` | `isAuthenticated` | ownership OR `isExpertAssignedToTrip(tripId, userId)`; 403 otherwise |
| 4 | POST `/api/trips/:tripId/itinerary-items` | `server/routes.ts:8784` | `isAuthenticated` | `getTripRole` + `canMutateTrip`; null role / `friend` → 403 |
| 5 | GET `/api/trips/:tripId/commission` | `server/routes/booking-actions.ts:1541` | `isAuthenticated` | `getTripExpertAdvisoryAssignment`; 403 without assignment |
| 6 | GET `/api/trips/:tripId/expert-notes` | `server/routes/booking-actions.ts:1502` | `isAuthenticated` | ownership OR assignment OR `isTripAuthor`; 403 |
| 7 | PATCH `/api/trips/:tripId/expert-notes` | `server/routes/booking-actions.ts:1523` | `isAuthenticated` | `getTripExpertAdvisoryAssignment`; 403 |
| 8 | GET `/api/trips/:tripId/traveler-profile` | `server/routes/booking-actions.ts:1050` | `isAuthenticated` | `isExpertAssignedToTrip`; 403 |
| 9 | GET `/api/provider/services?status=active` | `server/routes.ts:2033` | `isAuthenticated` | scoped to caller's own provider services (not trip-scoped by design) |
| 10 | GET `/api/geocode` | `server/routes/content.routes.ts:5711` (also `:3726`) | **none (public)** | none (utility) |
| 11 | GET `/api/search/experiences` | `server/routes/content.routes.ts:5730` | **none (public)** | none (global catalog) |
| 12 | PATCH `/api/expert/assignments/:id/workspace-status` | `server/routes/booking-actions.ts:1114` | `isAuthenticated` | loads assignment by id, then `assignment.localExpertId !== userId → 403` (`:1129`) |

### Commission fallback (flag #5) & money literals

- **Primary resolution is `fee_bands`-sourced:** `resolveCommissionRates` (`server/services/commission.ts:379`) reads `fee_bands` via `getBand` (`commission.ts:216`); `expertShareRate: 1 - bandRate` (`commission.ts:176`). Table exists at `shared/schema.ts:6239`.
- **Safety-net fallback is 0.75 expert / 0.25 platform** — `EXPERT_SHARE_RATE = 0.75` / `PLATFORM_FEE_RATE = 0.25` (`server/services/commission.ts:48-49`). The old expert-hostile `0.30` default is not the missing-rate fallback anymore.
- **Every fee/commission literal found in console-touched paths** (candidate MONEY_INTEGRITY opportunities for the checklist):
  - `server/services/commission.ts:38-39` — `AFFILIATE_PLATFORM_FEE = 0.70`, `AFFILIATE_EXPERT_SHARE = 0.30` (affiliate split; intentional but a literal outside `fee_bands`)
  - `server/services/commission.ts:48-49` — `0.75` / `0.25` safety-net constants
  - `server/routes.ts:719` — hardcoded `(…, 25, 75, …)` default fee-band injection
  - `server/routes.ts:3973-3975` — `serviceExpertPct = parseFloat(serviceSplit?.expertPercentage || '75') / 100` (string-literal fallback)
  - `server/routes/payments.routes.ts:835` — comment referencing a `0.30` display literal (comment only)

## 0.5 Engine connectivity matrix (as-is)

**Flag #4 and the Workflow-Spec §4 disconnect table are STALE — the engine is now wired into the console.** A `GET /api/trips/:tripId/workspace-constraints` endpoint (`server/routes/booking-actions.ts:1611`) aggregates engine output for the workspace.

| Engine capability (Workflow Spec §4) | Console-invoked today? | Evidence |
|---|---|---|
| Optimizer variants + 4 scores | **YES** — scores (balance/wellness/pace/diversity, `itinerary-optimizer.ts:1057-1521`) exposed via `workspace-constraints` (`booking-actions.ts:1611`), rendered in AI Gaps tab (`workspace.tsx:3735`) | call-site chain above |
| `applyAnchorConstraints` repair | **YES (generation path)** — `itinerary-optimizer.ts:1206`; note the console's reorder button uses a separate heuristic: `POST /api/trips/:tripId/itinerary/optimize-order` (`workspace.tsx:2641` → `routes.ts:8938`, `itineraryIntelligenceService.optimizeOrder`) — see §8 Q3 | — |
| Anchor impact detection | **YES** — `detectAnchorImpacts` invoked inside `workspace-constraints` (`booking-actions.ts:1651`); fetched on mount / AI Gaps tab | — |
| Day-boundary enforcement | **YES** — `smart-sequencing.service.ts:1400`; `boundaryViolations` reported via `workspace-constraints` (`booking-actions.ts:1662`) | — |
| Energy / burnout calc | **YES** — `POST /api/trips/:tripId/calculate-energy` (`booking-actions.ts:1752`, `applyEnergyBalancing` at `smart-sequencing.service.ts:1824`); invoked on workspace mount (`workspace.tsx:2546`) | — |
| Template presets | **YES** — `POST /api/trips/:tripId/generate-presets` (`booking-actions.ts:1811` → `generatePresetsForTrip`); invoked on workspace open via `useEffect` when no constraints exist (`workspace.tsx:2553/2565`) | — |

**"AI Gaps" tab current implementation** (`workspace.tsx:3735-3939`): no longer the single dinner heuristic. It aggregates server-side signals — optimizer scores, anchor conflicts (`detectAnchorImpacts`), energy tracking, and transport gaps (`analyzeTransportGaps`, `server/services/transport-gap.service.ts:107`: missing transport, timing infeasibility, missing pickup points).

**Constraints computed on assignment open:** yes — mount effects fire `calculate-energy` (`workspace.tsx:2546`), `generate-presets` (`:2565`), and fetch `workspace-constraints` (`:2388`).

## 0.6 Auth-scope probes (static only — no requests executed)

- **`getTripRole`** — `server/utils/trip-role.ts:30`. Resolves access via `trip_collaborators` (explicit role rows) or `trip_expert_advisors` (assignment). **The platform-role bypass class is REMOVED**: lines 4–7 document explicitly that platform roles (expert/admin) never grant trip access on their own, citing the prior broken-access-control version. Null-hazard handling: `userId` null → returns null (`:31`); `isTripAdvisor` (`:50`) returns false on null `tripId`/`userId` (no `null===null` comparison path).
- **Non-assigned-expert rejection per endpoint** — every workspace endpoint carries an assignment-based guard; see the table in §0.4 (guards column, with file:line). No endpoint in the §7 set lacks a guard except the two deliberately public utilities (geocode, experience search — no trip data exposed). Searched scope: `server/routes/expert-workspace.routes.ts`, `server/routes/booking-actions.ts`, `server/routes/trips.routes.ts`, `server/routes.ts` handler bodies for the listed routes.
- **Workspace-status PATCH ownership**: verifies the `:assignmentId` row belongs to the caller — `assignment.localExpertId !== userId → 403` (`booking-actions.ts:1129`). An authenticated expert cannot advance someone else's assignment.
- **User-id extraction convention**: all reviewed workspace endpoints use the shared `getUserId(req)` helper (`server/utils/auth.ts`; repo-wide migration merged 2026-08-04). Residual `claims` reads are metadata-only (`trips.routes.ts:1396` userName) or legacy role checks in `requireExpert` middleware (`expert-workspace.routes.ts:40`, which still uses `user?.role || user?.claims?.role` for the platform-role gate but `getUserId` for row lookups).

## 0.7 Test-fixture readiness (DEV DB reads only)

| Fixture | Status | Detail |
|---|---|---|
| Admin | ✅ | `test-admin@traveloure.test` (role `admin`) |
| Travelers | ✅ | 6 market travelers: `test-traveler-{kyoto,nyc,porto,jaipur,cartagena,edinburgh}@traveloure.test` |
| Expert accounts | ⚠️ partial | `expert@traveloure.test` (`local_expert`), `sofia.chen@traveloure.test` (`local_expert`, approved form, city **Los Angeles**), `expert_test_001@traveloure.test` (`expert`), `ci-expert@traveloure.test` (`travel_expert`), `kyoto-food@traveloure.test` (`travel_expert`) |
| **Kyoto expert** | ❌ **gap** | No expert account has an approved expert form pinned to Kyoto. `kyoto-food@traveloure.test` is `travel_expert` by role but has no `local_expert_forms` row; the only approved form on a test account is Sofia Chen (Los Angeles). If the Kyoto submit-gate assertions need a Kyoto-market expert, one must be seeded (Phase 2/3 concern — flagged, not fixed here). |
| Non-Kyoto expert | ✅ | Sofia Chen (LA) / `ci-expert` |
| Platform-role user for AUTH_SCOPE probes | ✅ | any second expert not assigned to the target trip (e.g. `ci-expert@traveloure.test`) plus `test-ea@traveloure.test` (`executive_assistant`) |
| Seedable trips per template family | ⚠️ | DEV trips by `event_type`: `vacation` 86, `wedding` 2, `travel` 1, `other` 1. Travel template: available (1 existing + cheap to create via intake). Wedding cheaply available. Other families would need creation via the intake flow. |
| `trip_expert_advisors` rows (DEV) | **2** | both `status=accepted`, `workspaceStatus=draft` (experts: maria.santos@example.com / sofia.chen — trips in California) |
| `expert_requests` rows (DEV) | **5** | — |

Production DB: not touched (read or write), per lane rule.

## 8. Surprising findings — questions for Leon (HARD STOP items)

Per the brief, surprising findings are surfaced as questions rather than silently absorbed into the Phase 1 checklist:

1. **Four of six spec flags are already fixed** (#1 bridge, #2 dead mutation, #4 AI Gaps/engine wiring, #6 stage counter), and #5 (commission fallback) is resolved to `fee_bands` + 0.75 safety net. The Workflow-Spec §4 disconnect table is entirely stale — all six engine rows are now wired. **Question:** should the Phase 1 checklist still carry these as (now expected-PASS) opportunities to lock in the behavior, or be re-scoped around the current defect surface? My recommendation: keep them as expected-pass assertions — they are exactly the regressions the harness should catch.
2. **The remaining genuine ABSENCE:** no transition logging on `workspaceStatus` (notification only). Confirm this stays an expected-fail `ABSENCE` opportunity per the locked as-is baseline (§1.2 cross-cutting row).
3. **Reorder heuristic split:** the console's "optimize order" button calls `itineraryIntelligenceService.optimizeOrder` (`routes.ts:8938`) — a separate heuristic from the main optimizer/`applyAnchorConstraints` path. Expert edits are therefore optimized against a different engine than generation. **Question:** is this in-scope for a CX assertion ("reorder respects anchors") — likely an expected-fail ENGINE_UNWIRED-adjacent row — or out of scope for this lane?
4. **No Kyoto-market expert fixture exists** (0.7). The Kyoto constraint is locked wherever submit gates are in scope — confirm whether seeding a Kyoto expert is authorized in Phase 2 (fixtures) or whether Kyoto assertions should be written against `test-traveler-kyoto`'s trips with a non-Kyoto expert.
5. **Duplicate mounts:** `assigned-trips` is defined in both `experts.routes.ts:606` and `booking-actions.ts:696`; `geocode` in `content.routes.ts:5711` and `:3726`. Which mount wins depends on registration order — worth one FL assertion each (consistent behavior), and a FOLLOWUPS.md entry.

## Baseline entry conditions (for the Phase 3 harness)

1. Journey can start at the **routed lead**: seed/route into `expert_requests` → admin confirms via `POST /api/admin/routing-queue/:requestId/confirm` (admin session required) → `trip_expert_advisors` row created transactionally → workspace opens at `/expert/workspace/:tripId`.
2. Alternatively (cheaper per-run): seed a `trip_expert_advisors` row directly (`status=accepted`, `workspaceStatus=draft`) — both existing DEV rows are in this shape.
3. Status journey per run: `draft → in_review → delivered` via the single Approval Bar button; terminal at `delivered`.
4. Engine signals (constraints/energy/presets) are computed lazily on first workspace open — the harness must allow for the mount-time POSTs before asserting AI Gaps content.

## FOLLOWUPS.md entries to create (per brief §FOLLOWUPS — listed here; file entries created at lane exit with Phase 1)

- `ABSENCE` — `workspaceStatus` transitions have no append-only log row (notification only), `booking-actions.ts:1114-1211`.
- `STATE_DIVERGENCE` (latent) — client computes `next` status (`workspace.tsx:2699`); safe only while the machine stays linear.
- `MONEY_INTEGRITY` (candidates) — literals at `routes.ts:719` (25/75 band injection), `routes.ts:3973-3975` (`'75'` string fallback), `commission.ts:38-39` (affiliate 0.70/0.30 outside `fee_bands`).
- `DEAD_PATH`/consistency — duplicate route mounts (`assigned-trips` ×2, `geocode` ×2).
- Workspace ↔ PlanCard renderer divergence (flag #3) — still two renderers; test implication: WF UI-state assertions may need dual coverage. Note, defer (out of lane scope).
- Reorder path bypasses anchor constraints (`optimizeOrder` heuristic vs optimizer) — category `ENGINE_UNWIRED` candidate pending Q3.

---

# PHASE 1 — Re-diff findings & assertion inventory

**Phase 1 dispatch received 2026-08-04 (HARD STOP lifted; §8 answered as rulings 20–25 in `docs/DECISIONS.md`).**
**Re-diff:** Phase 0 pin `5941a4ff` → current main `89913e4a` (PR #418 `42cb0d5f` + task merges #1026–#1028, #1032–#1034).

## §9 Re-diff findings (deltas since `5941a4ff`)

| # | Phase 0 claim | Now | Delta / consequence |
|---|---|---|---|
| D1 | §0.2 "Transition logging: NONE (recorded absence)" | **FIXED** by #1028 (`45000861`): `storage.updateExpertAssignmentWorkspaceStatus` flips status AND writes an `item_transition_log` row (`workspace_status_transition`, itemId NULL per ruling 16, actor recorded) in ONE transaction (rulings 12/18). Traveler `request_changes` reset also logged. | Ruling 21's expected-fail ABSENCE row, tagged `deferred:#1028`, **flips to expected-PASS in this same phase** — assertions L1–L3 below. |
| D2 | §0.2 "Client still computes `next`" (`workspace.tsx:2699`) | **FIXED** by #1027 (`0b1a8529`): client sends `{ intent: "advance" }`; server derives `nextStatus = validTransitions[current][0]`; explicit target kept for backward compat (`booking-actions.ts:1114-1138` @ `89913e4a`). | Ruling 25's expected-fail STATE_DIVERGENCE **flips to expected-PASS** — assertions S1–S3, incl. the lying-client divergence probe S3. |
| D3 | §0.4 money literals: `commission.ts:48-49` (0.75/0.25 safety net) | **Superseded** by #1032 (`d2b61ccd`): fallback splits resolve from `fee_bands.expert_standard` (60s cache); constants remain documented last-resort data-model defaults, `fee-literal-ok`-annotated. Already assertion-covered by merged tests (`expert-split-band.db.test.ts`, `trip-commission-band-edit.http.test.ts` — #1033/#1034). | MONEY_INTEGRITY candidate row RETIRED for 48-49. Fee expectations checked against **ruling 32**: the EXPERIENCE_CART 0.30 was display/diagnostic-only (supersedes ruling 25's checkout-rate framing); migration 174 + `experience-cart-band.db.test.ts` cover it. |
| D4 | §0.4 literals `routes.ts:719` (25/75 band injection) and `routes.ts:3973-3975` (`'75'` string fallback) | **Still present** @ `89913e4a` (line drift only). | FOLLOWUPS rows stand. Per ruling 32 any future move into `fee_bands` must declare its surface + ship a DB-backed test. |
| D5 | §0.2 evidence lines (`booking-actions.ts:1119-1123`, `workspace.tsx:2695-2708`) | Handler grew (intent branch, 1028 log call, R7 delivered-credit block); machine map itself **unchanged** (`draft→in_review→delivered`, linear, forward-only). | file:line refs in §0.2 are stale by drift; the semantic claims hold except D1/D2. |
| D6 | (new since Phase 0) | Delivered-flip now triggers best-effort completion/credit of PAID bridged `expert_requests` (R7 block in the same handler). | OUT of v1 scope (money edge, not the workspace machine — ruling 24); noted for the journey suite's money matrix. |

CLAUDE.md §-references cited by Phase 0 (§14/§15) survive the #418 slim; the ledger (`docs/DECISIONS.md`) is now the ruling authority (cited by number below, per ruling 26).

## §10 Assertion inventory (Phase 1, harness v1 — workspace machine only per ruling 24)

**Code:** `server/__tests__/console-sigma-workspace-machine.http.test.ts` (real HTTP, real email-auth sessions, DB-fact assertions; 9/9 green) and `server/__tests__/console-sigma-reorder-divergence.db.test.ts` (R22 divergence pin; green = divergence present).

| ID | Ruling | Kind | Assertion (every green = a DB fact) | Status |
|---|---|---|---|---|
| M1/S1 | 24, 25 | expected-PASS | `intent:"advance"` from draft lands `workspace_status='in_review'` in `trip_expert_advisors` | PASS |
| M2/S2 | 24, 25 | expected-PASS | explicit legal target `in_review→delivered` still accepted (backward compat), DB fact `delivered` | PASS |
| M3 | 24 | expected-PASS | `delivered` terminal: advance + both backward targets → 400, DB frozen | PASS |
| M4 | 24 | expected-PASS | illegal jump `draft→delivered` → 400, DB frozen | PASS |
| M5 | 24 | expected-PASS | non-owning expert → 403, DB frozen | PASS |
| M6 | 24 | expected-PASS | stale `expectedCurrentStatus` precondition (the HTTP 409 source) writes neither status nor diary row — atomic pair (rulings 12/18) | PASS |
| L1 | 21 | **FLIPPED to expected-PASS** (fixing commit `45000861` / #1028) | successful transition writes exactly one `workspace_status_transition` row: itemId NULL (r16), from/to correct, actorType `expert`, actorId = acting expert | PASS |
| L2 | 21 | flipped expected-PASS (`45000861`) | second transition appends row 2 with correct from/to | PASS |
| L3 | 21 | flipped expected-PASS (`45000861`) | rejected transitions append NO diary rows | PASS |
| S3 | 25 | **FLIPPED to expected-PASS** (fixing commit `0b1a8529` / #1027) | divergence probe: `intent:"advance"` + lying `workspaceStatus:"delivered"` → server-derived `in_review` wins | PASS |
| A2 | 20 | expected-PASS regression (spec flag #2; fixed pre-`5941a4ff`) | empty-body PATCH (old dead saveMutation shape) → 400, DB + diary untouched | PASS |
| A4 | 20 | expected-PASS regression (spec flag #4) | `workspace-constraints` aggregation mounted + assignment-gated (403 intruder / 200 assigned) | PASS |
| R22 | 22 | **EXPECTED DIVERGENCE** (green = defect pinned) | `optimizeOrder` ignores `isFlexible` anchors — computes `fixedItems` then never uses them (`itinerary-intelligence.service.ts:343-362`); a non-flexible 08:00 anchor is demoted behind flexible items by pure energy sort. Test is the tripwire: it FAILS when the named follow-up (reorder consumes the optimizer's constraint service) lands, and must then be flipped positive. Remediation NOT in scope (ruling 22). | PASS (divergence present) |
| A1 | 20 | **deferred:phase-2** | admin-confirm bridge regression (flag #1): `POST /api/admin/routing-queue/:requestId/confirm` transactionally inserts advisor row + flips `expert_requests.status='assigned'`. Needs admin session + `expert_requests` fixture — same fixture bench as R23; batched into Phase 2. | pending |
| A5 | 20, 32 | already-covered | commission fallback (flag #5): covered by merged `expert-split-band.db.test.ts`, `trip-commission-band-edit.http.test.ts`, `experience-cart-band.db.test.ts` — not duplicated here | PASS (external) |
| — | 23 | phase-2 | Kyoto expert fixture: full draft→submitted→approved lifecycle, standard account convention, never bypassing the Kyoto submit gate | pending |
| — | 24 | deferred:phase-4 | per-item routing-layer matrix cells | pending |

**Standing-rule compliance:** dev DB only (all seeded rows removed in `after`); no UI-only passes (every assertion lands on a `trip_expert_advisors` / `item_transition_log` fact or a rejected write proven by an unchanged fact); tsc baseline untouched (no production code modified — test files + this doc only); one branch (`lane/console-sigma-test`).

---

*Phase 0 prepared read-only @ `5941a4ff`; Phase 1 assertions + re-diff @ `89913e4a`.*
