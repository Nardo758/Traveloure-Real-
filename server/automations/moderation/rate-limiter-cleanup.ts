import type { AutomationContext, AutomationDefinition } from "../contract";

export const rateLimiterCleanupAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.rate-limiter-cleanup",
  name: "Evict expired in-memory request rate-limit entries",
  domain: "moderation",
  type: "security",
  trigger: {
    kind: "cron",
    schedule: "every 1 minute",
    scheduleId: "rate-limiter-cleanup",
    source: "server/infrastructure/rate-limiter.ts local interval",
  },
  condition: {
    description: "Only the existing in-process generic limiter cleanup timer is eligible.",
    evaluate: (context) => context.triggeredBy === "rate-limiter-cleanup",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing per-process map cleanup removes only entries whose reset time has elapsed; it is not a global or shared rate counter.",
  action: { kind: "mutate_record", detail: "Run the existing generic InMemoryRateLimiter cleanup callback" },
  retryPolicy: "No retry; next local interval runs the same map sweep.",
  failureBehavior: "Local cache eviction only; existing request-path rate-limit decisions remain unchanged.",
  enabled: true,
};