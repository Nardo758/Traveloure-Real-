import type { AutomationContext, AutomationDefinition } from "../contract";

function hasPromotionIdentity(context: AutomationContext): boolean {
  if (!context.payload || typeof context.payload !== "object") return false;
  const payload = context.payload as { actor?: unknown };
  return typeof payload.actor === "string";
}

export const checkoutPaidPromotionAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.checkout-paid-promotion",
  name: "Shared cart paid-checkout promotion",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["checkout.paid-promotion.requested"] },
  condition: {
    description: "The shared action owns actor authorization, input validation, and its current no-op behavior.",
    evaluate: hasPromotionIdentity,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing shared promotion owns its atomic booking transitions, receipt transaction, and action-level idempotency.",
  action: {
    kind: "mutate_record",
    detail: "checkout-claim.service.promotePaidCheckout preserves the cart paid-promotion implementation for client, webhook, sweep, and reconciliation callers",
  },
  retryPolicy: "Preserve the shared promotion's existing error and retry behavior.",
  failureBehavior: "The registry does not claim a key or move any booking state outside the existing promotion.",
  enabled: true,
};