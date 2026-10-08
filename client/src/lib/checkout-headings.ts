/**
 * WHAT THE PAY SHEET SAYS IT IS FOR (ledger `2026-10-08-optimize-pay-flow`; decision-maker, Oct 8, 2026 —
 * the f413eda smoke). `StripeCheckout` takes its heading from its caller; "Complete Your Booking" is the
 * heading of a BOOKING checkout and of nothing else. Every heading is spelled here, once (§18 rule 1).
 * A plan name that is absent is left out — never "Untitled" (§13).
 */
export const BOOKING_CHECKOUT_HEADING = "Complete Your Booking";

const withPlan = (what: string, planName?: string | null) => {
  const name = (planName ?? "").trim();
  return name ? `${what} · ${name}` : what;
};

export const optimizeCheckoutHeading = (planName?: string | null) => withPlan("Pay for Optimize", planName);
export const tripPassCheckoutHeading = (planName?: string | null) => withPlan("Pay for the Trip Pass", planName);
export const aiTaskCheckoutHeading = (planName?: string | null) => withPlan("Pay for this AI task", planName);
export const COORDINATION_FEE_CHECKOUT_HEADING = "Pay the coordination fee";
export const readyMadeCheckoutHeading = (tripTitle?: string | null) => withPlan("Pay for this ready-made trip", tripTitle);
export const EXPERT_HELP_CHECKOUT_HEADING = "Pay for expert help";
