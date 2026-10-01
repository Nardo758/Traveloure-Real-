import type { AutomationContext, AutomationDefinition } from "../contract";

function supportedReadyMadeFulfilment(context: AutomationContext): boolean {
  if (!context.payload || typeof context.payload !== "object") return false;
  const request = context.payload as { actor?: unknown };
  return typeof request.actor === "string";
}

export const readyMadePurchaseFulfilmentAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.ready-made-purchase-fulfilment",
  name: "Shared ready-made purchase fulfilment",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["ready_made.purchase-fulfilment.requested"] },
  condition: {
    description: "The existing webhook or buyer-confirm actor enters through the shared action, which retains metadata, payment, and route-expectation validation.",
    evaluate: supportedReadyMadeFulfilment,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "recordAndFulfilReadyMadePurchase owns its existing unique-PI and atomic fulfilment guards; buyer-confirm expectation checks remain in that implementation.",
  action: {
    kind: "mutate_record",
    detail: "The webhook and buyer-confirm routes both continue through the same recordAndFulfilReadyMadePurchase implementation",
  },
  retryPolicy: "Preserve the shared ready-made action's existing webhook recovery and buyer-confirm response behavior.",
  failureBehavior: "The wrapper does not move the existing unique-PI guard or buyer-confirm authorization checks.",
  enabled: true,
};