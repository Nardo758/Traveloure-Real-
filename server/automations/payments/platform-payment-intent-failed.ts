import type { AutomationDefinition, AutomationContext } from "../contract";

export const platformPaymentIntentFailedAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-payment-intent-failed",
  name: "Platform PaymentIntent failed",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["payment_intent.payment_failed"] },
  condition: {
    description: "A signature-verified platform PaymentIntent failure event is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The shared canonical checkout failure writer conditionally flips only eligible rows; the existing legacy booking updates are retained.",
  action: {
    kind: "mutate_record",
    detail: "stripePaymentService.handleWebhook marks cart checkout failure, sends only existing guarded notices, and updates the legacy rail",
  },
  retryPolicy: "Thrown handler errors remain HTTP 500 for Stripe retry; existing handled error semantics are unchanged.",
  failureBehavior: "Existing handler behavior is preserved; a failed booking remains final for later paid promotion.",
  enabled: true,
};