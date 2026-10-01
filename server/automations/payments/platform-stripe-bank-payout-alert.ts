import type { AutomationDefinition, AutomationContext } from "../contract";

export const platformStripeBankPayoutAlertAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-stripe-bank-payout-alert",
  name: "Platform Stripe bank-payout alert",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["payout.paid", "payout.failed"] },
  condition: {
    description: "A signature-verified platform Stripe payout event with a payload is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: "(platform_webhook_consumers.stripe_event_id, consumer='platform-disputes')",
  delay: null,
  cancels: [],
  actionGuard: "The platform consumer event claim is transaction-scoped; this action only writes an admin notice and never initiates seller transfers.",
  action: {
    kind: "mutate_record",
    detail: "processPlatformWebhookEvent records its existing platform bank-payout admin notification",
  },
  retryPolicy: "Stripe retries failed delivery; existing transactional claim/error behavior remains authoritative.",
  failureBehavior: "Existing claim transaction rolls back and persists error; no payout is started or repeated by registry policy.",
  enabled: true,
};