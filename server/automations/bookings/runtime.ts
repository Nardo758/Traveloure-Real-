import type { AutomationContext } from "../contract";
import { dispatchAutomationEvent } from "../event-dispatcher";
import { runScheduledAutomation } from "../scheduler-wrapper";
import { bookingAutomationRegistry } from "./index";

export async function dispatchBookingEvent<T>(
  id: string,
  event: string,
  payload: unknown,
  context: Record<string, unknown>,
  action: () => Promise<T> | T,
): Promise<T> {
  const dispatched = await dispatchAutomationEvent(
    bookingAutomationRegistry,
    id,
    { ...context, event, payload },
    action,
  );
  if (!dispatched.executed) {
    throw new Error(`Booking automation ${id} did not run (${dispatched.reason})`);
  }
  return dispatched.result;
}

export async function runBookingSchedule<T>(
  id: string,
  scheduleId: string,
  action: (context: AutomationContext) => Promise<T> | T,
  contextValues: Record<string, unknown> = {},
): Promise<T> {
  const context: AutomationContext = {
    ...contextValues,
    triggeredBy: scheduleId,
    scheduleId,
  };
  const result = await runScheduledAutomation(
    bookingAutomationRegistry,
    id,
    context,
    action,
    { scheduleId, useBackgroundJobRunner: false },
  );
  if (isBookingAutomationSkipped(result)) {
    throw new Error(`Booking automation ${id} was skipped (${result.reason})`);
  }
  return result as T;
}

function isBookingAutomationSkipped(
  value: unknown,
): value is { __automationSkipped: true; reason: "disabled" | "trigger_mismatch" | "condition" } {
  return typeof value === "object" && value !== null &&
    (value as { __automationSkipped?: unknown }).__automationSkipped === true;
}
