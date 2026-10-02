import type { AutomationDefinition, AutomationContext } from "../contract";

export const platformPaymentIntentCanceledAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-payment-intent-canceled",
  name: "Platform PaymentIntent canceled",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["payment_intent.canceled"] },
  condition: {
    description: "A signature-verified platform PaymentIntent cancellation event is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing shared claim-release writer checks durable stamped claims and owns slot/itinerary/notice effects; no registry cancellation is involved.",
  action: {
    kind: "mutate_record",
    detail: "stripePaymentService.handleWebhook stamps cancellation, releases stamped cart claims, and updates legacy bookings",
  },
  retryPolicy: "Thrown handler errors remain HTTP 500 for Stripe retry; release helper's existing nonthrowing behavior is preserved.",
  failureBehavior: "Existing webhook receipt and cancellation behavior are unchanged; the scheduled claim sweep remains the fallback.",
  enabled: true,
};