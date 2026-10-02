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

// Domains land one PR at a time (core first, then payments). Until the first domain's nodes are
// exported, an empty registry is the expected state and is reported, not thrown; the payments PR
// restores the hard failure so an empty registry can never pass once domains exist.
if (definitions.length === 0) {
  console.log(JSON.stringify({ count: 0, nodes: [], note: "no domain nodes exported yet" }, null, 2));
  process.exit(0);
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