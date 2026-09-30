/**
 * version-options.test.ts — Track A step A7, ledger `2026-09-30-a7-version-per-option` (§M5 / §F2 /
 * R128). S1–S4 pin the version slots (one each; two ⇒ a third on the better fit; more than three ⇒
 * top three by plan-fit, the rest "not run"; unscored last). B1–B3 pin the EARNED badges (strict
 * winner only; a tie or a missing metric earns nothing). P1–P2 pin the pick carried in
 * `metadata.optionId` and the not-run list.
 *
 * STATED NEGATIVE SPACE (§18d): pure rules only — the run, the choose write and the adopt rails are
 * proven by server/__tests__/version-per-option.db.test.ts against a running server.
 *
 * Run: npx tsx --test shared/__tests__/version-options.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { earnedBadges, notRunOptionIds, optionPickOf, versionOptionId, versionOptionSlots } from "../version-options";

const opt = (id: string, fitRank: number | null, position: number) => ({ id, fitRank, position });

test("S1: three options — one version each, easiest first", () => {
  assert.deepEqual(versionOptionSlots([opt("c", 3, 0), opt("a", 1, 1), opt("b", 2, 2)]), { slots: ["a", "b", "c"], notRun: [] });
});

test("S2: two options — one each plus a third on the better-fitting one", () => {
  assert.deepEqual(versionOptionSlots([opt("x", 2, 0), opt("y", 1, 1)]), { slots: ["y", "x", "y"], notRun: [] });
});

test("S3: more than three — the top three by plan-fit; the rest listed 'not run', never dropped", () => {
  const r = versionOptionSlots([opt("a", 4, 0), opt("b", 1, 1), opt("c", null, 2), opt("d", 2, 3), opt("e", 3, 4)]);
  assert.deepEqual(r.slots, ["b", "d", "e"]);
  assert.deepEqual(r.notRun, ["a", "c"], "unscored ranks last");
});

test("S4: one option — all three on it; none — no slots", () => {
  assert.deepEqual(versionOptionSlots([opt("only", null, 0)]).slots, ["only", "only", "only"]);
  assert.deepEqual(versionOptionSlots([]), { slots: [], notRun: [] });
});

test("B1: each metric's strict winner earns its badge", () => {
  const b = earnedBadges([
    { id: "v1", totalCost: 300, totalTravelTime: 90, averageRating: 4.2 },
    { id: "v2", totalCost: 250, totalTravelTime: 120, averageRating: 4.0 },
    { id: "v3", totalCost: 400, totalTravelTime: 110, averageRating: 4.8 },
  ]);
  assert.deepEqual(b, { v1: ["Least travel"], v2: ["Lowest cost"], v3: ["Best rated"] });
});

test("B2: a tie earns nothing; a missing metric earns nothing", () => {
  const b = earnedBadges([
    { id: "v1", totalCost: 200, totalTravelTime: null, averageRating: 4.5 },
    { id: "v2", totalCost: 200, totalTravelTime: 100, averageRating: 4.5 },
    { id: "v3", totalCost: 250, totalTravelTime: null, averageRating: null },
  ]);
  assert.deepEqual(b, { v1: [], v2: [], v3: [] }, "cost and rating tie; travel has one measured version");
});

test("B3: one version alone wins nothing — a badge needs a comparison", () => {
  assert.deepEqual(earnedBadges([{ id: "v1", totalCost: 1, totalTravelTime: 1, averageRating: 5 }]), { v1: [] });
});

test("P1: the pick is read from metadata only when it names both an option and a set", () => {
  assert.deepEqual(optionPickOf({ optionId: "o1", setId: "s1" }), { optionId: "o1", setId: "s1" });
  assert.equal(optionPickOf({ optionId: "o1" }), null);
  assert.equal(optionPickOf(null), null);
  assert.equal(optionPickOf("o1"), null);
  assert.deepEqual(versionOptionId([{ metadata: {} }, { metadata: { optionId: "o2", setId: "s1" } }]), { optionId: "o2", setId: "s1" });
  assert.equal(versionOptionId([{ metadata: {} }]), null, "no pick ⇒ the set stays undecided");
});

test("P2: not run = the set's options no version names", () => {
  assert.deepEqual(notRunOptionIds(["a", "b", "c", "d"], ["a", "b", null, "a"]), ["c", "d"]);
});
