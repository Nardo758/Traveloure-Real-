/**
 * LG-2 Ask 6 (decision-maker, Oct 19, 2026; production evidence on 44cec3fe): a leg connects
 * ADJACENT stops only. If either end has no open coordinate, the leg exists with no time and reads "Travel time not
 * checked yet" — no estimate, no skip to the next located stop — and the day's check cannot pass with one.
 *
 *   A1 the skip case: located → no point → located gives NO leg from the first to the third; both adjacent pairs
 *      are reported (synthetic Kyoto fixture names)
 *   A2 the stay: a day whose first stop has no point gets no stay leg around it
 *   A3 the slip draws "Travel time not checked yet" for a reported pair, and nothing from an earlier stop
 *   A4 the day-check case: the plan check names the day as not checked for reachability, and the day line says so
 *   A5 no ride is derived across a stop with no point
 *
 * Run: npx tsx --test server/services/__tests__/lg2-ask6-adjacent-legs.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { desiredPlanLegs, type PlanStop } from "../routing/plan-legs";
import { checkPlan, feasibilityView, type PlanCheckInput, type PlanCheckStop } from "@shared/plan-check";
import { legNotCheckedDays } from "@shared/optimizer-lead";
import { feasibilityLine } from "@shared/plan-feasibility";
import { TRAVEL_TIME_NOT_CHECKED_LINE, slipLegBetween } from "../../../client/src/lib/slip-legs";

const P = (lat: number, lng: number) => ({ lat, lng });
const stop = (id: string, name: string, point: { lat: number; lng: number } | null, day = 1): PlanStop => ({
  id,
  name,
  dayNumber: day,
  point,
  startTime: null,
  endTime: null,
  durationMinutes: null,
});

// The shape the rule fixes (synthetic fixture): a located stop, a stop with no open point, a located stop.
const SOBA = stop("soba", "Soba Restaurant", P(34.9671, 135.7727));
const INARI = stop("inari", "Fushimi Inari", null);
const TOFUKU = stop("tofuku", "Tofuku-ji", P(34.9767, 135.7738));

describe("LG-2 Ask 6 — adjacent legs only", () => {
  it("A1 no leg skips a stop with no point; both adjacent pairs are reported", () => {
    const r = desiredPlanLegs([SOBA, INARI, TOFUKU], { stay: null, hasTransitCoverage: false });
    assert.deepEqual(r.legs.map((l) => `${l.from.id}>${l.to.id}`), [], "no Soba → Tofuku-ji leg around Fushimi Inari");
    assert.deepEqual(r.skipped.map((s) => `${s.fromItemId}>${s.toItemId}`), ["soba>inari", "inari>tofuku"]);
    // Located neighbours still get their own leg.
    const r2 = desiredPlanLegs([SOBA, TOFUKU, INARI], { stay: null, hasTransitCoverage: false });
    assert.deepEqual(r2.legs.map((l) => `${l.from.id}>${l.to.id}`), ["soba>tofuku"]);
    assert.deepEqual(r2.skipped.map((s) => `${s.fromItemId}>${s.toItemId}`), ["tofuku>inari"]);
  });

  it("A2 the stay connects to the day's first and last stop only — never around one with no point", () => {
    const stay = { ...stop("stay", "Hotel", P(35.0, 135.76)), point: P(35.0, 135.76) };
    const r = desiredPlanLegs([INARI, SOBA, TOFUKU], { stay, hasTransitCoverage: false });
    const legs = r.legs.map((l) => `${l.from.id}>${l.to.id}`);
    assert.ok(!legs.includes("stay>soba"), "the stay leg does not skip to the first located stop");
    assert.ok(legs.includes("soba>tofuku") && legs.includes("tofuku>stay"));
    assert.ok(r.skipped.some((s) => s.fromItemId === "stay" && s.toItemId === "inari"));
  });

  it("A3 the slip reads 'Travel time not checked yet' for a reported pair and draws nothing around the stop", () => {
    assert.equal(TRAVEL_TIME_NOT_CHECKED_LINE, "Travel time not checked yet");
    const days = [
      {
        dayNumber: 1,
        activities: [{ id: "soba" }, { id: "inari" }, { id: "tofuku" }],
        // A bridge leg left over from before Ask 6: it must not be drawn in the slot before Tofuku-ji.
        transports: [{ id: "old-bridge", fromActivityId: "soba", toActivityId: "tofuku", estimatedDurationMinutes: 14, mode: "drive" }],
        legsNotChecked: [
          { fromActivityId: "soba", toActivityId: "inari" },
          { fromActivityId: "inari", toActivityId: "tofuku" },
        ],
      },
    ];
    assert.deepEqual(slipLegBetween(days, "soba", "inari"), { kind: "not_checked", fromId: "soba", toId: "inari" });
    assert.deepEqual(slipLegBetween(days, "inari", "tofuku"), { kind: "not_checked", fromId: "inari", toId: "tofuku" });
    const noFlag = [{ ...days[0], legsNotChecked: [] }];
    assert.equal(slipLegBetween(noFlag, "inari", "tofuku"), null, "no time is guessed and no earlier stop's leg is drawn");
  });

  it("A4 the day check cannot pass with a leg that has no time", () => {
    const s = (id: string, point: { lat: number; lng: number } | null, day: number): PlanCheckStop => ({
      id,
      title: id,
      dayNumber: day,
      startTime: null,
      endTime: null,
      durationMinutes: null,
      point,
    });
    const input: PlanCheckInput = {
      tripStartIso: "2026-11-10",
      transitCoverage: false,
      // Day 1 has a stop with no point between two located ones; day 2 is fully located.
      stops: [s("soba", P(34.9671, 135.7727), 1), s("inari", null, 1), s("tofuku", P(34.9767, 135.7738), 1), s("a", P(35, 135.7), 2), s("b", P(35.01, 135.71), 2)],
      hours: new Map(),
      lastAdmission: new Map(),
      lastServices: [],
      anchors: [],
      legs: [],
      energy: [],
    };
    assert.deepEqual(legNotCheckedDays(input.stops.map((r) => ({ dayNumber: r.dayNumber, open: r.point }))), [1]);
    const result = checkPlan(input);
    const leg = result.notChecked.find((n) => n.kind === "leg_unreachable");
    assert.deepEqual(leg, { kind: "leg_unreachable", reason: "leg_not_checked", days: [1] }, "day 1 is not checked, never a pass");
    // The day line names it.
    const line = feasibilityLine({ stops: 3, hoursChecked: 3, lastEntryChecked: 3, rides: 0, ridesChecked: 0, legsNotChecked: 2 });
    assert.match(line ?? "", /travel time not checked for 2 legs/);
    assert.match(feasibilityLine({ stops: 2, hoursChecked: 0, lastEntryChecked: 0, rides: 0, ridesChecked: 0, legsNotChecked: 1 }) ?? "", /travel time not checked for 1 leg$/);
    // A fully located plan carries no such entry.
    const located = checkPlan({ ...input, stops: input.stops.filter((r) => r.point) });
    assert.equal(located.notChecked.some((n) => n.kind === "leg_unreachable"), false);
  });

  it("A5 no ride is derived across a stop with no point", () => {
    // Two stations far enough apart that the default-mode rule would pick transit.
    const input: PlanCheckInput = {
      tripStartIso: "2026-11-10",
      transitCoverage: true,
      stops: [
        { id: "a", title: "a", dayNumber: 1, startTime: "09:00", endTime: "10:00", durationMinutes: null, point: P(34.98, 135.75) },
        { id: "u", title: "u", dayNumber: 1, startTime: "11:00", endTime: "12:00", durationMinutes: null, point: null },
        { id: "c", title: "c", dayNumber: 1, startTime: "13:00", endTime: "14:00", durationMinutes: null, point: P(35.09, 135.68) },
      ],
      hours: new Map(),
      lastAdmission: new Map(),
      lastServices: [],
      anchors: [],
      legs: [],
      energy: [],
    };
    assert.deepEqual(feasibilityView(input).rides.map((r) => `${r.fromItemId}>${r.toItemId}`), []);
  });
});
