import type { AutomationDefinition, AutomationContext } from "../contract";

export const stripeConnectReminderAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.stripe-connect-reminder",
  name: "Stripe Connect onboarding reminder",
  domain: "payments",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "every 72 hours with existing restart-aware first-run calculation",
    scheduleId: "stripe-connect-reminder",
    source: "stripeConnectReminderScheduler warm-instance timer only",
  },
  condition: {
    description: "Run only from the existing Stripe Connect reminder scheduler.",
    evaluate: (context) => context.triggeredBy === "stripe-connect-reminder",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing query applies a 72-hour notification cooldown; it is not an atomic uniqueness guard.",
  action: {
    kind: "mutate_record",
    detail: "Existing service sends in-app onboarding reminders to approved providers/experts who still need Connect setup",
  },
  retryPolicy: "Existing background-job runner handles transient DB failures; service logs/catches batch errors.",
  failureBehavior: "No payout is initiated; existing startup behavior defers a full interval after a cooldown-query failure.",
  enabled: true,
};