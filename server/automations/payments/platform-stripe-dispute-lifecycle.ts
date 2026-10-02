import type { AutomationDefinition, AutomationContext } from "../contract";

export const platformStripeDisputeLifecycleAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-stripe-dispute-lifecycle",
  name: "Platform Stripe dispute lifecycle",
  domain: "payments",
  type: "financial",
  trigger: {
    kind: "event",
    events: [
      "charge.dispute.created",
      "charge.dispute.updated",
      "charge.dispute.closed",
      "charge.dispute.funds_withdrawn",
      "charge.dispute.funds_reinstated",
    ],
  },
  condition: {
    description: "A signature-verified platform Stripe dispute event with a payload is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: "(platform_webhook_consumers.stripe_event_id, consumer='platform-disputes')",
  delay: null,
  cancels: [],
  actionGuard: "The existing processor holds an advisory transaction lock, uses the platform consumer claim and dispute lifecycle ledger, and does not automatically reverse already-paid transfers.",
  action: {
    kind: "mutate_record",
    detail: "processPlatformWebhookEvent handles only its current dispute event family",
  },
  retryPolicy: "Stripe retries failed delivery; existing transactional claim/error behavior remains authoritative.",
  failureBehavior: "Transaction rollback and durable consumer error remain visible; unmatched or paid-out disputes retain human-review boundaries.",
  enabled: true,
};