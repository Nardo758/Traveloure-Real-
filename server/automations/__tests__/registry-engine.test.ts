import assert from "node:assert/strict";
import test from "node:test";
import type { AutomationDefinition } from "../contract";
import { dispatchAutomationEvent } from "../event-dispatcher";
import { createAutomationRegistry } from "../registry";
import {
  isScheduledAutomationSkip,
  runScheduledAutomation,
} from "../scheduler-wrapper";

const eventAutomation: AutomationDefinition = {
  id: "test.event",
  name: "Test event",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["test.created"] },
  condition: {
    description: "Only verified event payloads are eligible.",
    evaluate: (context) => context.verified === true,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The test action owns any guard.",
  action: { kind: "mutate_record", detail: "bound action" },
  retryPolicy: "caller-owned",
  failureBehavior: "caller-visible",
  enabled: true,
};

const scheduledAutomation: AutomationDefinition = {
  ...eventAutomation,
  id: "test.scheduled",
  type: "financial",
  trigger: {
    kind: "cron",
    schedule: "hourly",
    scheduleId: "test-hourly",
    source: "test",
  },
  condition: {
    description: "A true scheduled context is required.",
    evaluate: (context) => context.eligible === true,
  },
};

test("registry rejects duplicate stable IDs and unresolved cancellation references", () => {
  assert.throws(
    () => createAutomationRegistry([eventAutomation, { ...eventAutomation, name: "Duplicate" }]),
    /Duplicate automation id: test\.event/,
  );
  assert.throws(
    () => createAutomationRegistry([{
      ...eventAutomation,
      cancels: ["test.missing"],
      actionOutcome: () => "success" as const,
    }]),
    /cancels missing automation test\.missing/,
  );
  assert.throws(
    () => createAutomationRegistry([{
      ...eventAutomation,
      cancels: ["test.event"],
      actionOutcome: () => "success" as const,
    }]),
    /cannot cancel itself/,
  );
  assert.throws(
    () => createAutomationRegistry([
      { ...eventAutomation, cancels: ["test.other"], actionOutcome: () => "success" as const },
      { ...eventAutomation, id: "test.other", cancels: ["test.event"], actionOutcome: () => "success" as const },
    ]),
    /cancellation cycle/,
  );
  assert.throws(
    () => createAutomationRegistry([{
      ...scheduledAutomation,
      delay: { milliseconds: Number.NaN, durableAdapter: "invalid" },
    }]),
    /invalid delay/,
  );
  assert.throws(
    () => createAutomationRegistry([{ ...scheduledAutomation, cancels: ["test.event"] }]),
    /must declare an action outcome/,
  );
});

test("event dispatcher requires a matching stable ID, trigger, enabled node, and passing condition", async () => {
  const registry = createAutomationRegistry([eventAutomation]);
  let calls = 0;
  const action = async () => ++calls;

  assert.deepEqual(
    await dispatchAutomationEvent(registry, "test.event", { event: "test.other", verified: true }, action),
    { executed: false, reason: "trigger_mismatch" },
  );
  assert.deepEqual(
    await dispatchAutomationEvent(registry, "test.event", { event: "test.created", verified: false }, action),
    { executed: false, reason: "condition" },
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    await dispatchAutomationEvent(registry, "test.event", { event: "test.created", verified: true }, action),
    { executed: true, result: 1, actionOutcome: "success" },
  );
  assert.equal(calls, 1);
  await assert.rejects(
    dispatchAutomationEvent(registry, "test.missing", { event: "test.created" }, action),
    /Unknown automation id/,
  );
});

test("scheduled wrapper gates by schedule ID and condition without owning deduplication", async () => {
  const registry = createAutomationRegistry([scheduledAutomation]);
  let calls = 0;
  const action = async () => ++calls;

  const wrongSchedule = await runScheduledAutomation(
    registry,
    "test.scheduled",
    { scheduleId: "other", eligible: true },
    action,
    { scheduleId: "other", useBackgroundJobRunner: false },
  );
  assert.ok(isScheduledAutomationSkip(wrongSchedule));
  assert.equal(wrongSchedule.reason, "trigger_mismatch");

  const conditionSkip = await runScheduledAutomation(
    registry,
    "test.scheduled",
    { scheduleId: "test-hourly", eligible: false },
    action,
    { scheduleId: "test-hourly", useBackgroundJobRunner: false },
  );
  assert.ok(isScheduledAutomationSkip(conditionSkip));
  assert.equal(conditionSkip.reason, "condition");

  assert.equal(
    await runScheduledAutomation(
      registry,
      "test.scheduled",
      { scheduleId: "test-hourly", eligible: true },
      action,
      { scheduleId: "test-hourly", useBackgroundJobRunner: false },
    ),
    1,
  );
  assert.equal(
    await runScheduledAutomation(
      registry,
      "test.scheduled",
      { scheduleId: "test-hourly", eligible: true },
      action,
      { scheduleId: "test-hourly", useBackgroundJobRunner: false },
    ),
    2,
  );
});

test("non-none delay and cancellation policies fail explicitly without durable adapters", async () => {
  const delayed = createAutomationRegistry([{
    ...scheduledAutomation,
    delay: { milliseconds: 1000, durableAdapter: "approved-durable-delay" },
  }]);
  await assert.rejects(
    runScheduledAutomation(
      delayed,
      "test.scheduled",
      { scheduleId: "test-hourly", eligible: true },
      () => "must-not-run",
      { scheduleId: "test-hourly", useBackgroundJobRunner: false },
    ),
    /requires durable delay adapter approved-durable-delay/,
  );

  const cancelTarget = { ...eventAutomation, id: "test.target" };
  const canceller = {
    ...scheduledAutomation,
    cancels: ["test.target"],
    actionOutcome: (result: unknown) =>
      (result as { status?: string })?.status === "success" ? "success" as const : "failure" as const,
  };
  const cancellationRegistry = createAutomationRegistry([canceller, cancelTarget]);
  await assert.rejects(
    runScheduledAutomation(
      cancellationRegistry,
      "test.scheduled",
      { scheduleId: "test-hourly", eligible: true },
      () => "must-not-run",
      { scheduleId: "test-hourly", useBackgroundJobRunner: false },
    ),
    /requires a cancellation adapter/,
  );
});

test("delays receive execution context and cancellation runs only after action success", async () => {
  const automation = {
    ...scheduledAutomation,
    cancels: ["test.target"],
    actionOutcome: (result: unknown) =>
      (result as { status?: string })?.status === "failed" ? "failure" as const : "success" as const,
    delay: { milliseconds: 5, durableAdapter: "durable-delay" },
  };
  const registry = createAutomationRegistry([automation, { ...eventAutomation, id: "test.target" }]);
  const calls: string[] = [];
  const context = { scheduleId: "test-hourly", eligible: true, scope: { accountId: "acct-1" } };
  const adapters = {
    delay: {
      wait: async (id: string, ms: number, received: typeof context) => {
        calls.push(`delay:${id}:${ms}:${(received.scope as { accountId: string }).accountId}`);
      },
    },
    cancellation: {
      cancel: async (id: string, cancellationId: string, received: typeof context) => {
        calls.push(`cancel:${id}:${cancellationId}:${(received.scope as { accountId: string }).accountId}`);
      },
    },
  };

  await assert.rejects(
    runScheduledAutomation(
      registry,
      "test.scheduled",
      context,
      async () => {
        calls.push("failed-action");
        throw new Error("financial action failed");
      },
      { scheduleId: "test-hourly", useBackgroundJobRunner: false, adapters },
    ),
    /financial action failed/,
  );
  assert.deepEqual(calls, ["delay:test.scheduled:5:acct-1", "failed-action"]);

  calls.length = 0;
  const result = await runScheduledAutomation(
    registry,
    "test.scheduled",
    context,
    async () => {
      calls.push("successful-action");
      return "done";
    },
    { scheduleId: "test-hourly", useBackgroundJobRunner: false, adapters },
  );
  assert.equal(result, "done");
  assert.deepEqual(calls, [
    "delay:test.scheduled:5:acct-1",
    "successful-action",
    "cancel:test.scheduled:test.target:acct-1",
  ]);
});

test("returned failed or skipped outcomes never trigger cancellations", async () => {
  const automation = {
    ...scheduledAutomation,
    cancels: ["test.target"],
    actionOutcome: (result: unknown) => {
      const status = (result as { status?: string }).status;
      return status === "skipped" ? "skipped" as const : status === "failed" ? "failure" as const : "success" as const;
    },
  };
  const registry = createAutomationRegistry([automation, { ...eventAutomation, id: "test.target" }]);
  const cancellations: string[] = [];
  const adapters = {
    cancellation: {
      cancel: async (_id: string, cancellationId: string) => cancellations.push(cancellationId),
    },
  };

  for (const status of ["failed", "skipped"]) {
    const result = await runScheduledAutomation(
      registry,
      "test.scheduled",
      { scheduleId: "test-hourly", eligible: true },
      () => ({ status }),
      { scheduleId: "test-hourly", useBackgroundJobRunner: false, adapters },
    );
    assert.deepEqual(result, { status });
  }
  assert.deepEqual(cancellations, []);
});