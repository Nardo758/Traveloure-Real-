/**
 * The ONE active-plan rule (cut-list #1 header fix v2; decision-maker Leon Dixon, Nov 11, 2026).
 *
 *   A1 binding: `?tripId=` beats the pen; the pen beats recency; junk binds nothing
 *   A2 pick: a bound plan wins when it is live; otherwise the most recently updated un-finalized plan
 *   A3 the picker: with TWO plans fitting the item, the most recently updated one is preselected
 *      (TB1: an older "Kyoto trip" was preselected over the just-claimed one off an unordered list)
 *   A4 the strip, the picker, the pending-add flush and the server list all read the one rule
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boundTripId, byMostRecentlyUpdated, pickActivePlan } from "../active-plan";
import { preselectAddPlan, toOpenPlanRef } from "../trip-target";

const rows = [
  { id: "older", destination: "Kyoto, Japan", title: "Kyoto trip 18 Nov–20 Nov", startDate: "2026-11-18", endDate: "2026-11-20", updatedAt: "2026-11-01T10:00:00Z" },
  { id: "claimed", destination: "Kyoto, Japan", title: "Kyoto", startDate: "2026-11-11", endDate: "2026-11-11", updatedAt: "2026-11-11T10:00:00Z" },
  { id: "done", destination: "Kyoto, Japan", updatedAt: "2026-11-12T10:00:00Z", finalizedAt: "2026-11-12T10:00:00Z" },
];

describe("A1 the binding", () => {
  it("URL, then pen, then nothing", () => {
    assert.equal(boundTripId("?tripId=t-url", "t-pen"), "t-url");
    assert.equal(boundTripId("?x=1", "t-pen"), "t-pen");
    assert.equal(boundTripId("", " "), null);
    assert.equal(boundTripId(null, undefined), null);
    assert.equal(boundTripId("tripId=t-bare", null), "t-bare", "a search string without the ? still reads");
  });
});

describe("A2 the pick", () => {
  it("a live binding wins; otherwise recency; finalized plans never", () => {
    assert.equal(pickActivePlan(rows)?.id, "claimed", "the finalized 'done' is newer but never active");
    assert.equal(pickActivePlan(rows, "older")?.id, "older");
    assert.equal(pickActivePlan(rows, "done")?.id, "claimed", "a finalized binding falls through");
    assert.equal(pickActivePlan(rows, "nope")?.id, "claimed");
    assert.equal(pickActivePlan([]), null);
    assert.equal(pickActivePlan(null), null);
  });
  it("byMostRecentlyUpdated is pure and puts undated rows last", () => {
    const input = [{ id: "a" }, { id: "b", updatedAt: "2026-11-02" }, { id: "c", updatedAt: "2026-11-03" }];
    assert.deepEqual(byMostRecentlyUpdated(input).map((r) => r.id), ["c", "b", "a"]);
    assert.deepEqual(input.map((r) => r.id), ["a", "b", "c"], "the input is not mutated");
  });
});

describe("A3 the picker preselects the most recently updated fitting plan", () => {
  it("two Kyoto plans fit a Kyoto item: the claimed (newer) one is checked, not the older trip", () => {
    const item = { city: "Kyoto, Japan", isEvent: false, date: null } as any;
    const unordered = [rows[0], rows[1]].map(toOpenPlanRef);
    // The rule the picker applies: sort first, THEN find the first fit (use-open-plans.ts).
    const ordered = byMostRecentlyUpdated([rows[0], rows[1]]).map(toOpenPlanRef);
    assert.deepEqual(preselectAddPlan(ordered, item), { kind: "plan", tripId: "claimed" });
    // And the pre-fix shape, for the record: an unordered list preselects whichever fit came first.
    assert.deepEqual(preselectAddPlan(unordered, item), { kind: "plan", tripId: "older" });
    const hook = readFileSync("client/src/hooks/use-open-plans.ts", "utf8");
    assert.match(hook, /byMostRecentlyUpdated\(query\.data as TripListRow\[\]\)\s*\.filter/, "the hook sorts before it filters and maps");
  });
});

describe("A4 one rule, every reader", () => {
  it("the strip, the flush and the picker import the rule; the server list is ordered at its source", () => {
    assert.match(readFileSync("client/src/components/layout.tsx", "utf8"), /useActivePlan\(\)/);
    assert.match(readFileSync("client/src/hooks/use-active-plan.ts", "utf8"), /pickActivePlan\(trips, bound\)/);
    assert.match(readFileSync("client/src/lib/header-plan.ts", "utf8"), /return pickActivePlan\(trips, bound\);/);
    assert.match(readFileSync("client/src/lib/plan-add-runner.ts", "utf8"), /activeHeaderTrip\(trips, boundTripId\(/);
    assert.match(readFileSync("client/src/hooks/use-open-plans.ts", "utf8"), /byMostRecentlyUpdated/);
    assert.match(readFileSync("server/storage.ts", "utf8"), /\.orderBy\(desc\(trips\.updatedAt\)\);\n/, "getTrips orders most-recently-updated first");
    // The claim binds the claimed plan into the pen the moment it resolves.
    assert.match(readFileSync("client/src/App.tsx", "utf8"), /if \(claimed\) syncActiveTripToContext\(claimed\);/);
  });
});
