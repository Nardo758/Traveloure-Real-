/**
 * Cut-list #1 slice C — the add action's pure rules and the one-slot runner (ledger `2026-11-11-cutlist1-slice-c-add-actions`).
 *
 *   A1 the approved strings, verbatim
 *   A2 addLabel: "Add to plan" / "Add to Day {n}" / "Added ✓"
 *   A3 addedMessage: "Added to Day {n}.", the unlocated map fact, and the day-less fallback that claims no day
 *   A4 planItemPath: Undo and Change day write to the rail that added the item
 *   A5 planDayCount and the Change day choices (same-day plan = one day)
 *   A6 the first-add calendar opens once, only for a plan whose dates were never chosen
 *   A7 the one slot: a second press replaces the first; the spinner follows the item's key; a stale press is detected
 *   A8 the supersession: the add surfaces no longer draw "Save to plan" / "Saved to Day"; the P-1c stand-ins keep theirs
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/cutlist1-slice-c-add.test.ts
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ADD_COPY,
  FIRST_ADD_DATES_KEY,
  PENDING_ADD_MAX_AGE_MS,
  addLabel,
  addedMessage,
  changeDayOptions,
  pendingAddIsStale,
  planDayCount,
  planItemPath,
  shouldOpenFirstAddDates,
} from "../add-to-plan";
import { __planAddRunner, hasQueuedPlanAdd, isAddPending, queuePlanAdd, setAddPending, takeQueuedPlanAdd } from "../plan-add-runner";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("A1 copy", () => {
  it("is the approved wording", () => {
    assert.equal(ADD_COPY.addToPlan, "Add to plan");
    assert.equal(ADD_COPY.addToDay(4), "Add to Day 4");
    assert.equal(ADD_COPY.added, "Added ✓");
    assert.equal(ADD_COPY.addedToDay(2), "Added to Day 2.");
    assert.equal(ADD_COPY.undo, "Undo");
    assert.equal(ADD_COPY.changeDay, "Change day");
    assert.equal(ADD_COPY.viewPlan, "View plan");
    assert.equal(ADD_COPY.retry, "Retry");
    assert.equal(ADD_COPY.dayOption(3), "Day 3");
  });
});

describe("A2 addLabel", () => {
  it("the table", () => {
    assert.equal(addLabel({}), "Add to plan");
    assert.equal(addLabel({ dayNumber: null }), "Add to plan");
    assert.equal(addLabel({ dayNumber: 0 }), "Add to plan", "no day 0");
    assert.equal(addLabel({ dayNumber: 2.5 }), "Add to plan", "a day is an integer");
    assert.equal(addLabel({ dayNumber: 3 }), "Add to Day 3");
    assert.equal(addLabel({ added: true, dayNumber: 3 }), "Added ✓", "done wins");
  });
});

describe("A3 addedMessage", () => {
  it("names the day and keeps the map fact", () => {
    assert.equal(addedMessage({ dayNumber: 1, located: true }), "Added to Day 1.");
    assert.equal(addedMessage({ dayNumber: 2 }), "Added to Day 2.", "unknown location claims nothing");
    assert.equal(addedMessage({ dayNumber: 3, located: false }), "Added to Day 3. We don't have this spot on the map yet.");
  });
  it("a day-less answer claims no day", () => {
    assert.equal(addedMessage({ located: true }), "Added ✓");
    assert.equal(addedMessage({ dayNumber: null, located: true }), "Added ✓");
    assert.equal(addedMessage({ located: false }), "Saved to your plan. We don't have this spot on the map yet.");
  });
});

describe("A4 planItemPath", () => {
  it("the guest rail and the trip rail", () => {
    assert.equal(planItemPath({ kind: "guest" }, "i1"), "/api/guest-plans/current/items/i1");
    assert.equal(planItemPath({ kind: "trip", tripId: "t1" }, "i1"), "/api/trips/t1/itinerary-items/i1");
    assert.equal(planItemPath({ kind: "guest" }, "a/b"), "/api/guest-plans/current/items/a%2Fb", "ids are encoded");
  });
});

describe("A5 Change day choices", () => {
  it("one per day of the plan, the current one marked", () => {
    assert.equal(planDayCount("2026-11-12", "2026-11-12"), 1, "a same-day trip is one day");
    assert.equal(planDayCount("2026-11-12", "2026-11-15"), 4);
    assert.equal(planDayCount("2026-11-28T00:00:00.000Z", "2026-12-03"), 6, "across a month end");
    assert.equal(planDayCount(null, null), 1);
    assert.equal(planDayCount("2026-11-15", "2026-11-12"), 1, "an inverted window is never negative");
    const opts = changeDayOptions(3, 2);
    assert.deepEqual(opts.map((o) => o.label), ["Day 1", "Day 2", "Day 3"]);
    assert.deepEqual(opts.map((o) => o.current), [false, true, false]);
    assert.equal(changeDayOptions(500, null).length, 60, "capped");
  });
});

describe("A6 first-add calendar", () => {
  it("once per plan, only for dates nobody chose", () => {
    assert.equal(shouldOpenFirstAddDates({ datesConfirmed: false, alreadyAsked: false }), true);
    assert.equal(shouldOpenFirstAddDates({ datesConfirmed: false, alreadyAsked: true }), false);
    assert.equal(shouldOpenFirstAddDates({ datesConfirmed: true, alreadyAsked: false }), false);
    assert.equal(shouldOpenFirstAddDates({ datesConfirmed: null, alreadyAsked: false }), false, "unknown is not 'never chosen'");
    assert.equal(FIRST_ADD_DATES_KEY("p1"), "traveloure_first_add_dates:p1");
  });
});

describe("A7 the one slot", () => {
  beforeEach(() => __planAddRunner.reset());
  it("a second press replaces the first; the spinner follows the item's key", () => {
    const ref = { kind: "gem", source_id: "g1", city: "Kyoto" } as any;
    queuePlanAdd({ key: "gem:g1", ref, city: "Kyoto", chosenDate: null });
    assert.ok(isAddPending("gem:g1"));
    queuePlanAdd({ key: "gem:g2", ref: { ...ref, source_id: "g2" }, city: "Kyoto", chosenDate: null });
    assert.equal(isAddPending("gem:g1"), false, "the replaced press stops spinning");
    assert.ok(isAddPending("gem:g2"));
    assert.ok(hasQueuedPlanAdd());
    const job = takeQueuedPlanAdd();
    assert.equal(job?.key, "gem:g2");
    assert.equal(hasQueuedPlanAdd(), false);
    assert.equal(takeQueuedPlanAdd(), null);
    setAddPending("gem:g2", false);
    assert.equal(isAddPending("gem:g2"), false);
  });
  it("a press older than the cap is stale", () => {
    assert.equal(PENDING_ADD_MAX_AGE_MS, 15_000);
    assert.equal(pendingAddIsStale(0, 15_000), false);
    assert.equal(pendingAddIsStale(0, 15_001), true);
  });
});

describe("A8 the supersession", () => {
  it("the add surfaces read the new strings; the P-1c stand-ins keep theirs", () => {
    assert.match(read("client/src/lib/plan-actions.ts"), /saveToPlan: ADD_COPY\.addToPlan,/);
    assert.doesNotMatch(read("client/src/lib/waitlist-guest-plan.ts"), /`Saved to Day/);
    assert.doesNotMatch(read("client/src/components/plan-picker.tsx"), /`Saved to Day/);
    assert.doesNotMatch(read("client/src/components/plancard/MapControlCenter.tsx"), /WAITLIST_COPY\.saveToPlan/);
    // P-1c: a buy on an item already on the plan is not an add, and keeps its words (Phase 0 default 1).
    assert.match(read("client/src/lib/waitlist-copy.ts"), /saveToPlan: "Save to plan",/);
    assert.match(read("client/src/components/plan/SaveToPlanButton.tsx"), /WAITLIST_COPY\.saveToPlan/);
    // One button everywhere: PlanActions' save output and the map browse add are AddToPlanButton.
    assert.match(read("client/src/components/plan/PlanActions.tsx"), /<AddToPlanButton/);
    assert.equal((read("client/src/components/plancard/MapControlCenter.tsx").match(/<AddToPlanButton/g) ?? []).length, 3);
  });
});
