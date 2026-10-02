import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingLegacyPaymentExpiryAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.legacy-payment-expiry",
  name: "Expire stale legacy pending-payment bookings",
  domain: "bookings",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "every four hours with the existing jittered startup pass",
    scheduleId: "booking-expiry",
    source: "BookingExpirySchedulerService and POST /internal/jobs/booking-expiry",
  },
  condition: {
    description: "Run only through the existing booking-expiry pass.",
    evaluate: (context) => context.triggeredBy === "booking-expiry",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Only legacy bookings.status=pending_payment rows older than the configured threshold are conditionally changed; the existing status predicate prevents a concurrent confirmed/cancelled row from being overwritten.",
  action: { kind: "mutate_record", detail: "Run the existing legacy pending-payment cancellation sweep and its best-effort notice" },
  retryPolicy: "Per-booking errors remain isolated and eligible rows are retried by a later existing pass.",
  failureBehavior: "The scheduler preserves its current stats, error collection, and manual-run result semantics; payment/refund policy is not added.",
  enabled: true,
};