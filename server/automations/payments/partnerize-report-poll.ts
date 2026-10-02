import type { AutomationDefinition, AutomationContext } from "../contract";

export const partnerizeReportPollAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.partnerize-report-poll",
  name: "Conditional Partnerize conversion report poll",
  domain: "payments",
  type: "financial",
  trigger: {
    kind: "cron",
    schedule: "every 6 hours only after the existing credential gate",
    scheduleId: "partnerize-report-poll",
    source: "cacheSchedulerService credential-conditional warm timer; no external runner route",
  },
  condition: {
    description: "Partnerize credentials must already have resolved in the current scheduler path.",
    evaluate: (context) => context.credentialsConfigured === true,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing affiliateReconciliationService matching rules own persistence; this unvalidated poll has no independent idempotency key.",
  action: {
    kind: "call_external_api",
    detail: "The existing Partnerize report poll and matcher remain conditional and local-only",
  },
  retryPolicy: "Existing void-returning poll catches/logs errors; no external cron retry channel was found.",
  failureBehavior: "This remains unvalidated credential-gated scaffolding and absent from external cron.",
  enabled: true,
};