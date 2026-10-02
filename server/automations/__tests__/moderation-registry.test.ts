import assert from "node:assert/strict";
import test from "node:test";
import { dispatchAutomationEvent } from "../event-dispatcher";
import { createAutomationRegistry } from "../registry";
import { moderationAutomations, moderationAutomationRegistry } from "../moderation";
import { dispatchModerationEvent, runModerationSchedule } from "../moderation/runtime";

test("moderation registry has complete stable definitions without loading database services", () => {
  assert.equal(moderationAutomations.length, 11);
  assert.equal(moderationAutomationRegistry.byId.size, 11);
  assert.equal(moderationAutomationRegistry.domains.includes("moderation"), true);
  for (const definition of moderationAutomations) {
    assert.ok(definition.id.startsWith("moderation."));
    assert.equal(definition.domain, "moderation");
    assert.ok(definition.name.length > 0);
    assert.ok(["must_have", "operational", "security"].includes(definition.type));
    assert.ok(definition.trigger.kind === "event" || definition.trigger.kind === "cron");
    assert.ok(definition.condition.description.length > 0);
    assert.ok(typeof definition.condition.evaluate === "function");
    assert.ok(definition.idempotencyKey === null || definition.idempotencyKey.length > 0);
    assert.equal(definition.delay, null);
    assert.deepEqual(definition.cancels, []);
    assert.ok(definition.actionGuard.length > 0);
    assert.ok(definition.action.kind.length > 0);
    assert.ok(definition.action.detail.length > 0);
    assert.ok(definition.retryPolicy.length > 0);
    assert.ok(definition.failureBehavior.length > 0);
    assert.equal(definition.enabled, true);
  }
});

test("pending report notification is gated on a persisted message/user report and preserves the action closure", async () => {
  const definition = moderationAutomationRegistry.byId.get("moderation.pending-report-admin-notification")!;
  let actions = 0;
  const action = async () => {
    actions += 1;
    return "notification attempted";
  };

  assert.deepEqual(
    await dispatchAutomationEvent(moderationAutomationRegistry, definition.id, {
      event: "message_report.pending",
      reportPersisted: false,
      reportId: "report-1",
      reportType: "message",
    }, action),
    { executed: false, reason: "condition" },
  );
  assert.deepEqual(
    await dispatchAutomationEvent(moderationAutomationRegistry, definition.id, {
      event: "user_report.pending",
      reportPersisted: true,
      status: "reviewed",
      reportId: "report-2",
      reportType: "user",
    }, action),
    { executed: false, reason: "condition" },
  );
  assert.deepEqual(
    await dispatchAutomationEvent(moderationAutomationRegistry, definition.id, {
      event: "user_report.pending",
      reportPersisted: true,
      status: "pending",
      reportId: "report-3",
      reportType: "user",
    }, action),
    { executed: true, result: "notification attempted", actionOutcome: "success" },
  );
  assert.equal(actions, 1);
});

test("moderation runtime binds the supplied action and scheduled cleanup uses its declared schedule", async () => {
  let eventCalls = 0;
  assert.equal(await dispatchModerationEvent(
    "moderation.content-flag-created",
    "content_flag.created",
    { trackingNumber: "tracking-1", flagType: "safety" },
    { flagInput: { trackingNumber: "tracking-1", flagType: "safety" } },
    () => ++eventCalls,
  ), 1);
  assert.equal(eventCalls, 1);

  const scheduledNodes = [
    ["moderation.rate-limiter-cleanup", "rate-limiter-cleanup"],
    ["moderation.internal-jobs-limiter-cleanup", "internal-jobs-limiter-cleanup"],
    ["moderation.message-rate-limiter-cleanup", "message-rate-limiter-cleanup"],
  ] as const;
  let scheduleCalls = 0;
  for (const [index, [id, scheduleId]] of scheduledNodes.entries()) {
    assert.equal(await runModerationSchedule(id, scheduleId, () => ++scheduleCalls), index + 1);
  }
  assert.equal(scheduleCalls, scheduledNodes.length);
});

test("retained request-path gates are not required to run through asynchronous registry dispatch", () => {
  assert.equal(moderationAutomationRegistry.byId.has("moderation.login-gate"), false);
  assert.equal(moderationAutomationRegistry.byId.has("moderation.publish-request-gate"), false);
});