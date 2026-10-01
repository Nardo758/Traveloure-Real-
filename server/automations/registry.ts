import type {
  AutomationContext,
  AutomationDefinition,
  AutomationDomain,
  AutomationRegistry,
} from "./contract";

export const AUTOMATION_DOMAINS: readonly AutomationDomain[] = [
  "messaging",
  "payments",
  "bookings",
  "moderation",
  "ai",
  "provider",
  "scheduled",
];

export function createAutomationRegistry(
  definitions: readonly AutomationDefinition[],
): AutomationRegistry {
  const byId = new Map<string, AutomationDefinition>();
  for (const definition of definitions) {
    if (!definition.id.trim()) throw new Error("Automation id must not be empty");
    if (definition.delay && (!Number.isFinite(definition.delay.milliseconds) ||
        definition.delay.milliseconds < 0)) {
      throw new Error(`Automation ${definition.id} has an invalid delay`);
    }
    if (definition.trigger.kind === "event" && !definition.trigger.events.length) {
      throw new Error(`Automation ${definition.id} must declare at least one event`);
    }
    if (byId.has(definition.id)) {
      throw new Error(`Duplicate automation id: ${definition.id}`);
    }
    byId.set(definition.id, definition);
  }

  for (const definition of definitions) {
    if (definition.cancels.length && !definition.actionOutcome) {
      throw new Error(
        `Automation ${definition.id} must declare an action outcome before it can cancel automations`,
      );
    }
    for (const cancellationId of definition.cancels) {
      if (cancellationId === definition.id) {
        throw new Error(`Automation ${definition.id} cannot cancel itself`);
      }
      if (!byId.has(cancellationId)) {
        throw new Error(
          `Automation ${definition.id} cancels missing automation ${cancellationId}`,
        );
      }
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`Automation cancellation cycle includes ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const cancellationId of byId.get(id)?.cancels ?? []) visit(cancellationId);
    visiting.delete(id);
    visited.add(id);
  };
  Array.from(byId.keys()).forEach(visit);

  return { domains: AUTOMATION_DOMAINS, byId };
}

export function getAutomation<C extends AutomationContext = AutomationContext>(
  registry: AutomationRegistry,
  id: string,
): AutomationDefinition<C> {
  const definition = registry.byId.get(id);
  if (!definition) throw new Error(`Unknown automation id: ${id}`);
  return definition as AutomationDefinition<C>;
}