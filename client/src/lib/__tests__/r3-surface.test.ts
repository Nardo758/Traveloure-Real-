/**
 * R3 switch (Leon, Nov 22 2026): the flag is read at RUNTIME from the server, and the URL alone never switches a
 * surface on. These two rules are the whole contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isStayItem, r3Columns, r3IdeaCount, r3Ideas, r3MapCounts, r3Stops, r3SurfaceOn, sidebarStartsCollapsed, sidebarStorageKey } from "../r3-surface";

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

test("the sidebar is expanded on every page that is not an R3 plan page", () => {
  assert.equal(sidebarStartsCollapsed({ r3Page: false, stored: null }), false, "non-R3 page: expanded");
  assert.equal(sidebarStartsCollapsed({ r3Page: true, stored: null }), true, "R3 plan page: collapsed");
  assert.equal(sidebarStartsCollapsed({ r3Page: false, stored: true }), true, "a traveler's own choice wins over the default");
  assert.equal(sidebarStartsCollapsed({ r3Page: true, stored: false }), false, "and wins on an R3 page too");
  assert.equal(sidebarStorageKey(7), "dsh.sidebar.collapsed.7", "persisted per traveler");
  assert.equal(sidebarStorageKey(null), "dsh.sidebar.collapsed.anon");
});

test("the map count excludes a stop with no coordinates", () => {
  const located = { id: "a", name: "Fushimi Inari Shrine", lat: 34.9671, lng: 135.7727, startTime: "09:00" };
  const unlocated = { id: "b", name: "Somewhere unplotted", startTime: "11:00" };
  const counts = r3MapCounts({ days: [{ dayNumber: 1, activities: [located, unlocated] }] });
  assert.equal(counts.total, 2, "both stops are on the days");
  assert.equal(counts.located, 1, "only the one with coordinates is a pin");
  assert.equal(r3MapCounts({ days: [] }).total, 0, "no days, nothing to count");
});

test("a stay is the exact DTO shape the plancard sends: type 'lodging', never a stop", () => {
  // `server/services/add-checks.service.ts:81` projects each day stop as `{ ..., type: item.itemType }`.
  const stay = { id: "s1", name: "Higashiyama inn", type: "lodging", dayNumber: 1, startTime: "18:00" };
  const stop = { id: "a1", name: "Fushimi Inari Shrine", type: "activity", dayNumber: 1, startTime: "09:00" };
  assert.equal(isStayItem(stay), true);
  assert.equal(isStayItem(stop), false);
  assert.equal(isStayItem({ id: "x", name: "Hotel-ish thing", type: "hotel-ish" }), false, "no pattern-matching");
  const plan = { days: [{ dayNumber: 1, activities: [stay, stop] }] };
  assert.equal(r3Columns(plan)[0].stops.length, 1, "the ring is not a card");
  assert.equal(r3Stops(plan).length, 1, "and not a counted stop");
  assert.equal(r3MapCounts(plan).total, 1, "nor part of the map's total");
});
