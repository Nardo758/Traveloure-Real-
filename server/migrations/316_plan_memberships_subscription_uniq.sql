-- 316 — the idempotency key of the ONE membership writer (ledger `2026-09-21-membership-writer`).
--
-- `plan_memberships` had NO unique constraint. Stripe redelivers webhooks as a matter of course,
-- so without one a redelivery would INSERT A SECOND ROW for the same subscription, after which
-- `getActiveMembership`'s "most-recent period wins" would silently pick between duplicates — a
-- traveler's entitlement decided by a race. CLAUDE.md §15 requires the STATEMENT to be the guard,
-- which means an `INSERT … ON CONFLICT` needs a conflict target. This is it.
--
-- PARTIAL, and that is load-bearing: `source` may be 'manual' or 'beta' (a hand-granted or beta
-- membership), and those carry NO subscription id. A plain UNIQUE over a nullable column would be
-- satisfied by NULLs in Postgres, but stating the predicate says out loud that only Stripe-sourced
-- rows are constrained — and keeps the index small.
--
-- IF NOT EXISTS so a re-run is a no-op. DECLARED in `shared/schema.ts` in the same commit: an
-- index that file does not declare is dropped by the Replit deploy push and never recreated,
-- because this migration will already be stamped (the `sb_idempotency_key_idx` incident).
--
-- SAFE TO CREATE: `plan_memberships` has no writer anywhere in the codebase today (this lane adds
-- the first), so the table is empty in production and no duplicate can fail the index. That was
-- checked, not assumed — CLAUDE.md requires a duplicate check before declaring a UNIQUE index,
-- because a violated one fails the publish and offers the destructive "copy dev over production".
--
-- PUBLISH NOTE: this is an INDEX, so unlike migration 315 the deploy push MAY offer a CREATE INDEX
-- statement. Per §20 that is NOT the one approvable case (which is column-only ADD COLUMN):
-- DECLINE it and stop. Declining is safe — boot runs this migration and creates the index a minute
-- later.

CREATE UNIQUE INDEX IF NOT EXISTS plan_memberships_stripe_subscription_uniq
  ON plan_memberships (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
