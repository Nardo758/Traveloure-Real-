import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingAutoCompletionAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.auto-completion",
  name: "Unified paid booking auto-completion",
  domain: "bookings",
  type: "must_have",
  trigger: {
    kind: "cron",
    schedule: "hourly, with the existing jittered startup pass",
    scheduleId: "booking-auto-completion",
    source: "warm scheduler and POST /internal/jobs/booking-auto-completion",
  },
  condition: {
    description: "Run only for the existing booking-auto-completion schedule.",
    evaluate: (context) => context.triggeredBy === "booking-auto-completion",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing method eligibility and payment-on-record/Stripe-success gates remain in the job; completeBooking and the status writer retain their guarded transition and ledger protections. Unpaid recheck stamps, artifact acceptance, coordination close, and reconciliation remain distinct subpasses.",
  action: { kind: "mutate_record", detail: "Run the existing unified hourly booking completion job without changing its result contract" },
  retryPolicy: "Existing background-job-runner, per-booking isolation, Stripe lookup deferral, and next-pass behavior remain unchanged.",
  failureBehavior: "The job retains its current structured result and error handling; the registry adds no retry, mint, or fallback policy.",
  enabled: true,
};