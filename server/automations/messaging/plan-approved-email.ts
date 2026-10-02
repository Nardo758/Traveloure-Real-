import type { AutomationContext, AutomationDefinition } from "../contract";

export const planApprovedEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.plan-approved-email",
  name: "Notify expert that a delivered plan was approved",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["plan.approved_email"] },
  condition: { description: "Run at the existing approved-plan email call site.", evaluate: () => true },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The caller's plan-review decision remains authoritative.",
  action: { kind: "send_message", detail: "Invoke the existing best-effort plan-approved email sender." },
  retryPolicy: "No automation retry; the sender catches/logs provider errors.",
  failureBehavior: "Existing best-effort sender behavior is retained; completion does not establish delivery.",
  enabled: true,
};