import type { AutomationContext, AutomationDefinition } from "../contract";

export const providerProviderRejectionFeedbackFollowOnsAutomation: AutomationDefinition<AutomationContext> = {
  id: "provider.provider-rejection-feedback-follow-ons",
  name: "Run existing provider rejection feedback notice and email",
  domain: "provider",
  type: "operational",
  trigger: { kind: "event", events: ["provider.application.rejection-feedback-updated"] },
  condition: {
    description: "Only a requested provider rejection-feedback update with an application and user id is eligible; repeating the update repeats both follow-ons.",
    evaluate: (context) => typeof context.applicationId === "string" &&
      typeof context.userId === "string" && context.requestedContext === "rejection-feedback-update",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing PATCH route writes feedback before this group; feedback edits intentionally resend the existing notification and fire-and-forget rejection email. Existing notification error propagation and email behavior are unchanged.",
  action: { kind: "send_message", detail: "Run the existing provider rejection-feedback notification and email calls" },
  retryPolicy: "Caller-owned; no retry, queue, or durable outbox is added.",
  failureBehavior: "Existing awaited notification failure propagation and email behavior remain unchanged; no durable retry.",
  enabled: true,
};