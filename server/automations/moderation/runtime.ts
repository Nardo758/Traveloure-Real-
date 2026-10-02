import type { BackgroundJobSkipped } from "../../services/background-job-runner";
import type { AutomationContext } from "../contract";
import { dispatchAutomationEvent } from "../event-dispatcher";
import { runScheduledAutomation } from "../scheduler-wrapper";
import { moderationAutomationRegistry } from "./index";

export async function dispatchModerationEvent<T>(
  id: string,
  event: string,
  payload: unknown,
  context: Record<string, unknown>,
  action: () => Promise<T> | T,
): Promise<T> {
  const dispatched = await dispatchAutomationEvent(
    moderationAutomationRegistry,
    id,
    { ...context, event, payload },
    action,
  );
  if (!dispatched.executed) {
    throw new Error(`Moderation automation ${id} did not run (${dispatched.reason})`);
  }
  return dispatched.result;
}

export function runModerationSchedule<T>(
  id: string,
  scheduleId: string,
  action: (context: AutomationContext) => Promise<T> | T,
  contextValues: Record<string, unknown> = {},
): Promise<T | { __automationSkipped: true; reason: "disabled" | "trigger_mismatch" | "condition" } | BackgroundJobSkipped> {
  const context: AutomationContext = { ...contextValues, triggeredBy: scheduleId, scheduleId };
  return runScheduledAutomation(
    moderationAutomationRegistry,
    id,
    context,
    action,
    { scheduleId, useBackgroundJobRunner: false },
  );
}