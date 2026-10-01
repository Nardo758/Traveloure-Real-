import type { AutomationDefinition, AutomationContext } from "../contract";

export const earningsReleaseAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.earnings-release",
  name: "Matured earnings release",
  domain: "payments",
  type: "financial",
  trigger: {
    kind: "cron",
    schedule: "hourly, with first warm-instance pass after startup delay",
    scheduleId: "earnings-release",
    source: "earningsReleaseScheduler and POST /internal/jobs/earnings-release",
  },
  condition: {
    description: "Run only for the existing scheduled earnings-release pass.",
    evaluate: (context) => context.triggeredBy === "earnings-release",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "storage.releaseMaturedEarnings uses atomic conditional updates; this registry performs no pre-check.",
  action: {
    kind: "mutate_record",
    detail: "storage.releaseMaturedEarnings; no payout transfer is initiated",
  },
  retryPolicy: "Existing runBackgroundJob transient-database retries; local scheduler retains its current error handling.",
  failureBehavior: "Service-reported {error} remains distinguishable from a skip; caller behavior is unchanged.",
  enabled: true,
};