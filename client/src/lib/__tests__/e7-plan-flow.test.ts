/**
 * E7 — the plan flow asks only what is missing.
 *
 * Today the modal always opens at `where` (`plan-steps.ts:226-231`), so a traveler arriving from a city page
 * is asked the city they are looking at, and one arriving from an event is asked a date the event carries.
 *
 * This table is the rule: the entry decides the ORDER, the plan's own facts decide what is DROPPED, and
 * nothing is asked twice. Unwired in this PR — the surfaces move onto it separately.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_STEP_ORDER, type PlanStepId } from "../plan-steps";
import { planFlowOrder, resolvePlanFlow, type PlanFlowEntry, type PlanFlowFacts } from "../plan-flow";

const NONE: PlanFlowFacts = { hasCity: false, hasDates: false, hasParty: false };
const CITY: PlanFlowFacts = { hasCity: true, hasDates: false, hasParty: false };
const ALL: PlanFlowFacts = { hasCity: true, hasDates: true, hasParty: true };

type Row = { entry: PlanFlowEntry; facts: PlanFlowFacts; steps: PlanStepId[]; skipped: PlanStepId[] };

const ROWS: Row[] = [
  // A plain start asks everything, in the ruled order.
  { entry: "start", facts: NONE, steps: [...PLAN_STEP_ORDER], skipped: [] },
  // Arriving from a city page: the city is known, so Where is skipped and the order closes up.
  { entry: "place", facts: CITY, steps: ["when", "who", "events"], skipped: ["where"] },
  // Arriving from "A date": the date is the reason they came, so When comes FIRST, then the rest.
  { entry: "date", facts: { hasCity: false, hasDates: true, hasParty: false }, steps: ["where", "who", "events"], skipped: ["when"] },
  // Arriving from an event: city AND date come with it.
  { entry: "event", facts: { hasCity: true, hasDates: true, hasParty: false }, steps: ["who", "events"], skipped: [] },
  // Everything known: nothing is asked, and the flow reports itself finished rather than asking again.
  { entry: "place", facts: ALL, steps: ["events"], skipped: ["where", "when", "who"] },
];

test("each entry asks its order, and drops what the plan already knows", () => {
  for (const row of ROWS) {
    const got = resolvePlanFlow(row.entry, row.facts);
    assert.deepEqual(got.steps, row.steps, row.entry + " steps");
    assert.deepEqual(got.skipped, row.skipped, row.entry + " skipped");
    assert.equal(got.first, row.steps[0] ?? null, row.entry + " first");
  }
});

test("the entry decides the order before anything is dropped", () => {
  assert.deepEqual(planFlowOrder("date"), ["when", "where", "who", "events"], "a date root leads with When");
  assert.deepEqual(planFlowOrder("event"), ["who", "events"], "an event root never asks Where or When");
  assert.deepEqual(planFlowOrder("start"), [...PLAN_STEP_ORDER]);
  assert.deepEqual(planFlowOrder("place"), [...PLAN_STEP_ORDER]);
});

test("What's happening is never skipped: a full plan can still hold no events", () => {
  const got = resolvePlanFlow("event", ALL);
  assert.ok(got.steps.includes("events"), "the events step survives a fully-known plan");
  assert.equal(got.first, "events");
});

test("the flow finishes rather than repeating a question it has been answered", () => {
  const got = resolvePlanFlow("event", { hasCity: true, hasDates: true, hasParty: true });
  // The event root asks who + events; with the party stated only events remains.
  assert.deepEqual(got.steps, ["events"]);
  const nothing = resolvePlanFlow("event", ALL);
  assert.equal(nothing.first, "events", "only the events step is left");
});

test("a city alone does not pretend to be dates", () => {
  const got = resolvePlanFlow("start", CITY);
  assert.equal(got.first, "when", "with the city known, the next real question is When");
  assert.ok(!got.steps.includes("where"));
});
