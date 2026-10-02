import type { AutomationContext, AutomationDefinition } from "../contract";

export const activityEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.activity-email",
  name: "Enqueue earner activity email",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["activity.email"] },
  condition: { description: "Run for the existing activity-email producer call.", evaluate: () => true },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The action retains earner-role/address/preferences checks, its outbox-query hourly throttle (which is a check-then-enqueue and not atomic against concurrent sends), and its non-fatal failure handling.",
  action: { kind: "send_message", detail: "Build and enqueue the existing activity email through the email outbox; enqueue acceptance is not delivery." },
  retryPolicy: "No automation retry; the durable email outbox owns its existing retry behavior after enqueue.",
  failureBehavior: "The activity-email action catches/logs failures and returns skipped; it never fails the originating action.",
  enabled: true,
};