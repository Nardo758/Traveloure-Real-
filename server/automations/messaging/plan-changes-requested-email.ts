import type { AutomationContext, AutomationDefinition } from "../contract";

export const planChangesRequestedEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.plan-changes-requested-email",
  name: "Notify expert that plan changes were requested",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["plan.changes_requested_email"] },
  condition: { description: "Run at the existing changes-requested email call site.", evaluate: () => true },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The caller's plan-review decision remains authoritative.",
  action: { kind: "send_message", detail: "Invoke the existing best-effort changes-requested email sender." },
  retryPolicy: "No automation retry; the sender catches/logs provider errors.",
  failureBehavior: "Existing best-effort sender behavior is retained; completion does not establish delivery.",
  enabled: true,
};