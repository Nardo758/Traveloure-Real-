import type { AutomationDefinition, AutomationContext } from "../contract";

export const platformSubscriptionMembershipAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-subscription-membership",
  name: "Platform Stripe subscription membership synchronization",
  domain: "payments",
  type: "financial",
  trigger: {
    kind: "event",
    events: [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ],
  },
  condition: {
    description: "A signature-verified Stripe subscription lifecycle event is required.",
    evaluate: (context) => context.signatureVerified === true && !!context.payload,
  },
  idempotencyKey: "plan_memberships.stripe_subscription_id = Stripe Subscription.id",
  delay: null,
  cancels: [],
  actionGuard: "The existing upsert writer maps Stripe status through its allowed entitlement transition; subscription deletion updates status rather than deleting history.",
  action: {
    kind: "mutate_record",
    detail: "stripePaymentService.handleWebhook delegates all subscription variants to the shared membership upsert",
  },
  retryPolicy: "Thrown handler errors remain HTTP 500 for Stripe retry; named unresolved-user/plan refusal behavior is unchanged.",
  failureBehavior: "Existing durable reconciliation can detect eligible missing memberships; registry introduces no alternate entitlement writer.",
  enabled: true,
};