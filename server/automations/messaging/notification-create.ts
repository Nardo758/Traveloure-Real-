import type { AutomationContext, AutomationDefinition } from "../contract";

export const messagingNotificationCreateAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.notification-create",
  name: "Dispatch the existing notification phone twin after bell-row creation",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["notification.created"] },
  condition: {
    description: "Only an inserted notification row with an id schedules its existing push dispatcher.",
    evaluate: (context) => typeof context.notificationId === "string",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing createNotification method owns notification persistence. This action only invokes the existing preference- and consent-aware push dispatcher for the inserted row.",
  action: { kind: "call_external_api", detail: "Invoke the existing asynchronous push dispatcher without delaying notification persistence" },
  retryPolicy: "Existing nonblocking dispatcher behavior only; no retry or delivery guarantee is introduced.",
  failureBehavior: "Push dispatch remains fire-and-forget and its errors remain swallowed by the existing createNotification caller.",
  enabled: true,
};