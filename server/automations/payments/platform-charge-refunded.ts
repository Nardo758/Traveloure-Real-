import type { AutomationDefinition, AutomationContext } from "../contract";

export const platformChargeRefundedAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-charge-refunded",
  name: "Platform charge refund receipt and protection",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["charge.refunded"] },
  condition: {
    description: "A signature-verified platform charge-refunded event is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing per-refund audit, foreign-refund stamp/hold, and bundle settlement claim guards remain inside their owning service transactions.",
  action: {
    kind: "mutate_record",
    detail: "stripePaymentService.handleWebhook validates refund snapshots, records audits and out-of-band safety effects, and promotes existing partial settlement when its metadata matches",
  },
  retryPolicy: "Invalid charge/refund snapshot throws for Stripe retry; existing bundle settlement promotion remains best-effort.",
  failureBehavior: "Existing webhook error response and nonfatal bundle settlement behavior are preserved; paid-out earnings are not clawed back.",
  enabled: true,
};