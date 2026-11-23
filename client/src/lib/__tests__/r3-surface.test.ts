/**
 * R3 switch (Leon, Nov 22 2026): the flag is read at RUNTIME from the server, and the URL alone never switches a
 * surface on. These two rules are the whole contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { r3IdeaCount, r3Stops, r3SurfaceOn } from "../r3-surface";

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
