import type { AutomationDefinition } from "../contract";

export const commerceEmailSweepAutomation: AutomationDefinition = {
  id: "messaging.commerce-email-sweep",
  name: "Development commerce email sweep",
  domain: "messaging", type: "marketing",
  trigger: { kind: "cron", schedule: "*/15 * * * *",
    scheduleId: "commerce-email-sweep", source: "jobs-cron.yml / backstops" },
  condition: {
    description: "Isolated development verification only; release requires Parts 4 and 6; Part 5 item changes are must-have",
    evaluate: context => context.isolatedDevelopment === true,
  },
  idempotencyKey: "cart-reminder-{1h|1d|3d}:user:{user_id}:cart:{scope_id}:{sequence_id} | cart-item-changed:{canonical-target-sha256}",
  delay: null, cancels: [],
  actionGuard: "Refuse production/public schema and unknown rails; reminders: consent/daytime/shared cap, 3d terminal; item changes: must-have, snapshot + notified values, no marketing gate",
  action: { kind: "enqueue_job", detail: "SELECT candidates, enqueue existing outbox; item-change enqueue and JSONB notified values commit together" },
  retryPolicy: "Existing 15-minute external job retries; database commerceKey uniqueness",
  failureBehavior: "Throw, record FAILED heartbeat, preserve last actual success",
  enabled: true,
};
