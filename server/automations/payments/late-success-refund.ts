import type { AutomationContext, AutomationDefinition } from "../contract";

function hasRefundRequest(context: AutomationContext): boolean {
  if (!context.payload || typeof context.payload !== "object") return false;
  const payload = context.payload as { paymentIntentId?: unknown; actor?: unknown };
  return typeof payload.actor === "string";
}

export const lateSuccessRefundAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-late-success-refund",
  name: "Late success refund for failed booking",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["payment_intent.succeeded.late-failed"] },
  condition: {
    description: "The existing late-success action receives its actor and preserves the shared refund implementation's current no-op and webhook-owned behavior.",
    evaluate: hasRefundRequest,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing refund implementation owns its atomic claim, PI-derived Stripe idempotency key, and aftermath transaction.",
  action: {
    kind: "call_external_api",
    detail: "checkout-claim.service.refundLateSuccessOnFailedIntent remains the one late-success refund implementation",
  },
  retryPolicy: "Preserve the existing refund claim and Stripe retry behavior.",
  failureBehavior: "No refund is initiated by the registry; production refund reachability remains owned by the existing platform webhook branch.",
  enabled: true,
};