# Lane report — D-19: `plan_proposals` is the home of an AI proposal (migration 299)

**Branch** `task-d19-plan-proposals` · worktree `/home/user/wt-d19` · base `origin/main` @ `f83e16691`
**Ruling** decision-maker 2026-09-15, punchlist **D-19 = option (b)**.
**Ledger row** `2026-09-15-d19-plan-proposals`.

## Status

| Step | State |
|---|---|
| Worktree + branch | DONE |
| Reading (OP, CLAUDE.md, punchlist, L16 brief) | DONE |
| Migration 299 + registry | pending |
| `shared/plan-proposals.ts` (types + status values) | pending |
| `shared/schema.ts` declaration + `.pick()` admission schema | pending |
| `server/services/plan-proposals.service.ts` | pending |
| Routes (GET + discard) | pending |
| Tests P1–P7 + CI job | pending |
| Ledger + punchlist | pending |
| Validation | pending |
| PR | pending |

## What this lane does

D-19 asked where an AI proposal lives before the traveler applies it. The expert
`trip_suggestions` rail cannot hold one: its `expert_id` is NOT NULL FK → `users.id`, its
create route refuses anyone who is not `isExpertAssignedToTrip`, and its approve path
hardcodes `origin:'expert'` — the false attribution LD 42 **D4**/**D23** forbid by name.
Option (b) was ruled: a NEW child table of `trips`, on the `dmo_extracted_places` /
`service_route_points` pattern. **The expert rail is untouched.**

## Decisions taken inside the lane (and why)

- **`conversation_id` is `integer`**, not varchar: the AI conversation row is
  `conversations` in `shared/models/chat.ts` and its `id` is `serial`. FK ON DELETE SET NULL —
  deleting a thread must never delete the proposals it produced.
- **The gate** is `authorizeTripLogistics(..., { requireWriteAccess: true })` — the named
  shared predicate the itinerary-item mutation rails already use
  (`POST /api/trips/:tripId/itinerary/reorder`, `PATCH .../expert-traveler-note`). LD 42 D17
  warns against `authorizeTripLogistics` in its **default** (read) form, which grants
  `pending`; the `requireWriteAccess: true` option is exactly the §12 WRITE narrowing D17
  asks for, and using it is what "never a second copy" means here.
- **No partial index** on `(trip_id) WHERE status='proposed'`: the only reader in this lane
  is `listPlanProposals(tripId)`, which reads a plan's whole log; `trip_id` alone serves it.
  Stated in the migration header rather than added speculatively.
- **No UNIQUE and no `position`**: proposals are a LOG, not an ordered list.
- **No payment/charge/claim column.** D-20/D-21 (the charge point) own that and will add
  their own columns in their own migration; named in the migration header and in the service.

## Left undone (deliberately, named)

- **No `apply`.** Applying a proposal is the charge point — punchlist D-20/D-21, the L16 lane.
- **No create route and no client UI.** Nothing produces a proposal yet; the writer is the
  ruled store for L16 and is called by nothing outside tests. §18c does not apply — the rule is
  "no consumer + an irreversible effect ⇒ delete", and this is a ruled store landing ahead of
  its one consumer, with no effect of its own.
