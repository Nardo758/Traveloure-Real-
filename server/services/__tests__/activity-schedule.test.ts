import assert from "node:assert/strict";
import test from "node:test";
import { propagateActivitySchedule } from "../activity-schedule.service";

test("computes an unscheduled start from activity duration plus routed drive time", () => {
  const result = propagateActivitySchedule(
    [
      { id: "a", dayNumber: 1, order: 0, startTime: "09:00", durationMinutes: 90 },
      { id: "b", dayNumber: 1, order: 1, startTime: null, durationMinutes: 60 },
    ],
    [{ dayNumber: 1, fromActivityId: "a", toActivityId: "b", estimatedDurationMinutes: 35 }],
  );
  assert.deepEqual(result.updates, [
    { id: "a", startTime: "09:00", endTime: "10:30", travelTimeFromPrevious: null },
    { id: "b", startTime: "11:05", endTime: "12:05", travelTimeFromPrevious: 35 },
  ]);
  assert.deepEqual(result.unresolved, []);
});

test("preserves an explicit downstream start while retaining routed travel metadata", () => {
  const result = propagateActivitySchedule(
    [
      { id: "a", dayNumber: 1, order: 0, startTime: "09:00", durationMinutes: 90 },
      { id: "b", dayNumber: 1, order: 1, startTime: "14:00", durationMinutes: 60 },
    ],
    [{ dayNumber: 1, fromActivityId: "a", toActivityId: "b", estimatedDurationMinutes: 35 }],
  );
  assert.equal(result.updates[1].startTime, "14:00");
  assert.equal(result.updates[1].travelTimeFromPrevious, 35);
  assert.deepEqual(result.unresolved, []);
});

test("flags an explicit start that cannot fit the prior activity and routed drive", () => {
  const result = propagateActivitySchedule(
    [
      { id: "a", dayNumber: 1, order: 0, startTime: "09:00", durationMinutes: 180 },
      { id: "b", dayNumber: 1, order: 1, startTime: "11:30", durationMinutes: 60 },
    ],
    [{ dayNumber: 1, fromActivityId: "a", toActivityId: "b", estimatedDurationMinutes: 183 }],
  );
  assert.equal(result.updates[1].startTime, "11:30");
  assert.deepEqual(result.unresolved, [{ activityId: "b", reason: "schedule_conflict" }]);
});

test("does not invent a time when duration or route data is missing", () => {
  const result = propagateActivitySchedule(
    [
      { id: "a", dayNumber: 1, order: 0, startTime: "09:00", durationMinutes: null },
      { id: "b", dayNumber: 1, order: 1, startTime: null, durationMinutes: 60 },
      { id: "c", dayNumber: 2, order: 0, startTime: "10:00", durationMinutes: 60 },
      { id: "d", dayNumber: 2, order: 1, startTime: null, durationMinutes: 60 },
    ],
    [],
  );
  assert.equal(result.updates.find((item) => item.id === "b")?.startTime, null);
  assert.equal(result.updates.find((item) => item.id === "d")?.startTime, null);
  assert.deepEqual(
    result.unresolved.map((item) => [item.activityId, item.reason]),
    [["b", "missing_duration"], ["d", "route_unavailable"]],
  );
});

test("never rolls a computed activity into the next day", () => {
  const result = propagateActivitySchedule(
    [
      { id: "a", dayNumber: 1, order: 0, startTime: "23:00", durationMinutes: 90 },
      { id: "b", dayNumber: 1, order: 1, startTime: null, durationMinutes: 30 },
    ],
    [{ dayNumber: 1, fromActivityId: "a", toActivityId: "b", estimatedDurationMinutes: 20 }],
  );
  assert.equal(result.updates[1].startTime, null);
  assert.ok(result.unresolved.some((item) => item.activityId === "b" && item.reason === "day_boundary"));
});