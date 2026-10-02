import type { AutomationDefinition, AutomationContext } from "../contract";

export const connectPaymentIntentSucceededAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.connect-payment-intent-succeeded",
  name: "Connected-account PaymentIntent succeeded and revenue record",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["payment_intent.succeeded"] },
  condition: {
    description: "A signature-verified connected-account PaymentIntent success event is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: "platform_revenue.metadata->>'paymentIntentId' (platform_revenue_payment_intent_uniq partial unique index)",
  delay: null,
  cancels: [],
  actionGuard: "Shared checkout promotion and revenue event insertion keep their existing transaction/unique-index guards; route pre-check remains advisory only.",
  action: {
    kind: "mutate_record",
    detail: "Connect webhook confirms through the shared payment handler and records source revenue",
  },
  retryPolicy: "Existing webhook catches remain nonfatal where present; uncaught errors stay in the durable receipt and return HTTP 500.",
  failureBehavior: "Existing promotion/revenue behavior is unchanged; platform-account PaymentIntents remain owned by the platform endpoint.",
  enabled: true,
};