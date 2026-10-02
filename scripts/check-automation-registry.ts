/**
 * Read-only registry inspection. Never executes an action or provisions a runner.
 * Used by operators/reviewers to inspect stable identities and declared behavior.
 */
import { createAutomationRegistry } from "../server/automations/registry";
import * as registryExports from "../server/automations";
import type { AutomationDefinition } from "../server/automations/contract";

const definitions = Object.entries(registryExports)
  .filter(([name, value]) => name.endsWith("Automations") && Array.isArray(value))
  .flatMap(([, value]) => value as readonly AutomationDefinition[]);

if (definitions.length === 0) {
  throw new Error("The automation registry contains no exported domain nodes");
}

const registry = createAutomationRegistry(definitions);
const rows = Array.from(registry.byId.values()).map((node) => ({
  id: node.id,
  domain: node.domain,
  type: node.type,
  enabled: node.enabled,
  trigger: node.trigger,
  condition: node.condition.description,
  idempotencyKey: node.idempotencyKey,
  delay: node.delay,
  cancels: node.cancels,
  action: node.action,
  retryPolicy: node.retryPolicy,
  failureBehavior: node.failureBehavior,
}));

console.log(JSON.stringify({ count: rows.length, nodes: rows }, null, 2));