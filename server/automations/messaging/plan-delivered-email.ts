import type { AutomationContext, AutomationDefinition } from "../contract";

export const planDeliveredEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.plan-delivered-email",
  name: "Notify traveler that a plan was delivered",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["plan.delivered_email"] },
  condition: { description: "Run at the existing delivered-plan email call site.", evaluate: () => true },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The caller's plan-status transition gate remains authoritative.",
  action: { kind: "send_message", detail: "Invoke the existing best-effort plan-delivered email sender." },
  retryPolicy: "No automation retry; the sender catches/logs provider errors.",
  failureBehavior: "Existing best-effort sender behavior is retained; completion does not establish delivery.",
  enabled: true,
};