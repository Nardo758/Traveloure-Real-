import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingAvailabilityPatternAuthoringAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.availability-pattern-authoring",
  name: "Materialize slots after weekly-pattern save",
  domain: "bookings",
  type: "operational",
  trigger: { kind: "event", events: ["provider.availability.patterns.saved"] },
  condition: {
    description: "Only run after the existing owner-authorized weekly-pattern save supplies its service id.",
    evaluate: (context) => typeof context.serviceId === "string" && context.serviceId.length > 0,
  },
  idempotencyKey: "(service_id, date, start_time) unique constraint with ON CONFLICT DO NOTHING",
  delay: null,
  cancels: [],
  actionGuard: "The existing materializer remains add-only and conflict-safe; the owner authorization and pattern save stay in the request transaction/path.",
  action: { kind: "mutate_record", detail: "Run materializeServiceAvailability for the service whose weekly patterns were just saved" },
  retryPolicy: "The request retains its current error response; a later save or daily sweep can revisit eligible slots.",
  failureBehavior: "The route keeps its existing error handling and response shape; existing slots are never deleted.",
  enabled: true,
};