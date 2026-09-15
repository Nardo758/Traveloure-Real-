# Lane report — L16: the Ask-AI drawer design brief

Branch `task-l16-ask-ai-drawer-brief`, off `origin/main` @ `2507fe63c`.
Ledger row: `2026-09-15-l16-ask-ai-drawer-brief`. **Docs only — no code, schema, migration, route,
rail, test or workflow.**

## What this lane was for

CLAUDE.md Locked Decision 45 (3) requires L16 to have its own design brief **before** it is built,
and the concierge brief's own lane table said so. **The brief already existed** (v1 2026-09-08,
v2 2026-09-15, ledger `2026-09-15-ask-ai-drawer-brief-v2`) and v2 isolated three rulings — D-19,
D-20, D-21 — **all three of which were answered and BUILT the same day**. So this lane **REVISED it
in place to v3** rather than replacing it: §1/§2/§3/§6/§9 carry dated corrections where the code
moved under them, nothing was deleted (the three rows v2 filed are preserved with their answers in
the new §7.3), and two new sections were added — **§4 the CREATE rail's contract** and **§5 the
drawer** — on the `EXPERT_ACCEPTANCE_BRIEF.md` pattern.

## What it found

1. **Half the lane is already built.** D-19 (migration 299) landed the store, the vocabulary, the
   pick-based admission schema, the writer/reader/discard; D-20/D-21 (migration 300) landed the flat
   `concierge:ai_task` charge, the §15b claim, the §19a single writer, the one pure apply predicate,
   the D3 protection in two layers, and the four routes. `GET /api/pricing` already publishes
   `aiTaskCents`, so the drawer needs no fee read of its own.
2. **What is missing is the two ends:** the **CREATE rail** (`createPlanProposal` has no caller
   outside tests) and the **drawer UI** (no "Ask AI" affordance exists anywhere in `client/`).
3. **The concierge brief's L16 row was WRONG and is corrected.** It said a task "answers as a
   proposal on the EXISTING suggestions rail (origin `ai`), applied through the existing approve
   path". D-19 refuted every clause of that: `trip_suggestions.expert_id` is NOT NULL and the
   approve path hardcodes `origin:'expert'` — the false attribution LD 42 D4/D23 forbid by name.
4. **`applyPlanProposal` does not call `reFinalizeIfCurrentlyFinal`**, which the expert-suggestion
   accept path does (four callers verified). LD 45 (3) puts the drawer post-final on the Trip Card,
   so applying there would rewrite items under a frozen snapshot that never advances. Filed as
   **D-49**; until it is ruled the brief holds the post-final mount.
5. **The pay rail builds the PaymentIntent from the SESSION user's Stripe customer**, and the four
   proposal routes admit a §12 WRITE advisor — so an advisor who pays pays with their own card,
   which is LD 44 **D19**'s prohibition reached from the other direction. Filed as **D-48**, with
   the owner-only coverage read (`GET /api/trips/:tripId/trip-pass` 403s an advisor) in the same row.
6. **There is no user-keyed limiter an AI ask can reuse honestly.** `checkMessageRateLimit` requires
   a `recipientId`; a fabricated one would be an invented identity on an identity key. Filed as
   **D-46** with the recommendation of a named sibling in the SAME module, never a second limiter.
7. **`ai_cost_tracking` IS declared in `shared/schema.ts`**, so LD 44 (f)'s stated prerequisite is
   already met and is not a blocker for this lane.

## Filed

| Row | Question (one line) |
|---|---|
| **D-45** | Is the drawer a THREAD (`conversations`) or a stateless ask over the proposal log? |
| **D-46** | What throttles a free ask, and is CREATE idempotent? |
| **D-47** | What model tier does a PAID task run on, and what `sourceType`/`userId`/`requestId` does its cost row carry? |
| **D-48** | May a §12 WRITE advisor ask/pay/apply — whose card is charged — and how does the drawer learn coverage? |
| **D-49** | Does applying on a FINALIZED plan advance the Trip Card's version? |
| **D-50** | What does the create rail send the model, and may a proposal name a live catalog listing? |

## Files touched

- `docs/design/ASK_AI_DRAWER_BRIEF.md` — **revised in place to v3** (241 → ~600 lines; no existing text deleted).
- `docs/design/CONSOLE_AND_AI_CONCIERGE_BRIEF.md` — L16 lane row and status row corrected.
- `docs/PUNCHLIST.md` — §1 rows D-45..D-50; §0 item 5 and §4 lane list amended.
- `docs/DECISIONS.md` — one row appended.

## Validation

| Check | Result |
|---|---|
| `node scripts/check-decision-guards.cjs` | see PR body |
| `bash scripts/phase2-fee-gate.sh` | see PR body |
| `grep -c replit.local package-lock.json` | 0 (lockfile untouched) |

The reduced validation set is the lane brief's: only `docs/` changed — no TypeScript, no schema, no
migration, no workflow and no test file, so tsc/build/migration/test-wiring gates have nothing to
act on.

## Not done, deliberately

- **No code.** The create rail and the drawer are the build lanes the brief sequences; four of the
  six decision rows block them.
- **No CLAUDE.md edit.** The proposed sentence is in the PR body.
- **Nothing about money changed or was proposed for change** — no amount, rate, band, idempotency
  key, claim, ledger row or entitlement.
