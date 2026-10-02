import type { AutomationDefinition, AutomationContext } from "../contract";

function supportedCheckoutType(context: AutomationContext): boolean {
  if (context.signatureVerified !== true || !context.payload || typeof context.payload !== "object") return false;
  const event = context.payload as { data?: { object?: { metadata?: { type?: unknown } } } };
  const metadataType = event.data?.object?.metadata?.type;
  return metadataType === "expert_service" || metadataType === "transport_booking";
}

export { supportedCheckoutType };

export const platformCheckoutSessionCompletedAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.platform-checkout-session-completed",
  name: "Platform checkout session completed",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["checkout.session.completed"] },
  condition: {
    description: "A signed checkout session must use an existing handled expert-service or transport-booking branch.",
    evaluate: supportedCheckoutType,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing service payment completion implementation owns its current payment record and confirmation guards.",
  action: {
    kind: "mutate_record",
    detail: "stripePaymentService.handleWebhook handles only expert_service and transport_booking checkout sessions",
  },
  retryPolicy: "Thrown handler errors remain HTTP 500 for Stripe retry.",
  failureBehavior: "Unsupported session types retain the existing acknowledged no-op behavior and are not routed through this node.",
  enabled: true,
};