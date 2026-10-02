import type { AutomationContext, AutomationDefinition } from "../contract";

function hasBalancePromotionIdentity(context: AutomationContext): boolean {
  if (!context.payload || typeof context.payload !== "object") return false;
  const payload = context.payload as { actor?: unknown };
  return typeof payload.actor === "string";
}

export const balancePaidPromotionAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.balance-paid-promotion",
  name: "Balance-payment paid promotion",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["checkout.balance-promotion.requested"] },
  condition: {
    description: "The shared action owns actor authorization, identity checks, and its current no-op behavior.",
    evaluate: hasBalancePromotionIdentity,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing balance promotion owns its atomic conditional, transaction, paid-charge stamp, and canonical receipt write.",
  action: {
    kind: "mutate_record",
    detail: "checkout-claim.service.promoteBalancePayment preserves the shared balance-promotion implementation for inline checkout and webhook callers",
  },
  retryPolicy: "Preserve the shared balance promotion's existing error and retry behavior.",
  failureBehavior: "The registry does not claim a key or alter the balance-payment transaction.",
  enabled: true,
};