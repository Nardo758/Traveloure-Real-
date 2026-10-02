import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingCompletionWriterAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.completion-writer",
  name: "Shared service-booking completion writer",
  domain: "bookings",
  type: "financial",
  trigger: { kind: "event", events: ["service_booking.completion.requested"] },
  condition: {
    description: "Run for an existing caller of the shared completion writer with a booking id and actor.",
    evaluate: (context) => typeof context.bookingId === "string" && typeof context.actor === "string",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "completeBooking keeps the eligibility derivation, guarded service-booking status transition, same-transaction mint, provenance, and diary write for timer, traveler acceptance, and bundle callers.",
  action: { kind: "mutate_record", detail: "Invoke the existing completeBooking implementation exactly once" },
  retryPolicy: "Existing callers retain their current retry and result semantics; the writer's conditional and ledger guards remain authoritative.",
  failureBehavior: "Thrown writer failures and returned refusal/lost-race results pass through unchanged.",
  enabled: true,
};