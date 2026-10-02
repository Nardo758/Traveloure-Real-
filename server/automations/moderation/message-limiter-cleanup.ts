import type { AutomationContext, AutomationDefinition } from "../contract";

export const messageLimiterCleanupAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.message-rate-limiter-cleanup",
  name: "Evict expired messaging limiter entries",
  domain: "moderation",
  type: "security",
  trigger: {
    kind: "cron",
    schedule: "every 1 minute",
    scheduleId: "message-rate-limiter-cleanup",
    source: "server/infrastructure/message-rate-limiter.ts local interval",
  },
  condition: {
    description: "Only the existing process-local messaging limiter cleanup timer is eligible.",
    evaluate: (context) => context.triggeredBy === "message-rate-limiter-cleanup",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing per-process sender/recipient map cleanup removes expired entries; it is not a global or shared counter.",
  action: { kind: "mutate_record", detail: "Run the existing messaging limiter cleanup callback" },
  retryPolicy: "No retry; the next local minute interval repeats the map sweep.",
  failureBehavior: "Local cache eviction only; message send and chat request safety gates are unchanged.",
  enabled: true,
};