import type {
  AutomationAdapters,
  AutomationActionOutcome,
  AutomationContext,
  AutomationDefinition,
  AutomationRegistry,
} from "./contract";
import { getAutomation } from "./registry";

export type AutomationDispatchResult<T> =
  | { executed: true; result: T; actionOutcome: AutomationActionOutcome }
  | { executed: false; reason: "disabled" | "trigger_mismatch" | "condition" };

export async function dispatchAutomationEvent<T, C extends AutomationContext>(
  registry: AutomationRegistry,
  id: string,
  context: C,
  action: (context: C) => Promise<T> | T,
  adapters: AutomationAdapters = {},
): Promise<AutomationDispatchResult<T>> {
  const definition = getAutomation<C>(registry, id);
  if (definition.trigger.kind !== "event" ||
      !context.event || !definition.trigger.events.includes(context.event)) {
    return { executed: false, reason: "trigger_mismatch" };
  }
  return dispatchDefinition(definition, context, action, adapters);
}

export async function dispatchDefinition<T, C extends AutomationContext>(
  definition: AutomationDefinition<C>,
  context: C,
  action: (context: C) => Promise<T> | T,
  adapters: AutomationAdapters = {},
): Promise<AutomationDispatchResult<T>> {
  if (!definition.enabled) return { executed: false, reason: "disabled" };
  if (!definition.condition.evaluate(context)) {
    return { executed: false, reason: "condition" };
  }

  preflightAutomation(definition, adapters);
  if (definition.delay) {
    await adapters.delay!.wait(definition.id, definition.delay.milliseconds, context);
  }
  const result = await action(context);
  const actionOutcome = definition.actionOutcome?.(result, context) ?? "success";
  if (actionOutcome === "success") {
    for (const cancellationId of definition.cancels) {
      await adapters.cancellation!.cancel(definition.id, cancellationId, context);
    }
  }
  return { executed: true, result, actionOutcome };
}

export function preflightAutomation<C extends AutomationContext>(
  definition: AutomationDefinition<C>,
  adapters: AutomationAdapters,
): void {
  if (definition.delay) {
    if (!Number.isFinite(definition.delay.milliseconds) || definition.delay.milliseconds < 0) {
      throw new Error(`Automation ${definition.id} has an invalid delay`);
    }
    if (!adapters.delay) {
      throw new Error(
        `Automation ${definition.id} requires durable delay adapter ${definition.delay.durableAdapter}`,
      );
    }
  }

  if (definition.cancels.length) {
    if (!adapters.cancellation) {
      throw new Error(`Automation ${definition.id} requires a cancellation adapter`);
    }
  }
}