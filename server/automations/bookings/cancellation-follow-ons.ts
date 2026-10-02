import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingCancellationFollowOnsAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.cancellation-follow-ons",
  name: "Shared booking cancellation follow-ons and slot release",
  domain: "bookings",
  type: "operational",
  trigger: { kind: "event", events: ["service_booking.cancelled", "service_booking.refunded"] },
  condition: {
    description: "Run for an existing caller that asks the shared status writer to cancel or refund a booking.",
    evaluate: (context) => context.status === "cancelled" || context.status === "refunded",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing status writer owns the guarded transition, optional deduped notice, and first-cancellation slot release in its transaction. Caller authorization, cancellation policy, refund decision, and payment work remain in their existing request/payment paths.",
  action: { kind: "mutate_record", detail: "Invoke the existing cancellation/refund status writer exactly once, including only its existing follow-on effects" },
  retryPolicy: "Existing request and per-item retry behavior is unchanged; a repeated transition cannot release capacity twice.",
  failureBehavior: "The shared writer result or transaction error passes through unchanged; this node creates no cancellation or refund policy.",
  enabled: true,
};