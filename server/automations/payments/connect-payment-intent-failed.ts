import type { AutomationDefinition, AutomationContext } from "../contract";

export const connectPaymentIntentFailedAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.connect-payment-intent-failed",
  name: "Connected-account PaymentIntent failed",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["payment_intent.payment_failed"] },
  condition: {
    description: "A signature-verified connected-account PaymentIntent failure event is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "markCheckoutPaymentFailed remains the sole guarded canonical status/notice writer.",
  action: {
    kind: "mutate_record",
    detail: "Connect webhook marks canonical checkout failure through the shared writer",
  },
  retryPolicy: "Existing handler catches and records errors as before; uncaught failures remain retryable by Stripe.",
  failureBehavior: "Existing catch-and-log behavior is preserved; no additional terminal or refund policy is introduced.",
  enabled: true,
};