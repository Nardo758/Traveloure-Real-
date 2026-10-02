import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingCompletionDeclarationWriterAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.completion-declaration-writer",
  name: "Shared booking completion declaration writer",
  domain: "bookings",
  type: "operational",
  trigger: { kind: "event", events: ["service_booking.completion_declaration.requested"] },
  condition: {
    description: "Run for an existing completion-declaration caller with a booking id and actor.",
    evaluate: (context) => typeof context.bookingId === "string" && typeof context.actor === "string",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "declareBookingCompletion preserves the shared eligibility derivation, guarded confirmed-to-completion_declared transition, declaration timestamp, provenance, and diary behavior; it does not mint.",
  action: { kind: "mutate_record", detail: "Invoke the existing declareBookingCompletion implementation exactly once" },
  retryPolicy: "Existing owner-route and scheduled-job retry semantics are unchanged; the conditional status transition remains the guard.",
  failureBehavior: "Returned refusal/lost-race outcomes and thrown errors pass through unchanged.",
  enabled: true,
};