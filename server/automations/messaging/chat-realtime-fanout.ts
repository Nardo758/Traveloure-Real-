import type { AutomationContext, AutomationDefinition } from "../contract";

export const messagingChatRealtimeFanoutAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.chat-realtime-fanout",
  name: "Relay an already-persisted chat frame to the recipient socket",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["chat.realtime.requested"] },
  condition: {
    description: "Run only when an existing HTTP or WebSocket caller requests its post-persist frame relay.",
    evaluate: (context) => context.transport === "http" || context.transport === "websocket",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The caller retains authorization, sanitization, block/rate guards, persistence, frame construction, and sender acknowledgement. The existing synchronous broadcastToUser helper performs the recipient relay exactly once.",
  action: { kind: "send_message", detail: "Synchronously forward the existing chat frame to the recipient's connected WebSocket client" },
  retryPolicy: "No retry, queue, or delivery guarantee; preserve the existing immediate best-effort socket write.",
  failureBehavior: "Socket errors retain the existing caller error handling; no sender acknowledgement or recipient frame is added by this node.",
  enabled: true,
};