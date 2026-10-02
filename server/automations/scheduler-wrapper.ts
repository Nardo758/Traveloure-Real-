import type {
  AutomationAdapters,
  AutomationContext,
  AutomationRegistry,
} from "./contract";
import type { BackgroundJobSkipped } from "../services/background-job-runner";
import { dispatchDefinition } from "./event-dispatcher";
import { getAutomation } from "./registry";
import { runBackgroundJob } from "../services/background-job-runner";

export interface ScheduledAutomationSkipped {
  __automationSkipped: true;
  reason: "disabled" | "trigger_mismatch" | "condition";
}

export function isScheduledAutomationSkip(value: unknown): value is ScheduledAutomationSkipped {
  return typeof value === "object" && value !== null &&
    (value as ScheduledAutomationSkipped).__automationSkipped === true;
}

export interface ScheduledAutomationOptions {
  scheduleId: string;
  runnerName?: string;
  useBackgroundJobRunner?: boolean;
  adapters?: AutomationAdapters;
}

export async function runScheduledAutomation<T, C extends AutomationContext>(
  registry: AutomationRegistry,
  id: string,
  context: C,
  action: (context: C) => Promise<T> | T,
  options: ScheduledAutomationOptions,
): Promise<T | ScheduledAutomationSkipped | BackgroundJobSkipped> {
  const definition = getAutomation<C>(registry, id);
  if (definition.trigger.kind !== "cron" ||
      definition.trigger.scheduleId !== options.scheduleId ||
      context.scheduleId !== options.scheduleId) {
    return { __automationSkipped: true, reason: "trigger_mismatch" };
  }

  const execute = async () => {
    const dispatched = await dispatchDefinition(definition, context, action, options.adapters);
    if (!dispatched.executed) {
      return { __automationSkipped: true, reason: dispatched.reason } satisfies ScheduledAutomationSkipped;
    }
    return dispatched.result;
  };
  if (options.useBackgroundJobRunner === false) return execute();
  return runBackgroundJob(options.runnerName ?? id, execute);
}