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

*Prepared by the console-sigma-test lane agent. No writes performed other than this report. All `file:line` @ `5941a4ff`.*
