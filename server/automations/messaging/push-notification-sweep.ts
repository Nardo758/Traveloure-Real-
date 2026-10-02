import type { AutomationContext, AutomationDefinition } from "../contract";

export const pushNotificationSweepAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.push-notification-sweep",
  name: "Sweep recent notifications for unclaimed phone push",
  domain: "messaging",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "every 5 minutes",
    scheduleId: "push-notification-sweep",
    source: "server/services/email-outbox.service.ts existing composite outbox scheduler",
  },
  condition: {
    description: "Run only when invoked by the existing five-minute push sweep entrypoint.",
    evaluate: (context) => context.scheduleId === "push-notification-sweep",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing sweep requires configured push keys, limits selection to recent notices with a device, claims atomically before sending, and applies the existing preference mapping and per-user push gates.",
  action: { kind: "call_external_api", detail: "Claim and attempt push delivery for up to 100 recent unclaimed notifications" },
  retryPolicy: "No registry retry or new queue. Existing notification claims are not retried; the existing sweep cadence only considers unclaimed notices still inside the push window.",
  failureBehavior: "The sweep preserves its existing non-fatal result of zero claimed/sent on sweep-level errors. Its counts are attempts/accepted devices, not proof a user received or read a notification.",
  enabled: true,
};