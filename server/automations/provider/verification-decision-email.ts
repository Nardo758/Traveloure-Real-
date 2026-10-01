import type { AutomationContext, AutomationDefinition } from "../contract";

export const providerVerificationDecisionEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "provider.verification-decision-email",
  name: "Send existing provider verification decision email",
  domain: "provider",
  type: "operational",
  trigger: { kind: "event", events: ["provider.verification.decision-changed"] },
  condition: {
    description: "Only a verified/rejected decision that differs from the previously-read status and has a recipient email is eligible.",
    evaluate: (context) => (context.decision === "verified" || context.decision === "rejected") &&
      context.decision !== context.priorStatus && typeof context.userId === "string" &&
      typeof context.email === "string",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing route's prior-status comparison and recipient check gate the email; the sender remains bare fire-and-forget with its existing promise .catch and import/send catch behavior. The verification write is outside this follow-on.",
  action: { kind: "send_message", detail: "Schedule the existing verification decision email" },
  retryPolicy: "Caller-owned; fire-and-forget sender behavior is retained with no durable retry.",
  failureBehavior: "Existing logged fire-and-forget rejection and import/send catch behavior are unchanged.",
  enabled: true,
};