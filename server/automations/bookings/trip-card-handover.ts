import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingTripCardHandoverAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.trip-card-handover-nudge",
  name: "Nudge trip owner to review the Trip Card",
  domain: "bookings",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "hourly with the existing jittered startup pass",
    scheduleId: "trip-card-handover",
    source: "tripCardHandoverScheduler",
  },
  condition: {
    description: "Run only through the existing trip-card handover scheduler.",
    evaluate: (context) => context.triggeredBy === "trip-card-handover",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing T-48h/finalization candidate query is unchanged; NOT EXISTS against trip_card_ready notifications suppresses repeats but is not an atomic unique claim.",
  action: { kind: "send_message", detail: "Create the existing trip_card_ready notification only; do not finalize the trip" },
  retryPolicy: "Existing per-trip best-effort failures are retried by a later hourly pass while eligible.",
  failureBehavior: "Notification failures remain isolated and logged; no email or external runner is introduced.",
  enabled: true,
};