import type { AutomationContext, AutomationDefinition } from "../contract";

export const messagingChatFollowOnsAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.chat-follow-ons",
  name: "Schedule recipient notification and activity email after shared chat persistence",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["chat.created"] },
  condition: {
    description: "Only a successfully persisted chat with a recipient is eligible; persistence and request guards stay with their existing callers.",
    evaluate: (context) => typeof context.chatId === "string" && typeof context.receiverId === "string",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The shared storage createChat path persists and registers the chat before this action. It schedules the existing best-effort recipient notification and activity-email sender; authorization, sanitization, block/rate guards, and writes remain in their existing actions. Realtime relay remains at the transport caller.",
  action: { kind: "mutate_record", detail: "Run the existing post-persist notification and activity-email scheduling for this chat" },
  retryPolicy: "Caller-owned; no retry or delivery guarantee is added around these already-committed follow-ons.",
  failureBehavior: "Follow-on failures do not roll back the persisted chat; notification failures retain their existing catch and activity email remains fire-and-forget.",
  enabled: true,
};