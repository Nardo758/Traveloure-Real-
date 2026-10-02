import type { AutomationContext, AutomationDefinition } from "../contract";

export const suspensionSessionCleanupAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.suspension-session-cleanup",
  name: "Purge sessions and close live sockets after a persisted manual suspension",
  domain: "moderation",
  type: "security",
  trigger: { kind: "event", events: ["admin.user_suspension.persisted"] },
  condition: {
    description: "Only run after the existing admin action has persisted a non-admin target suspension.",
    evaluate: (context) => context.suspensionPersisted === true && typeof context.userId === "string",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The admin route retains manual authorization, target validation, persistence, audit, and idempotence; this node wraps only its existing post-persist best-effort session/socket cleanup.",
  action: { kind: "mutate_record", detail: "Delete the target user's sessions and disconnect its live WebSocket using the existing route callbacks" },
  retryPolicy: "No automatic retry; both cleanup operations retain their existing independent best-effort catches.",
  failureBehavior: "Suspension remains persisted even if session purge or WebSocket disconnect fails; authentication request/login gates remain authoritative.",
  enabled: true,
};