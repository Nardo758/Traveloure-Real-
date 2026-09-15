# Lane report — D-19: `plan_proposals` is the home of an AI proposal (migration 299)

**Branch** `task-d19-plan-proposals` · worktree `/home/user/wt-d19` · base `origin/main` @ `f83e16691`
**Ruling** decision-maker 2026-09-15, punchlist **D-19 = option (b)**.
**Ledger row** `2026-09-15-d19-plan-proposals`.

## Status — COMPLETE, pending CI

| Step | State |
|---|---|
| Worktree + branch | DONE |
| Migration `299_plan_proposals.sql` + registry entry | DONE |
| `shared/plan-proposals.ts` (status set + `PlanProposalChangeSet`) | DONE |
| `shared/schema.ts` table + index declaration, pick-based admission | DONE |
| `server/services/plan-proposals.service.ts` | DONE |
| Routes: `GET /api/trips/:tripId/proposals`, `POST …/:id/discard` | DONE |
| `server/__tests__/plan-proposals.db.test.ts` P1–P7 + `build.yml` job | DONE (7/7) |
| Ledger row, punchlist strike, L16 brief amendment | DONE |
| Validation | DONE (table below) |
| PR | see final report |

## What landed

| File | What |
|---|---|
| `server/migrations/299_plan_proposals.sql` | CREATE TABLE `plan_proposals` + one index on `trip_id` + table COMMENT |
| `server/migrations/migration-files.ts` | registry entry, house-style comment |
| `shared/plan-proposals.ts` | `PLAN_PROPOSAL_STATUSES` (the ONE home of the value set), the three status constants, `isPlanProposalStatus`, and the `PlanProposalChangeSet` / `PlanProposalAddition` / `PlanProposalReplacement` types for the jsonb |
| `shared/schema.ts` | `planProposals` table + `plan_proposals_trip_idx` declared (deploy-push durability rule); `planProposalCreateSchema` (`.pick()` + `.strict()`); lazy `conversations` import for the FK |
| `server/services/plan-proposals.service.ts` | `createPlanProposal`, `listPlanProposals`, `discardPlanProposal` (atomic conditional) |
| `server/routes/trips.routes.ts` | the two routes |
| `server/__tests__/plan-proposals.db.test.ts` | P1–P7 |
| `.github/workflows/build.yml` | `plan-proposals` job (Postgres service, `ci-db-setup`, the suite) |
| `docs/DECISIONS.md`, `docs/PUNCHLIST.md`, `docs/design/ASK_AI_DRAWER_BRIEF.md` | record |

## Schema

| Column | Type | Note |
|---|---|---|
| `id` | `varchar` PK | `crypto.randomUUID()` in the ORM, matching the table's own convention |
| `trip_id` | `varchar` NOT NULL FK → `trips(id)` **ON DELETE CASCADE** | a proposal has no meaning without its plan |
| `conversation_id` | `integer` FK → `conversations(id)` **ON DELETE SET NULL** | integer because `conversations.id` is `serial`; SET NULL so deleting a thread never deletes the proposals it produced. NULL = names no thread |
| `question` | `text` | NULL = not recorded, never an invented prompt |
| `proposal` | `jsonb` | shape documented by `PlanProposalChangeSet`; the column stays permissive |
| `status` | `varchar(20)` NOT NULL | app-enforced `proposed \| applied \| discarded`, **NO CHECK, NO DEFAULT** |
| `model_tier` | `varchar(40)` | cost record only (LD 41 (c)) — never a product claim |
| `created_at` | `timestamp DEFAULT now()` | the log's ordering |
| `applied_at` | `timestamp` | written by nothing in this lane |
| `discarded_at` | `timestamp` | written only by the atomic discard |
| `applied_item_ids` | `text[]` | the record of what an apply created — D18: **a record, never an undo** |

Index: `plan_proposals_trip_idx` on `(trip_id)`. **No UNIQUE, no `position`** — a log, not an
ordered list. **No CHECK** ⇒ `preflight-prod-constraints.cjs` needs no manifest entry. No backfill.

## Decisions taken inside the lane (and why)

- **`conversation_id` is `integer`.** The AI conversation row is `conversations`
  (`shared/models/chat.ts`) and its `id` is `serial`.
- **No partial index** on `(trip_id) WHERE status='proposed'`: the only reader is
  `listPlanProposals(tripId)`, which reads a plan's WHOLE log (a discarded proposal stays on the
  record). Stated in the migration header rather than added ahead of a reader.
- **The gate is `authorizeTripLogistics(..., { requireWriteAccess: true })`** — the named shared
  predicate the itinerary-item mutation rails already use (`POST /api/trips/:tripId/itinerary/reorder`
  in the monolith; `PATCH .../expert-traveler-note`). LD 42 D17 warns off that helper's DEFAULT
  (read) form, which grants `pending`; `requireWriteAccess: true` is exactly the §12 narrowing D17
  asks for. **The READ is gated as hard as the write, deliberately** — a proposal carries the AI's
  reasoning and the rows it would replace, and no reader today needs the looser tier.
- **`status` has no DB default**, separately from having no CHECK: a default would let a writer
  that forgot to state a status still write a row.
- **No `insertPlanProposalSchema` exists at all** (§19) — there is nothing for a body to be parsed
  against, and P5 pins that.

## Side finding — recorded, not fixed

`docs/design/ASK_AI_DRAWER_BRIEF.md` §3 named the apply gate as `getTripWriteRole` +
`canMutateTrip`. That resolver finds an **owner** only through a `trip_collaborators` row, so a
plan whose owner has none resolves `null` and is refused — which is why this lane used
`authorizeTripLogistics(..., { requireWriteAccess: true })` instead (it resolves the owner through
`verifyTripOwnership`). Both narrow the advisor branch identically; they differ only in how they
find the owner. The `PATCH /api/trips/:tripId/itinerary-items/:itemId` rail uses the former.
Reconciling the two resolvers is its own lane. The correction is written into the brief.

## Left undone (deliberately, named)

- **No apply, and nothing stubbed.** It is the CHARGE POINT — punchlist **D-20** (flat vs tiered)
  and **D-21** (what one "task" is, and the §15b claim). `applied_at` / `applied_item_ids` exist,
  are unwritten, and are **not in the admission pick**, so the apply cannot be wired without going
  through those rulings. That is also why the table carries **no payment/charge/claim column at
  all** (pinned by P1).
- **No create route and no client UI.** Nothing produces a proposal yet; the L16 drawer is the
  consumer that follows. Not the §18c case — §18c refuses "no consumer + a state-bearing effect",
  and this is a ruled STORE with no route and no effect, unreachable from any client by
  construction.
- **No CLAUDE.md edit.** Proposed LD 45 (3) sentence is in the PR body.

## Validation (local, on the merge-clean branch)

| Check | Result |
|---|---|
| `npx tsc --noEmit` error count | **129** (= `TSC_BASELINE` in `build.yml`; unchanged) |
| `npm run build` | exit 0 |
| `node scripts/check-decision-guards.cjs` | OK (0 deferred warnings) |
| `node scripts/check-money-endpoints.cjs --self-test` | OK (37 predicate fixtures) |
| `node scripts/check-money-endpoints.cjs` | exit 0 |
| `bash scripts/phase2-fee-gate.sh` | exit 0 |
| `node scripts/check-test-files-wired.cjs` | exit 0 — 477/507 reachable, 30 pre-existing orphans; the new suite is reachable |
| `node scripts/check-duplicate-migration-prefixes.cjs` | OK (304 files, 299 registry entries, 3 grandfathered) |
| migration chain-integrity | 2/2 |
| `server/__tests__/plan-proposals.db.test.ts` | **7/7** |
| `server/__tests__/from-state-guards.db.test.ts` | 14/14 (neighbour, untouched) |
| `server/__tests__/booking-birth-provenance.db.test.ts` | 12/12 (neighbour, untouched) |
| `server/__tests__/authored-item-price-contract.db.test.ts` | 5/5 (same router, untouched) |
| `grep -c replit.local package-lock.json` | 0 |

DB suites ran against a local Postgres stood up in this sandbox
(`/var/tmp/pgdata-d19`, port 5433, database `traveloure_d19`), with all **299** migrations applied
from empty by `server/migrations/migrate-entry.ts`.
