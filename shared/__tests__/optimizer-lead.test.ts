/**
 * What Optimize found in this draft (surface step 4, spec v1.2 §8; R-f, R-v; ledger
 * `2026-10-03-surface-step4-optimizer-lead`) — the pure findings, on the stored smoke-6 plan.
 *   O1 closed_on_arrival on smoke 6: its 12 Google hours facts yield 3 stops reached closed
 *      (Kinkaku-ji 08:30 < 09:00, Ginkaku-ji 17:00 at its 17:00 close, Tōfuku-ji 08:30 < 09:00) on
 *      days 2, 4, 5 — with the R-v caveat, because the fixture's facts record no checkedAt
 *   O2 R-v caveat: hours read within 14 days of the trip carry none; older (or unknown) carry it
 *   O3 R-p: a whole "Closed" day counts only from an official source; from Places it is omitted
 *   O4 timed_entry_conflict through the ONE anchor-overlap rule
 *   O5 city_crossing: a day zig-zagging north–south more than once (est.); smoke 6 has none
 *   O6 walking_saved_km on smoke 6 (est.), only from 1 km; and it is a total — never an order
 *   O7 pace_over from the plan's energy rows; no rows ⇒ none
 *   O8 order and cap: problems first, then gains, at most three; zero findings ⇒ an empty list
 *   O9 the cost delta line: only after a run, only with a priced item, never a range
 *   O10 parseDayHours: Google's narrow spaces, inherited meridiem, several ranges, 24h, Closed
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOURS_CAVEAT,
  anchorConflicts,
  cityCrossings,
  closedOnArrival,
  findingLine,
  leadDeltaLine,
  leadFindings,
  paceOver,
  parseDayHours,
  timedEntryConflicts,
  walkingSavedKm,
  type HoursFact,
} from "../optimizer-lead";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const smoke6 = JSON.parse(readFileSync(path.join(repo, "server/__tests__/fixtures/smoke6-plancard.json"), "utf8"));
const items = smoke6.days.flatMap((d: any) => d.activities.map((a: any) => ({ id: a.id, dayNumber: d.dayNum, dateIso: d.dateIso, startTime: a.startTime })));
const hours = new Map<string, HoursFact>();
for (const [id, fs] of Object.entries<any>(smoke6.placeFacts)) for (const f of fs) if (f.factType === "hours") hours.set(id, { weekdayDescriptions: f.value.weekdayDescriptions, checkedAt: f.checkedAt ?? null });
const days = smoke6.days.map((d: any) => ({ dayNumber: d.dayNum, points: d.activities.filter((a: any) => a.lat != null).map((a: any) => ({ lat: a.lat, lng: a.lng })) }));

test("O1 smoke 6: 12 hours facts ⇒ 3 stops reached closed, days 2/4/5, with the caveat", () => {
  assert.equal(hours.size, 12);
  const f = closedOnArrival(items, hours, smoke6.trip.startDate)!;
  assert.equal(f.count, 3);
  assert.deepEqual(f.days, [2, 4, 5]);
  assert.equal(f.caveat, HOURS_CAVEAT);
});

test("O2 R-v: fresh hours carry no caveat; stale or unknown carry it", () => {
  const it = [{ id: "x", dayNumber: 1, dateIso: "2026-11-12", startTime: "08:00" }];
  const desc = ["Thursday: 9:00 AM – 5:00 PM"];
  const fresh = closedOnArrival(it, new Map([["x", { weekdayDescriptions: desc, checkedAt: "2026-11-05T00:00:00Z" }]]), "2026-11-12")!;
  assert.equal(fresh.caveat, undefined);
  const old = closedOnArrival(it, new Map([["x", { weekdayDescriptions: desc, checkedAt: "2026-10-01T00:00:00Z" }]]), "2026-11-12")!;
  assert.equal(old.caveat, HOURS_CAVEAT);
  assert.equal(old.count, 1, "stale hours still count (R-v)");
});

test("O3 R-p: a Closed day counts only from an official source", () => {
  const it = [{ id: "x", dayNumber: 1, dateIso: "2026-11-09", startTime: "10:00" }]; // a Monday
  const desc = ["Monday: Closed"];
  assert.equal(closedOnArrival(it, new Map([["x", { weekdayDescriptions: desc, checkedAt: null }]]), "2026-11-09"), null);
  assert.equal(closedOnArrival(it, new Map([["x", { weekdayDescriptions: desc, checkedAt: null, official: true }]]), "2026-11-09")!.count, 1);
});

test("O4 timed-entry conflicts through the one overlap rule", () => {
  const anchors = [{ id: "a", anchorType: "flight_departure", anchorDatetime: "2026-11-15T14:00:00", bufferBefore: 180, bufferAfter: 0 }];
  const sched = [
    { title: "Byodo-in", dayNumber: 5, date: "2026-11-15", startTime: "12:00" },
    { title: "Breakfast", dayNumber: 5, date: "2026-11-15", startTime: "08:00" },
  ];
  assert.equal(anchorConflicts(anchors, sched).length, 1);
  assert.deepEqual(timedEntryConflicts(anchors, sched), { kind: "timed_entry_conflict", count: 1, days: [5] });
  assert.equal(timedEntryConflicts([], sched), null);
});

test("O5 city crossings (est.); smoke 6 has none", () => {
  assert.equal(cityCrossings(days), null);
  const zig = [{ dayNumber: 2, points: [{ lat: 35.05, lng: 135.76 }, { lat: 34.96, lng: 135.76 }, { lat: 35.05, lng: 135.76 }, { lat: 34.96, lng: 135.76 }] }];
  assert.deepEqual(cityCrossings(zig), { kind: "city_crossing", count: 1, days: [2], est: true });
});

test("O6 walking saved on smoke 6 (est.) — a total, not an order", () => {
  const w = walkingSavedKm(days)!;
  assert.equal(w.kind, "walking_saved_km");
  assert.equal(w.count, 4);
  assert.equal(w.est, true);
  assert.deepEqual(Object.keys(w).sort(), ["count", "days", "est", "kind"]);
  assert.equal(walkingSavedKm([{ dayNumber: 1, points: [{ lat: 35, lng: 135.7 }, { lat: 35.001, lng: 135.7 }, { lat: 35.002, lng: 135.7 }] }]), null, "under 1 km is not shown");
});

test("O7 pace from the plan's energy rows", () => {
  assert.deepEqual(paceOver([{ dayNumber: 3, recoveryNeeded: true }, { dayNumber: 1, recoveryNeeded: false }]), { kind: "pace_over", count: 1, days: [3] });
  assert.equal(paceOver([]), null);
});

test("O8 order and cap; zero findings is an empty list", () => {
  const list = leadFindings([
    { kind: "pace_over", count: 1, days: [1] },
    { kind: "walking_saved_km", count: 4, days: [1], est: true },
    null,
    { kind: "city_crossing", count: 2, days: [1, 2], est: true },
    { kind: "closed_on_arrival", count: 3, days: [2] },
  ]);
  assert.deepEqual(list.map((f) => f.kind), ["closed_on_arrival", "city_crossing", "walking_saved_km"]);
  assert.deepEqual(leadFindings([null, null]), []);
  assert.equal(findingLine({ kind: "closed_on_arrival", count: 3, days: [] }), "3 stops are reached when they're closed");
  assert.match(findingLine({ kind: "walking_saved_km", count: 4, days: [], est: true }), /\(est\.\)$/);
});

test("O9 the cost delta: after a run, with a priced item, never a range", () => {
  const fmt = (a: number) => `$${a.toFixed(2)}`;
  assert.equal(leadDeltaLine({ hasPricedItems: true, realised: null, formatMoney: fmt }), null, "no delta before a run");
  assert.equal(leadDeltaLine({ hasPricedItems: false, realised: { savings: 40 }, formatMoney: fmt }), null, "no priced item ⇒ no line");
  assert.equal(leadDeltaLine({ hasPricedItems: true, realised: { savings: 40, savingsPercent: 12.4 }, formatMoney: fmt }), "After Optimize: $40.00 less than the draft (12%)");
  assert.equal(leadDeltaLine({ hasPricedItems: true, realised: { savings: -15 }, formatMoney: fmt }), "After Optimize: $15.00 more than the draft");
  assert.equal(leadDeltaLine({ hasPricedItems: true, realised: { savings: 0 }, formatMoney: fmt }), null);
});

test("O10 parseDayHours", () => {
  assert.deepEqual(parseDayHours(["Monday: 9:00 AM – 5:00 PM"], 1), { kind: "ranges", ranges: [[540, 1020]] });
  assert.deepEqual(parseDayHours(["Tuesday: 11:30 AM – 2:30 PM, 5:00 – 9:00 PM"], 2), { kind: "ranges", ranges: [[690, 870], [1020, 1260]] });
  assert.deepEqual(parseDayHours(["Sunday: Open 24 hours"], 0), { kind: "open24" });
  assert.deepEqual(parseDayHours(["Monday: Closed"], 1), { kind: "closed" });
  assert.equal(parseDayHours(["Monday: Closed"], 2), null, "no line for the day ⇒ nothing known");
});
