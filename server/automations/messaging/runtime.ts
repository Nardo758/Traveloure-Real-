import type { AutomationContext } from "../contract";
import { dispatchAutomationEvent } from "../event-dispatcher";
import { runScheduledAutomation } from "../scheduler-wrapper";
import { messagingAutomationRegistry } from "./index";

export async function dispatchMessagingEvent<T>(
  id: string,
  event: string,
  payload: unknown,
  context: Record<string, unknown>,
  action: () => Promise<T> | T,
): Promise<T> {
  const dispatched = await dispatchAutomationEvent(
    messagingAutomationRegistry,
    id,
    { ...context, event, payload },
    action,
  );
  if (!dispatched.executed) {
    throw new Error(`Messaging automation ${id} did not run (${dispatched.reason})`);
  }
  return dispatched.result;
}

export async function runMessagingSchedule<T>(
  id: string,
  scheduleId: string,
  action: (context: AutomationContext) => Promise<T> | T,
  contextValues: Record<string, unknown> = {},
): Promise<T> {
  const context: AutomationContext = { ...contextValues, triggeredBy: scheduleId, scheduleId };
  const result = await runScheduledAutomation(
    messagingAutomationRegistry, id, context, action,
    { scheduleId, useBackgroundJobRunner: false },
  );
  if (typeof result === "object" && result !== null &&
      (result as { __automationSkipped?: unknown }).__automationSkipped === true) {
    throw new Error(`Messaging automation ${id} was skipped`);
  }
  return result as T;
}