/**
 * A7 part 1 - the map beside the days: the pure rules (board R3_DaysBoard; Leon's go, Nov 21, 2026).
 *
 * Run: npx tsx --test client/src/lib/__tests__/days-map.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAYS_MAP_COPY, daysMapActivities, daysMapChips, daysMapCountLine, daysMapFromUrl, daysMapKey, daysMapStops } from "../days-map";
import { buildMapScene } from "../map-scene";

const act = (id: string, name: string, lat: number | null, lng: number | null, time: string | null = null) => ({ id, name, time, lat, lng }) as any;
const days = [
  { dayNum: 1, dateIso: "2026-12-08", activities: [act("a", "Fushimi Inari Shrine", 34.967, 135.772, "09:00"), act("b", "Tofuku-ji", 34.976, 135.774, "14:30")] },
  { dayNum: 2, dateIso: "2026-12-09", activities: [act("c", "Arashiyama Bamboo Grove", 35.017, 135.671), act("d", "Tenryu-ji", null, null)] },
  { dayNum: 3, dateIso: "2026-12-10", activities: [] },
] as any[];

test("M1 the wording is the board's", () => {
  assert.deepEqual({ ...DAYS_MAP_COPY }, { view: "Days and map", allDays: "All days", browse: "Browse nearby" });
});

test("M2 the map is beside the days unless the URL says Days only (?beside=none)", () => {
  assert.equal(daysMapFromUrl("?view=days"), true, "the default");
  assert.equal(daysMapFromUrl(""), true);
  assert.equal(daysMapFromUrl(null), true);
  assert.equal(daysMapFromUrl("?view=days&beside=map"), true, "an older link that named it");
  assert.equal(daysMapFromUrl("?beside=1"), true, "only the one word hides it");
  assert.equal(daysMapFromUrl("?view=days&beside=none"), false);
  assert.equal(daysMapFromUrl("?beside=none"), false);
});

test("M3 chips: 'All days' leads, then each day in order; the chosen day carries its date; an undated plan says 'Day 2'", () => {
  assert.deepEqual(daysMapChips(days, "all"), [
    { key: "all", label: "All days" },
    { key: 1, label: "Tue" },
    { key: 2, label: "Wed" },
    { key: 3, label: "Thu" },
  ]);
  assert.equal(daysMapChips(days, 2)[2].label, "Wed 9");
  assert.deepEqual(
    daysMapChips([{ dayNum: 1, dateIso: null }, { dayNum: 2, dateIso: null }], "all").map((c) => c.label),
    ["All days", "Day 1", "Day 2"],
  );
});

test("M4 a one-day plan has nothing to choose between, so it has no chips", () => {
  assert.deepEqual(daysMapChips([days[0]], "all"), []);
  assert.deepEqual(daysMapChips([], "all"), []);
});

test("M5 a chip for a day that is gone falls back to All days", () => {
  assert.equal(daysMapKey(days, 2), 2);
  assert.equal(daysMapKey(days, 9), "all");
  assert.equal(daysMapKey(days, "all"), "all");
});

test("M6 All days draws every day's stops in day order; a day chip draws that day only", () => {
  assert.deepEqual(daysMapActivities(days, "all").map((a) => a.id), ["a", "b", "c", "d"]);
  assert.deepEqual(daysMapActivities(days, 2).map((a) => a.id), ["c", "d"]);
  assert.deepEqual(daysMapActivities(days, 3), []);
  assert.deepEqual(daysMapStops(days, 1), [
    { id: "a", name: "Fushimi Inari Shrine", time: "09:00", lat: 34.967, lng: 135.772, supplySlot: false },
    { id: "b", name: "Tofuku-ji", time: "14:30", lat: 34.976, lng: 135.774, supplySlot: false },
  ]);
});

test("M7 the numbers follow the days left to right, and an unlocated stop keeps its number but gets no pin", () => {
  const all = buildMapScene({ dayNumber: null, planStops: daysMapStops(days, "all"), layers: { plan: true, browse: false } });
  assert.deepEqual(all.pins.map((p) => [p.id, p.n]), [["a", 1], ["b", 2], ["c", 3]]);
  assert.deepEqual(all.list.map((s) => [s.id, s.n, s.located]), [["a", 1, true], ["b", 2, true], ["c", 3, true], ["d", 4, false]]);
  const wed = buildMapScene({ dayNumber: null, planStops: daysMapStops(days, 2), layers: { plan: true, browse: false } });
  assert.deepEqual(wed.pins.map((p) => [p.id, p.n]), [["c", 1]]);
  assert.equal(daysMapCountLine(wed.pins.length, wed.list.length), "1 of 2 stops on the map");
});

test("M8 the count line: plural by the total, and nothing to count draws no line", () => {
  assert.equal(daysMapCountLine(5, 5), "5 of 5 stops on the map");
  assert.equal(daysMapCountLine(1, 1), "1 of 1 stop on the map");
  assert.equal(daysMapCountLine(0, 1), "0 of 1 stop on the map");
  assert.equal(daysMapCountLine(0, 3), "0 of 3 stops on the map");
  assert.equal(daysMapCountLine(0, 0), null);
});
