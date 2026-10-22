/**
 * Whether a Checkout Session webhook may fulfill
 * (ledger `2026-10-21-checkout-dynamic-methods`).
 *
 * `checkout.session.completed` can arrive while `payment_status` is still
 * `unpaid` for a delayed method. Fulfillment runs only when the session
 * says `paid`. `async_payment_failed` never fulfills. Anything else is
 * not a Checkout Session fulfillment event.
 *
 * Membership entitlement is not decided here. It stays on
 * `customer.subscription.*`, which already maps an incomplete subscription
 * to lapsed.
 */

export type CheckoutSessionFulfillment = "fulfill" | "withhold";

export function checkoutSessionFulfillment(
  eventType: string,
  paymentStatus: string | null | undefined,
): CheckoutSessionFulfillment | null {
  if (
    eventType !== "checkout.session.completed" &&
    eventType !== "checkout.session.async_payment_succeeded" &&
    eventType !== "checkout.session.async_payment_failed"
  ) {
    return null;
  }
  if (eventType === "checkout.session.async_payment_failed") return "withhold";
  return paymentStatus === "paid" ? "fulfill" : "withhold";
}

/** Operator log. Session id and status only — no payload, no key. */
export function checkoutSessionWithholdLogLine(
  eventType: string,
  paymentStatus: string | null | undefined,
  sessionId: string | null | undefined,
): string {
  return `[stripe-webhook] ${eventType} withheld; payment_status=${paymentStatus ?? "absent"} session=${sessionId ?? "absent"}`;
}
