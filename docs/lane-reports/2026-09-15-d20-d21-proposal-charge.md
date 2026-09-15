# Lane report — D-20 / D-21: the AI proposal apply is charged flat from `fee_bands`, once per distinct proposal

Branch `task-d20-d21-proposal-charge`, off `origin/main` @ `5d5f7ccc3` (PR #932, migration 299).
Ledger row: `2026-09-15-d20-d21-proposal-charge`.

## The two rulings this lane executes

- **D-20 = A — FLAT, FROM `fee_bands`.** The `concierge:ai_task` band (`flat_cents`), resolved
  through the EXISTING `requireFlatCentsBand` resolver. Never a literal (§8). `optimization_fees`
  is untouched — it is a different fee home and folding it in is an older question and its own lane.
- **D-21 = A — ONE CHARGE PER DISTINCT PROPOSAL APPLIED**, idempotent on the proposal id. Asking is
  free. The §15b CLAIM sits on the `plan_proposals` row; the Stripe idempotency key derives from the
  proposal id (`ai-apply-<proposalId>`); a double-click or a retry is one charge.

## Status

IN PROGRESS — see the bottom section for the live checklist.

