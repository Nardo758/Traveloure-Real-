import type { AutomationContext, AutomationDefinition } from "../contract";

export const messagingMessageFollowOnsAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.message-follow-ons",
  name: "Schedule direct-message notification and activity email after message persistence",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["message.created"] },
  condition: {
    description: "Only the existing sendMessage action's persisted message and resolved participants are eligible.",
    evaluate: (context) => typeof context.messageId === "string" &&
      typeof context.senderId === "string" && typeof context.recipientId === "string",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing sendMessage action persists the message before dispatch. Its existing notification insertion/error propagation and fire-and-forget push/activity senders remain the action boundary; caller authorization, sanitization, block/rate guards, and message write are unchanged.",
  action: { kind: "mutate_record", detail: "Run the existing post-persist notification and activity-email scheduling for this message" },
  retryPolicy: "Caller-owned; no retry, queue, or provider-delivery guarantee is added.",
  failureBehavior: "Existing notification insertion failures propagate unchanged after the message commit; push and activity email remain fire-and-forget.",
  enabled: true,
};