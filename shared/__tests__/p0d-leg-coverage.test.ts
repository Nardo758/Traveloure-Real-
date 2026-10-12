/**
 * P0-d item 1 — the all-clear is earned by the legs (ledger `2026-10-12-p0d-coverage-bridges`).
 *
 *   CV1 the 330f594a shape: routed bridges around 8 unlocated stops ⇒ not complete, 8 listed, the line counts 8
 *   CV2 every pair routed, every stop on the map ⇒ complete, no line (the all-clear is earned)
 *   CV3 every stop on the map, one pair unrouted ⇒ "Some travel times aren't checked yet" alone, never "0 stops"
 *   CV4 a free plan never gets the all-clear — "Travel times come with Optimize"
 *   CV5 a past day is not judged; one unlocated stop reads "1 stop isn't on the map"
 *
 * Run: npx tsx --test shared/__tests__/p0d-leg-coverage.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SOME_TRAVEL_TIMES_UNCHECKED,
  TRAVEL_TIMES_COME_WITH_OPTIMIZE,
  leadCoverageLine,
  planLegCoverage,
  unlocatedStopLines,
} from "../optimizer-lead";

const notPast = () => false;
const stop = (id: string, dayNumber: number, located = true) => ({ id, title: `Stop ${id}`, dayNumber, located });
const leg = (dayNumber: number, fromId: string, toId: string, routed = true) => ({ dayNumber, fromId, toId, routed });

describe("P0-d item 1 — leg coverage gates the all-clear", () => {
  it("CV1 routed bridges + 8 gaps ⇒ no all-clear; the 8 stops are counted and listed", () => {
    // Day 1: A u1 u2 B u3 C; Day 2: D u4 u5 u6 E u7 u8 F — the engine bridges A→B, B→C, D→E, E→F.
    const stops = [
      stop("A", 1), stop("u1", 1, false), stop("u2", 1, false), stop("B", 1), stop("u3", 1, false), stop("C", 1),
      stop("D", 2), stop("u4", 2, false), stop("u5", 2, false), stop("u6", 2, false), stop("E", 2), stop("u7", 2, false), stop("u8", 2, false), stop("F", 2),
    ];
    const legs = [leg(1, "A", "B"), leg(1, "B", "C"), leg(2, "D", "E"), leg(2, "E", "F")];
    const cov = planLegCoverage(stops, legs, notPast);
    assert.equal(cov.complete, false);
    assert.equal(cov.unlocated.length, 8);
    assert.equal(leadCoverageLine(cov, true), `${SOME_TRAVEL_TIMES_UNCHECKED} — 8 stops aren't on the map`);
    assert.deepEqual(unlocatedStopLines(cov).slice(0, 2), ["Day 1 · Stop u1", "Day 1 · Stop u2"]);
    assert.equal(unlocatedStopLines(cov).at(-1), "Day 2 · Stop u8");
  });

  it("CV2 every pair routed and on the map ⇒ complete; the all-clear is earned (no line)", () => {
    const cov = planLegCoverage([stop("A", 1), stop("B", 1), stop("C", 1), stop("D", 2)], [leg(1, "A", "B"), leg(1, "B", "C")], notPast);
    assert.deepEqual(cov, { complete: true, unlocated: [] });
    assert.equal(leadCoverageLine(cov, true), null);
  });

  it("CV3 all on the map but a pair unrouted ⇒ the unchecked line alone, never a zero count", () => {
    const cov = planLegCoverage([stop("A", 1), stop("B", 1), stop("C", 1)], [leg(1, "A", "B"), leg(1, "B", "C", false)], notPast);
    assert.equal(cov.complete, false);
    const line = leadCoverageLine(cov, true);
    assert.equal(line, SOME_TRAVEL_TIMES_UNCHECKED);
    assert.doesNotMatch(line!, /\b0 stops?\b/);
  });

  it("CV4 a free plan never gets the all-clear", () => {
    const cov = planLegCoverage([stop("A", 1), stop("B", 1)], [leg(1, "A", "B")], notPast);
    assert.equal(leadCoverageLine(cov, false), TRAVEL_TIMES_COME_WITH_OPTIMIZE);
  });

  it("CV5 a past day is not judged; one stop off the map reads in the singular", () => {
    const stops = [stop("A", 1), stop("x", 1, false), stop("B", 1), stop("C", 2), stop("y", 2, false), stop("D", 2)];
    const cov = planLegCoverage(stops, [leg(2, "C", "D")], (day) => day === 1);
    assert.equal(cov.unlocated.length, 1);
    assert.equal(leadCoverageLine(cov, true), `${SOME_TRAVEL_TIMES_UNCHECKED} — 1 stop isn't on the map`);
  });
});
