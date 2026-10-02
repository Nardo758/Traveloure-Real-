import type { AutomationContext, AutomationDefinition } from "../contract";

export const internalLimiterCleanupAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.internal-jobs-limiter-cleanup",
  name: "Evict expired internal-job limiter state",
  domain: "moderation",
  type: "security",
  trigger: {
    kind: "cron",
    schedule: "every 1 minute",
    scheduleId: "internal-jobs-limiter-cleanup",
    source: "server/middleware/internal-jobs-limiter.ts local interval",
  },
  condition: {
    description: "Only the existing internal-job middleware state sweep is eligible.",
    evaluate: (context) => context.triggeredBy === "internal-jobs-limiter-cleanup",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing per-process map cleanup removes only expired idle lockout/rate-cap state; request authentication and limiter semantics remain unchanged.",
  action: { kind: "mutate_record", detail: "Run the existing internal-jobs-limiter state sweep callback" },
  retryPolicy: "No retry; the next local minute interval repeats the eviction sweep.",
  failureBehavior: "Local middleware housekeeping only; it does not loosen request-path limits or lockout.",
  enabled: true,
};