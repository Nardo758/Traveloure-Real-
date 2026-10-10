import type { AutomationDefinition } from "../contract";

export const commerceEmailSweepAutomation: AutomationDefinition = {
  id: "messaging.commerce-email-sweep",
  name: "Development commerce email sweep",
  domain: "messaging", type: "marketing",
  trigger: { kind: "cron", schedule: "*/15 * * * *",
    scheduleId: "commerce-email-sweep", source: "jobs-cron.yml / backstops" },
  condition: {
    description: "Isolated development verification only; release requires Parts 4 and 6",
    evaluate: context => context.isolatedDevelopment === true,
  },
  idempotencyKey: "cart-reminder-{1h|1d|3d}:user:{user_id}:cart:{scope_id}:{sequence_id}",
  delay: null, cancels: [],
  actionGuard: "Refuse production/public schema and unknown rails; stored clock, consent, account, daytime window, shared cap; 3d terminal",
  action: { kind: "enqueue_job", detail: "SELECT candidates, INSERT pending email_outbox only" },
  retryPolicy: "Existing 15-minute external job retries; database commerceKey uniqueness",
  failureBehavior: "Throw, record FAILED heartbeat, preserve last actual success",
  enabled: true,
};
