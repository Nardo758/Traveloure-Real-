import type { AutomationContext, AutomationDefinition } from "../contract";

export const providerExpertRejectionFeedbackNotificationAutomation: AutomationDefinition<AutomationContext> = {
  id: "provider.expert-rejection-feedback-notification",
  name: "Notify expert after existing rejection feedback edit",
  domain: "provider",
  type: "operational",
  trigger: { kind: "event", events: ["expert.application.rejection-feedback-updated"] },
  condition: {
    description: "Only a requested expert rejection-feedback update with an application and user id is eligible; repeating the update repeats its notice.",
    evaluate: (context) => typeof context.applicationId === "string" &&
      typeof context.userId === "string" && context.requestedContext === "rejection-feedback-update",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing PATCH route writes the feedback before this notice; edits to an already-rejected application intentionally send the existing notice each time. Existing insertNotification awaiting/error behavior is unchanged.",
  action: { kind: "send_message", detail: "Insert the existing expert rejection-feedback-updated notification" },
  retryPolicy: "Caller-owned; no retry or durable outbox is added.",
  failureBehavior: "Notification insertion failures propagate unchanged; no retry is added.",
  enabled: true,
};