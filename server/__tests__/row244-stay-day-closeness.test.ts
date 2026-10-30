/**
 * Row 244 (ledger `2026-10-30-row244-stay-day-closeness`): each stay candidate carries a per-day closeness list from
 * the SAME computation as the "Close to N of M days" totals. No minutes or km leave where-to-stay; no address.
 *
 *   D1  one entry per located day, ordered, dayIndex = dayNumber − 1; the count of nearStops === true is closeDays
 *   D2  source is "routed" for the routed list and "straight_line" for the straight-line list
 *   D3  an entry carries exactly dayIndex, nearStops and source — no minutes, metres or km
 *   D4  no address field is added to the stay payload
 *   D5  the totals are unchanged; the stored pick carries the list and reads it back; a bad list reads as none
 *
 * Run: npx tsx --test server/__tests__/row244-stay-day-closeness.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  nextStayPick,
  readDayCloseness,
  readStayPick,
  stayDayCloseness,
  stayDayClosenessList,
  straightLineCloseness,
  straightLineDayCloseness,
  type StayPickStop,
} from "@shared/stay-pick";
import { stayCloseRoutedMinutes, stayCloseStraightKm } from "../config/stay-closeness.config";

const stops: StayPickStop[] = [
  { dayNumber: 1, lat: 35.0, lng: 135.76 },
  { dayNumber: 1, lat: 35.01, lng: 135.77 },
  { dayNumber: 3, lat: 35.2, lng: 135.9 },
  { dayNumber: 4, lat: 35.001, lng: 135.761 },
];

test("D1 one entry per located day; near count equals closeDays", () => {
  const T = stayCloseRoutedMinutes();
  const cost = (i: number) => (i === 2 ? T + 5 : i === 1 ? null : T - 1);
  const list = stayDayClosenessList(stops, cost, T, "routed")!;
  const totals = stayDayCloseness(stops, cost, T, "routed")!;
  assert.deepEqual(list.map((d) => d.dayIndex), [0, 2, 3]);
  assert.equal(list.length, totals.locatedDays);
  assert.equal(list.filter((d) => d.nearStops).length, totals.closeDays);
  assert.deepEqual(list.map((d) => d.nearStops), [false, false, true], "an unreachable stop spoils day 1; a far one spoils day 3");
  assert.equal(stayDayClosenessList([], cost, T, "routed"), null);
  assert.equal(stayDayClosenessList(stops, cost, 0, "routed"), null);
});

test("D2 source names the basis", () => {
  const km = stayCloseStraightKm();
  const near = { kind: "hotel_cache" as const, id: "h1", name: "Fixture Inn", lat: 35.0005, lng: 135.7605 };
  const free = straightLineDayCloseness(near, stops, km)!;
  for (const d of free) assert.equal(d.source, "straight_line");
  const totals = straightLineCloseness(near, stops, km)!;
  assert.equal(free.filter((d) => d.nearStops).length, totals.closeDays);
  for (const d of stayDayClosenessList(stops, () => 1, 10, "routed")!) assert.equal(d.source, "routed");
});

test("D3 an entry has no minutes, metres or km", () => {
  for (const d of stayDayClosenessList(stops, () => 3, 10, "routed")!) {
    assert.deepEqual(Object.keys(d).sort(), ["dayIndex", "nearStops", "source"]);
  }
});

test("D4 no address field on the stay payload", () => {
  const src = fs.readFileSync("shared/where-to-stay.ts", "utf8");
  const block = src.slice(src.indexOf("export type WhereToStayStay"), src.indexOf("};", src.indexOf("export type WhereToStayStay")));
  assert.doesNotMatch(block, /address/i);
  const svc = fs.readFileSync("server/services/where-to-stay.service.ts", "utf8");
  assert.doesNotMatch(svc, /dayCloseness[^\n]*address/i);
});

test("D5 totals unchanged; the stored pick carries the list", () => {
  const T = stayCloseRoutedMinutes();
  assert.deepEqual(stayDayCloseness(stops, () => T, T, "routed"), { closeDays: 3, locatedDays: 3, basis: "routed" });
  const base = { hotelId: "a", hotelKind: "hotel_cache" as const, scoredCount: 4, candidateCount: 9, stopsHash: "4-x", computedAt: "2026-10-30T00:00:00.000Z" };
  const dayCloseness = stayDayClosenessList(stops, () => T, T, "routed");
  const pick = nextStayPick(null, { ...base, closeness: stayDayCloseness(stops, () => T, T, "routed"), dayCloseness, router: "osrm" });
  assert.deepEqual(readStayPick(JSON.parse(JSON.stringify(pick)))?.dayCloseness, dayCloseness);
  const legacy = readStayPick({ ...base, tier: "routed" });
  assert.equal(legacy && "dayCloseness" in legacy, false, "a pick stored before row 244 has no list");
  for (const bad of [[], [{ dayIndex: -1, nearStops: true, source: "routed" }], [{ dayIndex: 0, nearStops: "yes", source: "routed" }], [{ dayIndex: 0, nearStops: true, source: "google" }], "x"]) {
    assert.equal(readDayCloseness(bad), null, JSON.stringify(bad));
  }
});
