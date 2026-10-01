import type { AutomationContext, AutomationDefinition } from "../contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasLegacyBooking(context: AutomationContext): boolean {
  if (context.signatureVerified !== true || !context.payload || typeof context.payload !== "object") return false;
  const paymentIntent = context.payload as { metadata?: { bookingIds?: unknown } };
  return typeof paymentIntent.metadata?.bookingIds === "string" &&
    paymentIntent.metadata.bookingIds.split(",").some((bookingId) => UUID.test(bookingId.trim()));
}

export const platformLegacyBookingSuccessAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-legacy-booking-success",
  name: "Platform legacy booking success",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["payment_intent.succeeded"] },
  condition: {
    description: "A signed platform PaymentIntent must carry at least one legacy booking UUID.",
    evaluate: hasLegacyBooking,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing legacy writer retains its confirmed-status guard and email behavior; this node introduces no payout or payment transfer.",
  action: {
    kind: "mutate_record",
    detail: "The legacy bookings-table status confirmation and confirmation-email branch remains unchanged",
  },
  retryPolicy: "Preserve the platform PaymentIntent webhook's existing thrown-error behavior.",
  failureBehavior: "Cart, balance, and ready-made ids are not treated as legacy booking UUIDs.",
  enabled: true,
};