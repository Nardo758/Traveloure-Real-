/**
 * 9b-d (Leon's ruling, Oct 17, 2026): the engine's straight-line stand-in for a pair the router says has no
 * route reads "est." on the slip; every other unrouted leg (an expert's own minutes) reads as before.
 *   SE1 the leg view marks the estimate; an expert's unrouted leg carries no mark
 *   SE2 the line says "est." only for the estimate
 *
 * Run: npx tsx --test client/src/lib/__tests__/slip-legs-estimate.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { slipLegBetween, unroutedLegLine } from "../slip-legs";

const day = (reason: string | null) => ({
  dayNumber: 1,
  activities: [{ id: "a" }, { id: "b" }],
  transports: [{ id: "L", fromActivityId: "a", toActivityId: "b", recommendedMode: "driving", estimatedDurationMinutes: 18, alternativeModes: reason ? [{ reason }] : [] }],
});

test("SE1: the leg view marks the engine's straight-line estimate, and nothing else", () => {
  assert.deepEqual(slipLegBetween([day("straight_line_est")] as any, "a", "b"), { kind: "unrouted", legId: "L", mode: "drive", minutes: 18, estimate: true });
  assert.deepEqual(slipLegBetween([day(null)] as any, "a", "b"), { kind: "unrouted", legId: "L", mode: "drive", minutes: 18 });
});

test("SE2: the line says est. only for the estimate", () => {
  assert.equal(unroutedLegLine("drive", 18, true), "18 min · drive · est.");
  assert.equal(unroutedLegLine("drive", 18), "18 min · drive");
  assert.equal(unroutedLegLine(null, 18, true), "18 min · est.");
});
