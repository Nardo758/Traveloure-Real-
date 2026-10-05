/**
 * L2-4 — the leg review stepper's pure rules (ledger `2026-10-05-leg-review-stepper`).
 *   R1 steps are the Workstation's own pairs, day by day: a leg row, a "locate" gap, or an "unrouted" gap
 *   R2 an unlocated stop is never placed: its pair is a locate step naming the stop(s), and the hop map
 *      returns no points for it
 *   R3 the stepper opens on a named leg, else the first step that still needs the author; "next" skips
 *      picked legs and the one just confirmed, and ends with null
 *   R4 the hop map fits two points in the box and separates identical points
 *   R5 edit controls: the author or a §12 WRITE advisor; pending / unknown / loading fail closed
 *
 * Pure — no DOM, no network. Run: npx tsx --test client/src/lib/__tests__/leg-review.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLegReviewSteps, firstReviewStep, hopMapPoints, located, nextOpenStep, workstationCanEdit } from "../leg-review";

const A = { id: "a", name: "Fushimi Inari", lat: 34.967, lng: 135.773 };
const B = { id: "b", name: "Tofuku-ji", lat: 34.976, lng: 135.774 };
const C = { id: "c", name: "Nishiki Market", lat: null, lng: null };
const D = { id: "d", name: "Kiyomizu-dera", lat: 34.995, lng: 135.785 };
const E = { id: "e", name: "Gion", lat: 35.004, lng: 135.775 };
const legAB = { id: "L1", dayNumber: 1, fromActivityId: "a", toActivityId: "b", picked: false };
const legDE = { id: "L2", dayNumber: 2, fromActivityId: "d", toActivityId: "e", picked: true };
const days = [
  { dayNum: 1, activities: [A, B, C] },
  { dayNum: 2, activities: [D, E, A] },
];

describe("R1/R2 steps", () => {
  const steps = buildLegReviewSteps(days, [legAB, legDE]);
  it("one step per consecutive pair, in the surface's order", () => {
    assert.deepEqual(steps.map((s) => [s.kind, s.from.id, s.to.id]), [
      ["leg", "a", "b"], ["locate", "b", "c"], ["leg", "d", "e"], ["unrouted", "e", "a"],
    ]);
  });
  it("a locate step names only the unlocated stop; its hop map has no points", () => {
    const s = steps[1];
    assert.equal(s.kind, "locate");
    assert.deepEqual(s.kind === "locate" ? s.unlocated.map((x) => x.id) : [], ["c"]);
    assert.equal(hopMapPoints(B, C, 300, 160), null);
    assert.equal(located({ lat: 0, lng: 0 }), false);
    assert.equal(located({ lat: Number.NaN, lng: 1 }), false);
  });
});

describe("R3 navigation", () => {
  const steps = buildLegReviewSteps(days, [legAB, legDE]);
  it("opens on a named leg, else the first step needing the author", () => {
    assert.equal(firstReviewStep(steps, "L2"), 2);
    assert.equal(firstReviewStep(steps), 0);
    assert.equal(firstReviewStep(steps, "nope"), 0);
    const allPicked = buildLegReviewSteps([{ dayNum: 2, activities: [D, E] }], [legDE]);
    assert.equal(firstReviewStep(allPicked), 0);
  });
  it("next skips picked legs and the one just confirmed; null at the end", () => {
    assert.equal(nextOpenStep(steps, 0, "L1"), 1);
    assert.equal(nextOpenStep(steps, 1), 3, "L2 is already picked");
    assert.equal(nextOpenStep(steps, 3), null);
  });
});

describe("R4 hop map", () => {
  it("both points inside the padded box, distinct", () => {
    const p = hopMapPoints(A, D, 300, 160, 24)!;
    for (const pt of [p.a, p.b]) {
      assert.ok(pt.x >= 23.99 && pt.x <= 276.01, `x ${pt.x}`);
      assert.ok(pt.y >= 23.99 && pt.y <= 136.01, `y ${pt.y}`);
    }
    assert.notDeepEqual(p.a, p.b);
    assert.ok(p.a.y > p.b.y, "north is up: the more northern stop sits higher");
  });
  it("identical points are drawn apart", () => {
    const p = hopMapPoints(A, A, 300, 160)!;
    assert.notDeepEqual(p.a, p.b);
  });
});

describe("R5 edit controls", () => {
  it("author and write-status advisors edit; pending, unknown and loading do not", () => {
    assert.equal(workstationCanEdit({ mode: "authoring" }), true);
    assert.equal(workstationCanEdit({ mode: "assignment", assignment: { status: "accepted" } }), true);
    assert.equal(workstationCanEdit({ mode: "assignment", assignment: { status: "assigned" } }), true);
    assert.equal(workstationCanEdit({ mode: "assignment", assignment: { status: "pending" } }), false);
    assert.equal(workstationCanEdit({ mode: "assignment", assignment: { status: "rejected" } }), false);
    assert.equal(workstationCanEdit({ mode: "assignment", assignment: null }), false);
    assert.equal(workstationCanEdit(undefined), false);
  });
});
