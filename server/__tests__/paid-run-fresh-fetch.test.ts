/**
 * A9 × A6 (3) — the paid optimizer run's fresh fetch (ledger `2026-10-01-a9-paid-run-fresh-fetch`).
 *
 *   F1 a free draft never calls it: the free-draft modules never name the fresh rail, the ONE caller is
 *      the optimizer, and the optimizer's call is gated by the paid-only predicate
 *   F2 a Trip Pass run and a free re-run never call it; a run with no id or no plan never calls it
 *   F3 a paid run makes ONE pass: each located, in-window item of the plan is looked up once
 *   F4 the pass skips unlocated items, items outside the trip dates and ids that are not plan items
 *   F5 a plan-cap refusal ends the pass — no later item is asked
 *   F6 a failing lookup never throws out of the pass (§15b)
 *
 * Pure: every database and network edge is injected.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  paidRunMayFreshFetch,
  runPaidRunFreshFetch,
  selectPaidRunItems,
  startPaidRunFreshFetch,
  type PaidRunFreshFetchDeps,
} from "../services/content-facts/paid-run-fresh-fetch";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const base = {
  runId: "run-1",
  tripId: "trip-1",
  actorId: "u-1",
  startDate: "2026-11-01",
  endDate: "2026-11-03",
  baselineItems: [
    { id: "a", dayNumber: 1, latitude: 35.0, longitude: 135.7 },
    { id: "b", dayNumber: 2, latitude: 35.1, longitude: 135.8 },
    { id: "c", dayNumber: 2 }, // unlocated
    { id: "d", dayNumber: 5, latitude: 35.2, longitude: 135.9 }, // outside a 3-day trip
    { id: "z", dayNumber: 3, latitude: 35.3, longitude: 136.0 }, // not an item of the plan
  ],
};

function fakeDeps(outcomes: Record<string, string> = {}) {
  const calls: Array<{ itemId: string; ctx: unknown }> = [];
  let loads = 0;
  const deps: PaidRunFreshFetchDeps = {
    loadPlan: async () => {
      loads += 1;
      return {
        market: "kyoto",
        city: "Kyoto",
        items: ["a", "b", "c", "d"].map((id) => ({ id, title: `Item ${id}`, type: "activity" })),
      };
    },
    fetchItem: async (i) => {
      calls.push({ itemId: i.item.id, ctx: i.ctx });
      return { recorded: 1, outcome: outcomes[i.item.id] ?? "recorded" };
    },
  };
  return { deps, calls, loads: () => loads };
}

test("F1: a free draft never calls it — only the optimizer names the rail, behind the paid-only gate", () => {
  const callers = ["server/services/ai-generation.service.ts", "server/services/ai-draft-eligibility.ts", "server/services/ai-draft-model.ts"];
  for (const f of callers) {
    const src = read(f);
    assert.ok(!/paid-run-fresh-fetch|fetchFreshFactsForItem|startPaidRunFreshFetch/.test(src), `${f} must not reach the fresh rail`);
  }
  const optimizer = read("server/itinerary-optimizer.ts");
  assert.equal((optimizer.match(/startPaidRunFreshFetch\(/g) ?? []).length, 1, "the optimizer starts exactly one pass per run");
  // The start sits inside the recorded-run branch and is given the run's own basis.
  const at = optimizer.indexOf("startPaidRunFreshFetch(");
  assert.ok(optimizer.lastIndexOf("recordOptimizerRun(runRecord", at) !== -1, "the pass starts after the run is recorded");
  assert.match(optimizer.slice(at, at + 200), /basis: runRecord\.basis/);
  assert.equal(paidRunMayFreshFetch({ basis: "paid", runId: "r", tripId: "t" }), true);
});

test("F2: a Trip Pass run, a free re-run, an unrecorded run and a plan-less run never call it", async () => {
  for (const over of [{ basis: "trip_pass" as const }, { basis: "free_rerun" as const }, { basis: "paid" as const, runId: null }, { basis: "paid" as const, tripId: null }]) {
    const f = fakeDeps();
    const s = await runPaidRunFreshFetch({ ...base, basis: "paid", ...over }, f.deps);
    assert.equal(f.calls.length, 0, JSON.stringify(over));
    assert.equal(f.loads(), 0, "not even the plan is read");
    assert.equal(s.ran, false);
    assert.equal(startPaidRunFreshFetch({ ...base, basis: "paid", ...over }, f.deps), false);
  }
});

test("F3: a paid run makes one pass — each located, in-window plan item once, under the paid_run basis", async () => {
  const f = fakeDeps();
  const s = await runPaidRunFreshFetch({ ...base, basis: "paid" }, f.deps);
  assert.equal(f.loads(), 1, "the plan is read once per run");
  assert.deepEqual(f.calls.map((c) => c.itemId), ["a", "b"]);
  for (const c of f.calls) assert.deepEqual(c.ctx, { kind: "paid_run", tripId: "trip-1", runId: "run-1", actorId: "u-1" });
  assert.deepEqual(s, { ran: true, attempted: 2, recorded: 2, stoppedBy: null });
});

test("F4: unlocated, out-of-window, duplicate and foreign ids are skipped; unreadable dates select nothing", () => {
  assert.deepEqual(selectPaidRunItems([...base.baselineItems, base.baselineItems[0]], base.startDate, base.endDate), ["a", "b", "z"]);
  assert.deepEqual(selectPaidRunItems(base.baselineItems, "not-a-date", base.endDate), []);
  assert.deepEqual(selectPaidRunItems(base.baselineItems, "2026-11-03", "2026-11-01"), []);
});

test("F5: a plan-cap refusal ends the pass", async () => {
  const f = fakeDeps({ a: "plan_cap_reached" });
  const s = await runPaidRunFreshFetch({ ...base, basis: "paid" }, f.deps);
  assert.deepEqual(f.calls.map((c) => c.itemId), ["a"]);
  assert.equal(s.stoppedBy, "plan_cap_reached");
});

test("F6: a failing lookup never throws out of the pass", async () => {
  const f = fakeDeps();
  f.deps.fetchItem = async () => { throw new Error("tavily down"); };
  const s = await runPaidRunFreshFetch({ ...base, basis: "paid" }, f.deps);
  assert.equal(s.ran, true);
  assert.equal(s.recorded, 0);
  assert.equal(startPaidRunFreshFetch({ ...base, basis: "paid" }, f.deps), true);
});
