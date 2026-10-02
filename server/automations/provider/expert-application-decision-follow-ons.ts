import type { AutomationContext, AutomationDefinition } from "../contract";

export const providerExpertApplicationDecisionFollowOnsAutomation: AutomationDefinition<AutomationContext> = {
  id: "provider.expert-application-decision-follow-ons",
  name: "Run existing expert application decision follow-ons",
  domain: "provider",
  type: "operational",
  trigger: { kind: "event", events: ["expert.application.decision"] },
  condition: {
    description: "Only an existing approved or rejected decision that entered its requested terminal status with an expert application and user id is eligible.",
    evaluate: (context) => (context.decision === "approved" || context.decision === "rejected") &&
      context.enteredTerminalStatus === true &&
      typeof context.applicationId === "string" && typeof context.userId === "string",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The route's enteredStatus(updated, 'approved') gate owns one-time follow-ons; existing notification insertion remains awaited and may fail the request, while the existing email sender remains bare fire-and-forget inside its existing import/send catch. Role, status, audit, and rollback writes remain outside this follow-on.",
  action: { kind: "send_message", detail: "Run the existing expert application decision notification/email calls" },
  retryPolicy: "Caller-owned; no retry, queue, or durable outbox is added.",
  failureBehavior: "Existing notification and email error behavior is unchanged; there is no durable retry.",
  enabled: true,
};