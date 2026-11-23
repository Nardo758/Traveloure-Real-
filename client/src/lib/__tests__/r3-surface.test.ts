/**
 * R3 switch (Leon, Nov 22 2026): the flag is read at RUNTIME from the server, and the URL alone never switches a
 * surface on. These two rules are the whole contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { r3Columns, r3IdeaCount, r3Ideas, r3Stops, r3SurfaceOn } from "../r3-surface";

test("flag OFF ignores ?surface=r3 - the parameter alone changes nothing", () => {
  assert.equal(r3SurfaceOn("?surface=r3", false), false);
  assert.equal(r3SurfaceOn("surface=r3", false), false);
  assert.equal(r3SurfaceOn("", false), false);
});

test("flag ON plus ?surface=r3 is the only way in", () => {
  assert.equal(r3SurfaceOn("?surface=r3", true), true);
  assert.equal(r3SurfaceOn("surface=r3", true), true, "a bare search string works too");
  assert.equal(r3SurfaceOn("?view=days&surface=r3", true), true);
});

test("flag ON without the parameter keeps the old page", () => {
  assert.equal(r3SurfaceOn("", true), false);
  assert.equal(r3SurfaceOn("?view=days", true), false);
  assert.equal(r3SurfaceOn("?surface=other", true), false);
});

test("the stop list is data.days[].activities - a six-stop plan shows six stops", () => {
  const day = (n: number, titles: string[]) => ({
    dayNumber: n,
    activities: titles.map((name) => ({ name, type: "activity" })),
  });
  const sixStopPlan = {
    days: [day(1, ["Fushimi Inari Shrine", "Tofuku-ji"]), day(2, ["Arashiyama", "Tenryu-ji"]), day(3, ["Kiyomizu-dera", "Ginkaku-ji"])],
    // items/activities at the top level must NOT be what the count reads
    items: [{ name: "ignored" }],
    activities: [{ name: "ignored too" }],
  };
  const stops = r3Stops(sixStopPlan);
  assert.equal(stops.length, 6, "the footer's stop count comes from the day rows");
  assert.deepEqual(stops.map((s: any) => s.name).slice(0, 2), ["Fushimi Inari Shrine", "Tofuku-ji"]);
  assert.equal(r3Stops({ days: [] }).length, 0, "an empty plan has no stops");
});

test("a plan with no days has no stops, and ideas are never invented", () => {
  assert.deepEqual(r3Stops({}), []);
  assert.equal(r3Stops({ items: [{ name: "x" }] }).length, 0, "top-level items are not stops");
  assert.equal(r3IdeaCount({}), 0);
  assert.equal(r3IdeaCount({ ideas: [1, 2] }), 2);
});

test("column grouping: one column per day, its own stops, in the plan's order", () => {
  const plan = {
    days: [
      { dayNumber: 1, date: "2027-04-01", activities: [{ id: "a", name: "Fushimi Inari Shrine", startTime: "09:00" }, { id: "b", name: "Tofuku-ji" }] },
      { dayNumber: 2, date: "2027-04-02", activities: [{ id: "c", name: "Arashiyama" }] },
      { dayNumber: 3, date: "2027-04-03", activities: [] },
    ],
    ideas: [{ id: "i1", name: "Nishiki Market" }],
  };
  const cols = r3Columns(plan);
  assert.equal(cols.length, 3, "three day rows, three columns");
  assert.deepEqual(cols.map((c) => c.day), [1, 2, 3]);
  assert.equal(cols[0].stops.length, 2);
  assert.equal(cols[1].stops.length, 1);
  assert.equal(cols[2].stops.length, 0, "a day with no stops keeps its column");
  assert.equal(cols[0].label, "Thu \u00b7 1 Apr");
  assert.equal(cols.reduce((n, c) => n + c.stops.length, 0), 3, "every stop lands in exactly one column");
  assert.equal(r3Ideas(plan).length, 1, "ideas are their own column, never a day");
  assert.deepEqual(r3Columns({}), [], "no day rows, no board");
});
