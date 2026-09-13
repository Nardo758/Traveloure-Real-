-- Migration 294: the ready-made rail's author earning gets the migration-203 guard, one
-- reference_type over (punchlist V-3b, ledger 2026-09-12-readymade-earning-retry).
--
-- WHAT WAS BROKEN. `fulfillReadyMadePurchase` credits the author with a PLAIN INSERT, reached only
-- by the winner of the atomic `paid → cloned` claim. That makes it safe under CONCURRENCY and
-- unreachable after a CRASH: a process dying between the claim and the insert leaves a purchase
-- that is `cloned` (the buyer has their trip) with NO author earning, and every later fulfil
-- short-circuits on `status = 'cloned'` and credits nothing. The buyer is delivered, the author is
-- never paid, and nothing in the platform detects it.
--
-- The fix has two halves. The code half makes the money leg REACHABLE on a re-run: an already
-- `cloned` purchase now ENSURES the earning and the platform-revenue row instead of returning
-- early (§15c — "the promotion is the money leg only", and the one effect it retries is one that
-- is idempotent by construction). The CLONE itself stays strictly once-only: it is not
-- uniqueness-guarded and a second one is a real second trip.
--
-- This migration is the other half: the write that becomes retryable must be uniqueness-guarded,
-- so the retry can never DOUBLE-credit. Exactly the shape migration 203 gave the completion mint
-- on this same table — an INSERT ... ON CONFLICT DO NOTHING against a PARTIAL unique index.
--
-- PARTIAL IS LOAD-BEARING. `expert_earnings` is written by five other rails (tips, referral
-- bonuses, affiliate commissions, the expert review-fee split, and `recordRevenueEvent`'s
-- per-source-type mint), several of which legitimately repeat a `reference_id`. Scoping the index
-- to this rail's own `reference_type` leaves every one of them byte-for-byte untouched.
--
-- `amount >= 0`, exactly as 203: only the one original positive credit is unique per purchase; a
-- negative clawback/compensation row sharing the same identity (none today, the refund path
-- UPDATEs status to 'reversed') stays insertable.
--
-- The index is ALSO declared in shared/schema.ts (publish-trap rule): an index that file does not
-- declare is dropped by the Replit deploy push and a stamped migration never recreates it.
--
-- BEFORE PUBLISHING, the operator runs the read-only duplicate check scoped to this predicate —
-- the deploy push creates the DECLARED index before migrations run, so a pre-existing duplicate
-- fails the publish and offers the destructive "copy dev database over production" option:
--
--   SELECT reference_id, count(*)
--     FROM expert_earnings
--    WHERE reference_type = 'ready_made_purchase' AND amount >= 0
--    GROUP BY reference_id HAVING count(*) > 1;
--
-- A non-zero result must be resolved by hand FIRST. This is a pure index migration — no ALTER, no
-- CHECK, no DEFAULT change — so `scripts/preflight-prod-constraints.cjs` (whose manifest is for
-- CHECK constraints) needs no new entry.

-- Dedupe first, on 203's preference order: keep a paid_out row over any other, then the earliest
-- created. A duplicate is not expected here (the claim winner is the only writer today), but the
-- index cannot be created over one, and 203 established this treatment for this table.
DELETE FROM expert_earnings ee
USING expert_earnings keep
WHERE ee.reference_type = 'ready_made_purchase'
  AND keep.reference_type = 'ready_made_purchase'
  AND ee.reference_id = keep.reference_id
  AND ee.amount >= 0
  AND keep.amount >= 0
  AND ee.id <> keep.id
  AND (
    (keep.status = 'paid_out' AND ee.status <> 'paid_out')
    OR (
      (keep.status = 'paid_out') = (ee.status = 'paid_out')
      AND (keep.created_at, keep.id) < (ee.created_at, ee.id)
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS expert_earnings_ready_made_sale_uniq
  ON expert_earnings (reference_id)
  WHERE reference_type = 'ready_made_purchase' AND amount >= 0;
