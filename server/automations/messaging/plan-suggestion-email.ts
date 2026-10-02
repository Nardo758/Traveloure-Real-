import type { AutomationContext, AutomationDefinition } from "../contract";

export const planSuggestionEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.plan-suggestion-email",
  name: "Notify traveler of an expert plan suggestion",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["plan.suggestion_email"] },
  condition: { description: "Run at the existing plan-suggestion email call site.", evaluate: () => true },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The caller's post-approval suggestion gate remains authoritative; this action does not re-check it.",
  action: { kind: "send_message", detail: "Invoke the existing best-effort suggestion email sender." },
  retryPolicy: "No automation retry; the sender catches/logs provider errors.",
  failureBehavior: "Existing best-effort sender behavior is retained; completion does not establish delivery.",
  enabled: true,
};