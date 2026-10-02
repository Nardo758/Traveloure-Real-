import type { AutomationContext, AutomationDefinition } from "../contract";

export const providerProviderApplicationDecisionFollowOnsAutomation: AutomationDefinition<AutomationContext> = {
  id: "provider.provider-application-decision-follow-ons",
  name: "Run existing provider application decision follow-ons",
  domain: "provider",
  type: "operational",
  trigger: { kind: "event", events: ["provider.application.decision"] },
  condition: {
    description: "Only an existing approved or rejected decision that entered its requested terminal status with a provider application and user id is eligible.",
    evaluate: (context) => (context.decision === "approved" || context.decision === "rejected") &&
      context.enteredTerminalStatus === true &&
      typeof context.applicationId === "string" && typeof context.userId === "string",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The route's enteredStatus(updated, 'approved') gate owns one-time follow-ons; existing notification insertion remains awaited and the existing approval email remains bare fire-and-forget. Role, status, audit, and rollback writes remain outside this follow-on.",
  action: { kind: "send_message", detail: "Run the existing provider application decision notification/email calls" },
  retryPolicy: "Caller-owned; no retry, queue, or durable outbox is added.",
  failureBehavior: "Existing notification failure propagation and email behavior are unchanged; there is no durable retry.",
  enabled: true,
};