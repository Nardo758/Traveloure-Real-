/**
 * AP-1 (ledger `2026-10-13-ap1-save-then-warn`) — the pure half of save-then-warn.
 *
 *   AC1 a named hours finding carries the stop's own start time: "Ginkaku-ji Temple · Day 2 · 17:10 starts after closing (5:00 PM)"
 *   AC2 the way into the stop: unlocated end keeps the gap; "no route found" only with both ends located, the engine on and the window past
 *   AC3 a free plan reads the straight line; a shown leg wins; the day's first stop has nothing to reach from
 *   AC4 pending is the hours lookup or the leg still arriving — nothing else
 *   AC5 the PF-1 value sets carry the hand-add trigger and its two reasons
 *
 * Run: npx tsx --test shared/__tests__/ap1-add-checks.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { afterLastAdmission, closedOnArrival, closesBeforeVisitEnd, clock24, findingStopLines } from "../optimizer-lead";
import { stopChecksPending, stopReach, type ReachInput } from "../add-checks";
import { PLACE_LOOKUP_CAP_REASONS, PLACE_LOOKUP_SKIP_REASONS, PLACE_LOOKUP_TRIGGERS } from "../place-lookup-outcomes";

const ginkaku = { id: "g", title: "Ginkaku-ji Temple", dayNumber: 2, dateIso: "2027-01-12", startTime: "17:10" };
const winter = { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM", "Wednesday: 9:00 AM – 5:00 PM", "Thursday: 9:00 AM – 5:00 PM", "Friday: 9:00 AM – 5:00 PM", "Saturday: 9:00 AM – 5:00 PM", "Sunday: 9:00 AM – 5:00 PM"], checkedAt: "2027-01-10T00:00:00Z" };

test("AC1 the named findings carry the stop's start time", () => {
  const closed = closedOnArrival([ginkaku], new Map([["g", winter]]), "2027-01-11");
  assert.deepEqual(findingStopLines(closed!), ["Ginkaku-ji Temple · Day 2 · 17:10 starts after closing (5:00 PM)"]);
  const early = closesBeforeVisitEnd([{ ...ginkaku, startTime: "16:30", endTime: "17:30" }], new Map([["g", winter]]), "2027-01-11");
  assert.deepEqual(findingStopLines(early!), ["Ginkaku-ji Temple · Day 2 · 16:30 closes at 5:00 PM, before your visit ends"]);
  const entry = afterLastAdmission([ginkaku], new Map([["g", 16 * 60 + 30]]));
  assert.deepEqual(findingStopLines(entry!), ["Ginkaku-ji Temple · Day 2 · 17:10 arrives after last entry (4:30 PM)"]);
  // A hand-built stop with no start time keeps the old form.
  assert.deepEqual(findingStopLines({ kind: "closed_on_arrival", count: 1, days: [2], stops: [{ itemId: "g", title: "X", day: 2, reason: "closed_day" }] }), ["X · Day 2 is closed that day"]);
  assert.equal(clock24(9 * 60 + 5), "09:05");
  assert.equal(clock24(25 * 60), "01:00");
});

const base: ReachInput = {
  routedPlan: true,
  skip: null,
  prev: { title: "Kinkaku-ji", located: true },
  self: { title: "Ginkaku-ji Temple", located: true },
  leg: null,
  straight: null,
  withinWindow: false,
};

test("AC2 routed plan: the gap wording for an unlocated end; no route only when both located and the engine answered", () => {
  assert.deepEqual(stopReach({ ...base, self: { title: "Soba", located: false } }), { kind: "unlocated", stop: "Soba" });
  assert.deepEqual(stopReach({ ...base, prev: { title: "Soba", located: false } }), { kind: "unlocated", stop: "Soba" });
  assert.deepEqual(stopReach({ ...base, withinWindow: true }), { kind: "pending", from: "Kinkaku-ji" });
  assert.deepEqual(stopReach(base), { kind: "no_route", from: "Kinkaku-ji" });
  assert.deepEqual(stopReach({ ...base, skip: "engine_off" }), { kind: "engine_off" });
  assert.deepEqual(stopReach({ ...base, skip: "dates_not_confirmed", withinWindow: true }), { kind: "dates_not_confirmed" });
  assert.deepEqual(stopReach({ ...base, leg: { routedLine: "22 min · Drive", minutes: 22, mode: "drive" } }), { kind: "routed", from: "Kinkaku-ji", line: "22 min · Drive" });
  assert.deepEqual(stopReach({ ...base, leg: { routedLine: null, minutes: 15, mode: "walk" } }), { kind: "est", from: "Kinkaku-ji", minutes: 15, mode: "walk" });
});

test("AC3 free plan reads the straight line; nothing to reach from on the day's first stop", () => {
  const free = { ...base, routedPlan: false, straight: { minutes: 40, mode: "transit" as const } };
  assert.deepEqual(stopReach(free), { kind: "straight", from: "Kinkaku-ji", minutes: 40, mode: "transit" });
  assert.deepEqual(stopReach({ ...free, withinWindow: true }), { kind: "straight", from: "Kinkaku-ji", minutes: 40, mode: "transit" }, "a free plan never waits on the engine");
  assert.deepEqual(stopReach({ ...free, self: { title: "Soba", located: false } }), { kind: "unlocated", stop: "Soba" });
  assert.equal(stopReach({ ...base, prev: null }), null);
});

test("AC4 pending", () => {
  assert.equal(stopChecksPending({ hours: { status: "pending" }, reach: null }), true);
  assert.equal(stopChecksPending({ hours: { status: "checked", lines: [] }, reach: { kind: "pending", from: "A" } }), true);
  assert.equal(stopChecksPending({ hours: { status: "not_checked" }, reach: { kind: "no_route", from: "A" } }), false);
});

test("AC5 the PF-1 value sets", () => {
  assert.ok(PLACE_LOOKUP_TRIGGERS.includes("hand_add"));
  assert.ok(PLACE_LOOKUP_SKIP_REASONS.includes("official_fact"));
  assert.ok(PLACE_LOOKUP_CAP_REASONS.includes("plan_day_cap"));
});
