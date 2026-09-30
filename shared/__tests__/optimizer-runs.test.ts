/**
 * optimizer-runs.test.ts — Track A step A9, ledger `2026-09-30-a9-run-records`. The value sets and the
 * basis label (the basis, never an amount; an unknown basis says nothing, §13). The DB half is
 * server/__tests__/optimizer-run-records.db.test.ts.
 *
 * Run: npx tsx --test shared/__tests__/optimizer-runs.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { OPTIMIZER_RUN_BASES, RUN_OUTCOME_KINDS, runBasisLabel } from "../optimizer-runs";

test("the run bases are the run predicate's three", () => {
  assert.deepEqual([...OPTIMIZER_RUN_BASES], ["paid", "trip_pass", "free_rerun"]);
  assert.deepEqual([...RUN_OUTCOME_KINDS], ["adopted_whole", "adopted_part", "option_chosen", "booking_created"]);
});

test("the basis label names what paid, never an amount; unknown says nothing", () => {
  assert.equal(runBasisLabel("paid"), "Paid run");
  assert.equal(runBasisLabel("trip_pass"), "Included in your Trip Pass");
  assert.equal(runBasisLabel("free_rerun"), "Free re-run");
  assert.equal(runBasisLabel(null), null);
  assert.equal(runBasisLabel("gift"), null);
});
