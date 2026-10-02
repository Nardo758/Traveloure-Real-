import type { AutomationDefinition, AutomationContext } from "../contract";

export const connectDisputeLifecycleAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.connect-dispute-lifecycle",
  name: "Connected-account Stripe dispute lifecycle",
  domain: "payments",
  type: "financial",
  trigger: {
    kind: "event",
    events: [
      "charge.dispute.created",
      "charge.dispute.closed",
      "charge.dispute.updated",
      "charge.dispute.funds_withdrawn",
      "charge.dispute.funds_reinstated",
    ],
  },
  condition: {
    description: "A signature-verified connected-account dispute event is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: "stripe_dispute_lifecycle.dispute_id = Stripe Dispute.id",
  delay: null,
  cancels: [],
  actionGuard: "Existing webhook receipt and handleStripeDispute transaction/lifecycle row retain terminal and earning-hold authority.",
  action: {
    kind: "mutate_record",
    detail: "Connect webhook processes its existing dispute variants in a database transaction",
  },
  retryPolicy: "Existing receipt error is persisted and uncaught failures return HTTP 500 for Stripe retry.",
  failureBehavior: "Dispute manual-review boundaries and existing receipt rollback are preserved.",
  enabled: true,
};