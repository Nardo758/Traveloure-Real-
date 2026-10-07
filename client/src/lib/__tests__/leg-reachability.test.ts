/**
 * Slice A2 — reachability reads the plan's own legs (ledger `2026-10-05-reachability-from-legs`).
 *   R1 a leg longer than the gap the draft leaves is unreachable; one that fits is not
 *   R2 the gap is read from the stop's end time, else its start + stated duration, else start only —
 *      never an invented activity length
 *   R3 a pair with no leg, no leg minutes, a cross-day leg or an unparseable time is NOT checked and
 *      never called reachable
 *   R4 the finding counts unique stops and the days they sit on; the Finish line reads only it
 *   R5 the clock parser reads 24h and AM/PM and refuses junk
 *   R6 step 9b: the finding drops "est." only when every leg it counts is routed
 *
 * Pure. Run: npx tsx --test client/src/lib/__tests__/leg-reachability.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { legUnreachableFinding, unreachableStops, wallClockMinutes } from "@shared/leg-reachability";
import { findingLine, freeFindingsPromptLine, leadFindings, unreachableStopLines } from "@shared/optimizer-lead";

const item = (id: string, startTime: string | null, extra: Record<string, unknown> = {}) => ({ id, title: id.toUpperCase(), dayNumber: 1, startTime, ...extra });
const leg = (id: string, from: string, to: string, minutes: number | null, dayNumber = 1) => ({ id, dayNumber, fromActivityId: from, toActivityId: to, estimatedDurationMinutes: minutes });

describe("R1/R2 the gap and the leg", () => {
  it("end time: 10:30 → 10:45 leaves 15 min; a 42 min leg can't make it, a 10 min one can", () => {
    const items = [item("a", "09:00", { endTime: "10:30" }), item("b", "10:45")];
    const bad = unreachableStops(items, [leg("L", "a", "b", 42)]);
    assert.equal(bad.checked, 1);
    assert.deepEqual(bad.unreachable.map((u) => [u.toItemId, u.gapMinutes, u.shortByMinutes, u.basis]), [["b", 15, 27, "end_time"]]);
    assert.equal(unreachableStops(items, [leg("L", "a", "b", 10)]).unreachable.length, 0);
  });
  it("no end time: start + the stop's own duration", () => {
    const items = [item("a", "09:00", { durationMinutes: 90 }), item("b", "10:45")];
    const r = unreachableStops(items, [leg("L", "a", "b", 20)]);
    assert.deepEqual(r.unreachable.map((u) => [u.gapMinutes, u.basis]), [[15, "duration"]]);
  });
  it("start only: the leg alone must not outrun the two starts", () => {
    const items = [item("a", "09:00"), item("b", "09:30")];
    assert.equal(unreachableStops(items, [leg("L", "a", "b", 25)]).unreachable.length, 0, "25 min fits 30");
    assert.deepEqual(unreachableStops(items, [leg("L", "a", "b", 40)]).unreachable.map((u) => u.basis), ["start_only"]);
  });
});

describe("R3 unchecked is never 'reachable'", () => {
  it("skips what it cannot read", () => {
    const items = [item("a", "09:00", { endTime: "10:30" }), item("b", "10:45"), item("c", null), { ...item("d", "11:00"), dayNumber: 2 }];
    const r = unreachableStops(items, [
      leg("noMinutes", "a", "b", null),
      leg("zero", "a", "b", 0),
      leg("noTime", "b", "c", 300),
      leg("crossDay", "b", "d", 300),
      leg("ghost", "a", "zzz", 300),
    ]);
    assert.deepEqual(r, { unreachable: [], checked: 0 });
  });
});

describe("R4 the finding and the Finish line", () => {
  it("counts unique stops and days; the line reads only this finding", () => {
    const items = [item("a", "09:00", { endTime: "10:30" }), item("b", "10:45"), item("c", "10:50")];
    const r = unreachableStops(items, [leg("L1", "a", "b", 42), leg("L2", "a", "b", 50), leg("L3", "b", "c", 30)]);
    const f = legUnreachableFinding(r.unreachable)!;
    assert.deepEqual(f, {
      kind: "leg_unreachable",
      count: 2,
      days: [1],
      stops: [
        { itemId: "b", title: "B", day: 1 },
        { itemId: "c", title: "C", day: 1 },
      ],
      // Step 9b (ledger `2026-10-07-step9b-optimizer-and-rechecks`; D3 amendment): legs that do not say
      // they are routed are not, so the finding is "est.".
      routed: false,
      est: true,
    });
    const findings = leadFindings([{ kind: "closed_on_arrival", count: 3, days: [2] }, f]);
    assert.equal(findings[0].kind, "leg_unreachable", "a travel-time problem reads first");
    assert.equal(freeFindingsPromptLine(findings), "2 stops may not be reachable in time · Add travel times");
    // S12-4: the Finish card names them, one line each with its day.
    assert.deepEqual(unreachableStopLines(findings), ["Day 1 · B", "Day 1 · C"]);
    assert.deepEqual(unreachableStopLines([{ kind: "closed_on_arrival", count: 1, days: [1] }]), []);
    assert.equal(legUnreachableFinding([]), null);
  });
});

describe("R5 wallClockMinutes", () => {
  it("reads 24h, seconds and AM/PM; refuses junk", () => {
    assert.equal(wallClockMinutes("09:30"), 570);
    assert.equal(wallClockMinutes("21:05:00"), 1265);
    assert.equal(wallClockMinutes("9:30 PM"), 1290);
    assert.equal(wallClockMinutes("12:15 AM"), 15);
    for (const bad of [null, "", "25:00", "9", "noon", "13:00 PM"]) assert.equal(wallClockMinutes(bad as any), null, String(bad));
  });
});

describe("R6 step 9b — the finding drops est. only when every leg it counts is routed", () => {
  it("all routed ⇒ routed, no est., no (est.) in the words; one unrouted leg ⇒ est.", () => {
    const items = [item("a", "09:00", { endTime: "10:30" }), item("b", "10:45"), item("c", "10:50")];
    const routedLeg = (id: string, from: string, to: string, m: number) => ({ ...leg(id, from, to, m), routed: true });
    const all = legUnreachableFinding(unreachableStops(items, [routedLeg("L1", "a", "b", 42), routedLeg("L3", "b", "c", 30)]).unreachable)!;
    assert.equal(all.routed, true);
    assert.equal(all.est, undefined);
    assert.equal(findingLine(all as any), "2 stops can't be reached in time with the plan's travel times");
    const mixed = legUnreachableFinding(unreachableStops(items, [routedLeg("L1", "a", "b", 42), leg("L3", "b", "c", 30)]).unreachable)!;
    assert.equal(mixed.routed, false);
    assert.equal(mixed.est, true);
    assert.equal(findingLine(mixed as any), "2 stops can't be reached in time with the plan's travel times (est.)");
  });
});
