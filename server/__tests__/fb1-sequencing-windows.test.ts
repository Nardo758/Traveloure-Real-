/**
 * FB-1 step 3b (ledger `2026-10-18-fb1-sequencing-windows`): sequencing honours the model's start times and the draft's
 * retime windows instead of re-timing every day from 08:00.
 *   P1  with no model times and no windows, spaceDayTimesHonouring equals spaceDayTimes(…, 480) on representative days
 *   P2  reorderDayActivities on stops with no start times returns byte-for-byte what it returned BEFORE the change
 *       (GOLDEN, captured on the pre-change code)
 *   P3  a model time later than the cursor is kept; one earlier than the cursor is pushed to the cursor
 *   P4  a window's notBefore pushes a stop later; a notAfter it cannot meet leaves it late (the gate catches it)
 *   P6  the draft's retime fixes become one window per draft item (latest notBefore, earliest notAfter)
 *   (P5, through the paid run, is server/__tests__/fb1-version-gate.db.test.ts E2.)
 *
 * Run: npx tsx --test server/__tests__/fb1-sequencing-windows.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as seq from "../services/smart-sequencing.service";

const DAYS: Array<Array<{ name: string; serviceType: string; duration?: number }>> = [
  [{ name: "Solo", serviceType: "activities", duration: 90 }],
  [{ name: "Temple", serviceType: "sightseeing", duration: 60 }, { name: "Lunch", serviceType: "dining", duration: 75 }],
  [{ name: "Museum", serviceType: "tours" }, { name: "Market", serviceType: "shopping", duration: 45 }, { name: "Dinner", serviceType: "dining", duration: 120 }],
  [
    { name: "Hike", serviceType: "adventure", duration: 180 }, { name: "Spa", serviceType: "wellness", duration: 90 },
    { name: "Cafe", serviceType: "dining", duration: 30 }, { name: "Show", serviceType: "entertainment", duration: 150 },
  ],
  [
    { name: "A", serviceType: "activities", duration: 20 }, { name: "B", serviceType: "activities" }, { name: "C", serviceType: "activities", duration: 200 },
    { name: "D", serviceType: "dining", duration: 60 }, { name: "E", serviceType: "nightlife", duration: 120 }, { name: "F", serviceType: "tours", duration: 60 },
  ],
];
const asActs = (d: (typeof DAYS)[number]) => d.map((a) => ({ ...a, dayNumber: 1 })) as seq.SequencedActivity[];

test("P0 capture", { skip: process.env.FB1_CAPTURE !== "1" }, () => {
  console.log(`GOLDEN ${JSON.stringify(DAYS.map((d) => seq.reorderDayActivities(asActs(d)).activities.map((a) => [a.name, a.startTime, a.endTime, a.timeSlot])))}`);
});

/** Captured on the pre-change code (`spaceDayTimes(…, 8 * 60)` in step 4). */
const GOLDEN = [[["Solo",null,null,null]],[["Temple","08:00","09:00","morning"],["Lunch","09:30","10:45","morning"]],[["Dinner","08:00","10:00","morning"],["Museum","10:30","11:30","morning"],["Market","12:00","12:45","afternoon"]],[["Cafe","08:00","08:30","morning"],["Show","09:00","11:30","morning"],["Hike","12:00","15:00","afternoon"],["Spa","15:30","17:00","afternoon"]],[["A","08:00","08:20","morning"],["B","08:50","09:50","morning"],["C","10:20","13:40","morning"],["D","14:10","15:10","afternoon"],["F","15:40","16:40","afternoon"],["E","17:10","19:10","evening"]]];

test("P1 no model times, no windows: the honouring spacer is spaceDayTimes(…, 480)", () => {
  for (const d of DAYS) {
    const acts = asActs(d);
    assert.deepEqual(seq.spaceDayTimesHonouring(acts), seq.spaceDayTimes(acts, 480));
    assert.deepEqual(seq.spaceDayTimesHonouring(acts, { modelStart: () => null, windowFor: () => null }), seq.spaceDayTimes(acts, 480));
  }
});

test("P2 reorderDayActivities with no start times is unchanged (golden)", () => {
  assert.deepEqual(DAYS.map((d) => seq.reorderDayActivities(asActs(d)).activities.map((a) => [a.name, a.startTime ?? null, a.endTime ?? null, a.timeSlot ?? null])), GOLDEN);
});

test("P3 a later model time is kept; an earlier one is pushed to the cursor", () => {
  const out = seq.reorderDayActivities([
    { name: "Temple", serviceType: "sightseeing", duration: 60, dayNumber: 1, startTime: "09:30" },
    { name: "Show", serviceType: "entertainment", duration: 120, dayNumber: 1, startTime: "20:00" },
  ] as seq.SequencedActivity[]).activities.map((a) => [a.name, a.startTime, a.endTime]);
  assert.deepEqual(out, [["Temple", "09:30", "10:30"], ["Show", "20:00", "22:00"]], "both model times survive (today: 08:00 and 09:30)");
  const pushed = seq.spaceDayTimesHonouring(
    [{ name: "A", serviceType: "x", duration: 60, dayNumber: 1 }, { name: "B", serviceType: "x", duration: 60, dayNumber: 1 }] as seq.SequencedActivity[],
    { modelStart: (a) => (a.name === "A" ? "07:00" : "08:15") },
  ).map((a) => [a.name, a.startTime]);
  assert.deepEqual(pushed, [["A", "08:00"], ["B", "09:30"]], "never earlier than the cursor: 07:00 → 08:00, 08:15 → after A + 30");
});

test("P4 notBefore pushes later; a notAfter it cannot meet is left late", () => {
  const acts = [
    { name: "Temple", serviceType: "sightseeing", duration: 60, dayNumber: 1, sourceItemId: "t" },
    { name: "Market", serviceType: "shopping", duration: 60, dayNumber: 1, sourceItemId: "m" },
  ] as seq.SequencedActivity[];
  const windows = new Map([["t", { notBeforeMin: 9 * 60 }], ["m", { notAfterMin: 9 * 60 }]]);
  const out = seq.spaceDayTimesHonouring(acts, { windowFor: (a) => windows.get(a.sourceItemId ?? "") ?? null }).map((a) => [a.name, a.startTime]);
  assert.deepEqual(out, [["Temple", "09:00"], ["Market", "10:30"]], "the Market cannot start by 09:00 after the Temple and is not squeezed");
});

test("P6 the draft's retime fixes become one window per draft item; several combine", async () => {
  const { retimeWindowsByItem } = await import("@shared/version-check");
  const fix = (itemId: string, f: Record<string, number>) => ({ type: "closed_on_arrival", day: 1, stop: { itemId, title: itemId }, why: "before_opening", source: { kind: "fact", url: null, provenance: null }, checkedAt: null, fix: { action: "retime", itemId, day: 1, ...f } }) as any;
  const w = retimeWindowsByItem([
    fix("t", { notBeforeMin: 540 }),
    fix("t", { notBeforeMin: 600, notAfterMin: 900 }),
    fix("t", { notAfterMin: 840 }),
    { ...fix("d", {}), stop: null, fix: { action: "reorder_day", day: 1 } },
  ]);
  assert.deepEqual(Object.fromEntries(w), { t: { notBeforeMin: 600, notAfterMin: 840 } }, "latest notBefore, earliest notAfter; a day fix has no window");
});
