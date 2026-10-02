import type { AutomationDefinition, AutomationContext } from "../contract";

export const travelpayoutsReportPollAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.travelpayouts-report-poll",
  name: "Travelpayouts affiliate report poll",
  domain: "payments",
  type: "financial",
  trigger: {
    kind: "cron",
    schedule: "every 6 hours, plus warm-instance defense timer",
    scheduleId: "travelpayouts-report-poll",
    source: "cacheSchedulerService and POST /internal/jobs/travelpayouts-report-poll",
  },
  condition: {
    description: "Run only for the existing Travelpayouts report-poll trigger.",
    evaluate: (context) => context.triggeredBy === "travelpayouts-report-poll",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Matcher excludes rows already matched and uses its existing exact-token conditional write; fuzzy matches retain the documented race weakness.",
  action: {
    kind: "call_external_api",
    detail: "cacheSchedulerService.runTravelpayoutsReportPoll; no Partnerize scaffolding is activated",
  },
  retryPolicy: "Existing background-job transient-database retries; poll errors remain in the existing result.error field.",
  failureBehavior: "Missing token remains the existing no-op; returned poll errors remain failures at the internal route.",
  enabled: true,
};