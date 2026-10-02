import type { AutomationDefinition, AutomationContext } from "../contract";

export const platformPaymentIntentRequiresActionAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-payment-intent-requires-action",
  name: "Platform PaymentIntent requires customer action",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["payment_intent.requires_action"] },
  condition: {
    description: "A signature-verified platform requires-action event is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing PaymentIntent ledger update is the sole action; no booking is promoted or canceled.",
  action: {
    kind: "mutate_record",
    detail: "stripePaymentService.handleWebhook records the existing 3DS/bank challenge state",
  },
  retryPolicy: "Thrown handler errors remain HTTP 500 for Stripe retry.",
  failureBehavior: "Existing logged/ledger behavior remains; registry adds no new payment transition.",
  enabled: true,
};