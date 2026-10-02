import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingAvailabilityBlackoutAuthoringAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.availability-blackout-authoring",
  name: "Re-run availability materializers after blackout save",
  domain: "bookings",
  type: "operational",
  trigger: { kind: "event", events: ["provider.availability.blackouts.saved"] },
  condition: {
    description: "Only run after the existing owner-authorized blackout save supplies its service id.",
    evaluate: (context) => typeof context.serviceId === "string" && context.serviceId.length > 0,
  },
  idempotencyKey: "(service_id, date, start_time) unique constraint with ON CONFLICT DO NOTHING",
  delay: null,
  cancels: [],
  actionGuard: "The existing weekly-pattern and date-range materializers remain add-only and honor saved blackouts for future inserts; pre-existing slots, including booked slots, are not deleted or changed.",
  action: { kind: "mutate_record", detail: "Re-run the existing weekly-pattern and date-range materializers for the saved service" },
  retryPolicy: "The request retains its current error handling; a later save or horizon sweep may revisit eligible future slots.",
  failureBehavior: "Existing route response semantics remain unchanged; no slot cancellation policy is introduced.",
  enabled: true,
};