import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingAvailabilityDateRangeAuthoringAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.availability-date-range-authoring",
  name: "Materialize and reprice slots after date-range save",
  domain: "bookings",
  type: "operational",
  trigger: { kind: "event", events: ["provider.availability.date-ranges.saved"] },
  condition: {
    description: "Only run after the existing owner-authorized property date-range save supplies its service id.",
    evaluate: (context) => typeof context.serviceId === "string" && context.serviceId.length > 0,
  },
  idempotencyKey: "(service_id, date, start_time) unique constraint with ON CONFLICT DO NOTHING",
  delay: null,
  cancels: [],
  actionGuard: "Existing date-range materialization is add-only; repricing remains bounded to unbooked date-range rows. Route validation and owner authorization are unchanged.",
  action: { kind: "mutate_record", detail: "Run the existing date-range materializer and unbooked-slot repricing for the saved service" },
  retryPolicy: "The request retains its current error response; a later save can revisit the existing action.",
  failureBehavior: "The route keeps its existing response and error handling; no cleanup/deletion of stale slots is added.",
  enabled: true,
};