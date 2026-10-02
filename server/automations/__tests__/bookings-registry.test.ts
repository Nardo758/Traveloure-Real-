import assert from "node:assert/strict";
import test from "node:test";
import { dispatchAutomationEvent } from "../event-dispatcher";
import { bookingAutomations, bookingAutomationRegistry } from "../bookings";
import { dispatchBookingEvent, runBookingSchedule } from "../bookings/runtime";

test("bookings registry contains complete stable definitions without loading database services", () => {
  assert.equal(bookingAutomations.length, 17);
  assert.equal(bookingAutomationRegistry.byId.size, 17);
  assert.equal(bookingAutomationRegistry.domains.includes("bookings"), true);
  for (const definition of bookingAutomations) {
    assert.ok(definition.id.startsWith("bookings."));
    assert.equal(definition.domain, "bookings");
    assert.ok(definition.name.length > 0);
    assert.ok(["must_have", "operational", "financial"].includes(definition.type));
    assert.ok(definition.trigger.kind === "event" || definition.trigger.kind === "cron");
    assert.ok(definition.condition.description.length > 0);
    assert.equal(typeof definition.condition.evaluate, "function");
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

test("booking event and scheduled adapters dispatch each supplied action once and preserve its result", async () => {
  let eventCalls = 0;
  assert.deepEqual(
    await dispatchBookingEvent(
      "bookings.completion-writer",
      "service_booking.completion.requested",
      { bookingId: "booking-1", actor: "traveler_accepted" },
      { bookingId: "booking-1", actor: "traveler_accepted" },
      () => {
        eventCalls++;
        return { completed: false, reason: "lost_race" };
      },
    ),
    { completed: false, reason: "lost_race" },
  );
  assert.equal(eventCalls, 1);

  let scheduleCalls = 0;
  assert.equal(
    await runBookingSchedule(
      "bookings.declared-window-close",
      "booking-auto-completion",
      (context) => {
        scheduleCalls++;
        assert.equal(context.scheduleId, "booking-auto-completion");
        assert.equal(context.triggeredBy, "booking-auto-completion");
        return 19;
      },
    ),
    19,
  );
  assert.equal(scheduleCalls, 1);
});

test("booking notice/slot-release nodes retain caller-owned guards and manual policies are not nodes", async () => {
  const accepted = bookingAutomationRegistry.byId.get("bookings.provider-acceptance-follow-on")!;
  const cancelled = bookingAutomationRegistry.byId.get("bookings.cancellation-follow-ons")!;
  assert.equal(accepted.condition.evaluate({
    event: "service_booking.provider_accepted",
    status: "confirmed",
    notificationType: "booking_confirmed",
  }), true);
  assert.equal(accepted.condition.evaluate({
    event: "service_booking.provider_accepted",
    status: "cancelled",
    notificationType: "booking_cancelled",
  }), false);
  assert.equal(cancelled.condition.evaluate({
    event: "service_booking.cancelled",
    status: "cancelled",
  }), true);
  assert.equal(cancelled.condition.evaluate({
    event: "service_booking.cancelled",
    status: "confirmed",
  }), false);

  assert.equal(bookingAutomationRegistry.byId.has("bookings.traveler-cancellation-policy"), false);
  assert.equal(bookingAutomationRegistry.byId.has("bookings.quote-expiry-sweeper"), false);

  const result = await dispatchAutomationEvent(
    bookingAutomationRegistry,
    accepted.id,
    { event: "service_booking.provider_accepted", status: "cancelled", notificationType: "booking_cancelled" },
    () => assert.fail("A mismatched booking transition must not invoke the status writer"),
  );
  assert.deepEqual(result, { executed: false, reason: "condition" });
});