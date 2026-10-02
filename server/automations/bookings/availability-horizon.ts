import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingAvailabilityHorizonAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.availability-horizon-materialization",
  name: "Extend recurring service availability horizon",
  domain: "bookings",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "daily after the existing delayed startup pass",
    scheduleId: "availability-materialization",
    source: "availabilityMaterializationSweep and POST /internal/jobs/availability-materialization",
  },
  condition: {
    description: "Run only through the existing availability-materialization schedule.",
    evaluate: (context) => context.triggeredBy === "availability-materialization",
  },
  idempotencyKey: "(service_id, date, start_time) unique constraint with ON CONFLICT DO NOTHING",
  delay: null,
  cancels: [],
  actionGuard: "Existing per-service pattern/blackout derivation and add-only unique-conflict handling remain authoritative; this sweep never deletes slots or alters booked inventory.",
  action: { kind: "mutate_record", detail: "Extend the existing rolling availability horizon for services with weekly patterns" },
  retryPolicy: "Per-service failures remain isolated; the next daily sweep retries.",
  failureBehavior: "Existing result and logging behavior is preserved; no stale-slot cleanup is inferred.",
  enabled: true,
};