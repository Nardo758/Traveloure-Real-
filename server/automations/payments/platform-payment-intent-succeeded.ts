import type { AutomationDefinition, AutomationContext } from "../contract";

export const platformPaymentIntentSucceededAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-payment-intent-succeeded",
  name: "Platform PaymentIntent succeeded",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["payment_intent.succeeded"] },
  condition: {
    description: "A signature-verified platform PaymentIntent success event is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Cart/balance/ready-made paid actions and late-success refund keep their existing atomic, receipt, and Stripe idempotency guards; legacy booking status/email behavior is retained and no payout is initiated.",
  action: {
    kind: "mutate_record",
    detail: "stripePaymentService.handleWebhook preserves the existing branch behavior and delegates cart, balance, ready-made, legacy, and late-refund actions through their distinct registry nodes",
  },
  retryPolicy: "Thrown handler errors remain HTTP 500 for Stripe retry; existing nonfatal recovery catches stay nonfatal.",
  failureBehavior: "Existing webhook receipt and route semantics are unchanged; this node does not create a second webhook path.",
  enabled: true,
};