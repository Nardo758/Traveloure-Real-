import assert from "node:assert/strict";
import test from "node:test";
import { deliveryAutomations } from "../messaging/delivery-index";
import { dispatchMessagingEvent, runMessagingSchedule } from "../messaging/runtime";

test("messaging delivery definitions cover the existing event and schedule rails", () => {
  assert.equal(deliveryAutomations.length, 5);
  const expected = [
    ["messaging.email-outbox-enqueue", "email.enqueue"],
    ["messaging.email-outbox-admin-retry", "email_outbox.admin_retry"],
    ["messaging.push-notification-dispatch", "notification.push_requested"],
  ] as const;
  for (const definition of deliveryAutomations) {
    assert.equal(definition.domain, "messaging");
    assert.ok(definition.condition.description.length > 0);
    assert.equal(definition.condition.evaluate({ event: "not-the-trigger", scheduleId: "not-the-schedule" }), false);
    assert.equal(definition.delay, null);
    assert.deepEqual(definition.cancels, []);
    assert.ok(definition.actionGuard.length > 0);
    assert.ok(definition.retryPolicy.length > 0);
    assert.ok(definition.failureBehavior.length > 0);
    assert.equal(definition.enabled, true);
  }
  for (const [id, event] of expected) {
    const definition = deliveryAutomations.find((node) => node.id === id)!;
    assert.deepEqual(definition.trigger, { kind: "event", events: [event] });
    assert.equal(definition.condition.evaluate({ event }), true);
  }
  for (const [id, scheduleId] of [
    ["messaging.email-outbox-drain", "email-outbox-drain"],
    ["messaging.push-notification-sweep", "push-notification-sweep"],
  ]) {
    const definition = deliveryAutomations.find((node) => node.id === id)!;
    assert.ok(definition.trigger.kind === "cron");
    assert.equal(definition.trigger.scheduleId, scheduleId);
    assert.equal(definition.trigger.schedule, "every 5 minutes");
    assert.equal(definition.condition.evaluate({ scheduleId }), true);
  }
});

test("messaging event adapters invoke simulated delivery actions once and preserve return values", async () => {
  const events = [
    ["messaging.email-outbox-enqueue", "email.enqueue"],
    ["messaging.email-outbox-admin-retry", "email_outbox.admin_retry"],
    ["messaging.push-notification-dispatch", "notification.push_requested"],
  ] as const;
  for (const [id, event] of events) {
    let calls = 0;
    const actionResult = { attempted: true, delivered: false };
    assert.deepEqual(
      await dispatchMessagingEvent(id, event, { simulated: true }, {}, () => {
        calls++;
        return actionResult;
      }),
      actionResult,
    );
    assert.equal(calls, 1, `${id} action should run exactly once`);
  }
});

test("messaging schedule adapters invoke simulated actions once and preserve return values", async () => {
  const schedules = [
    ["messaging.email-outbox-drain", "email-outbox-drain"],
    ["messaging.push-notification-sweep", "push-notification-sweep"],
  ] as const;
  for (const [id, scheduleId] of schedules) {
    let calls = 0;
    const actionResult = { claimed: 0, sent: 0 };
    assert.deepEqual(
      await runMessagingSchedule(id, scheduleId, (context) => {
        calls++;
        assert.equal(context.scheduleId, scheduleId);
        assert.equal(context.triggeredBy, scheduleId);
        return actionResult;
      }),
      actionResult,
    );
    assert.equal(calls, 1, `${id} action should run exactly once`);
  }
});