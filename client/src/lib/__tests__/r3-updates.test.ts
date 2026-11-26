/**
 * R3 U6: the two pure rules the Updates panel depends on - the moment line and the plan line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { r3UpdateWhen, r3UpdatePlanLine, r3UpdateSubline, r3UpdateHref } from "../r3-updates";

const NOW = new Date(2027, 3, 15, 12, 0, 0);

test("r3UpdateWhen: minutes, hours, yesterday, older", () => {
  assert.equal(r3UpdateWhen(new Date(2027, 3, 15, 11, 55).toISOString(), NOW), "5 minutes ago");
  assert.equal(r3UpdateWhen(new Date(2027, 3, 15, 10, 0).toISOString(), NOW), "2 hours ago");
  assert.equal(r3UpdateWhen(new Date(2027, 3, 14, 9, 0).toISOString(), NOW), "Yesterday");
  assert.equal(r3UpdateWhen(new Date(2027, 3, 12, 9, 0).toISOString(), NOW), "12 Apr");
});

test("r3UpdateWhen: a single minute and a single hour read singular", () => {
  assert.equal(r3UpdateWhen(new Date(2027, 3, 15, 11, 59).toISOString(), NOW), "1 minute ago");
  assert.equal(r3UpdateWhen(new Date(2027, 3, 15, 11, 0).toISOString(), NOW), "1 hour ago");
});

test("r3UpdatePlanLine: a match, no tripId, and an unknown tripId", () => {
  const plans = [{ id: "trip-1", title: "Your Kyoto plan" }];
  assert.equal(r3UpdatePlanLine({ data: { tripId: "trip-1" } } as any, plans), "Your Kyoto plan");
  assert.equal(r3UpdatePlanLine({ data: {} } as any, plans), "Not on a plan");
  assert.equal(r3UpdatePlanLine({ data: { tripId: "trip-9" } } as any, plans), "Not on a plan");
});

test("r3UpdateSubline joins the plan line and the moment", () => {
  const plans = [{ id: "trip-1", title: "Your Kyoto plan" }];
  const line = r3UpdateSubline({ data: { tripId: "trip-1" }, createdAt: new Date(2027, 3, 15, 10, 0).toISOString() } as any, plans, NOW);
  assert.equal(line, "Your Kyoto plan \u00b7 2 hours ago");
});

test("r3UpdateHref keeps surface on a plan link and leaves other links alone", () => {
  assert.equal(r3UpdateHref("/plans/trip-1"), "/plans/trip-1?surface=r3");
  assert.equal(r3UpdateHref("/plans/trip-1?item=abc"), "/plans/trip-1?item=abc&surface=r3");
  assert.equal(r3UpdateHref("/plans/trip-1?surface=r3"), "/plans/trip-1?surface=r3");
  assert.equal(r3UpdateHref("/inbox?tab=updates"), "/inbox?tab=updates");
});
