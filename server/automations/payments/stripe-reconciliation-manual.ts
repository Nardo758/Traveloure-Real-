import type { AutomationDefinition, AutomationContext } from "../contract";

export const stripeReconciliationManualAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.stripe-reconciliation-manual",
  name: "Admin-requested Stripe reconciliation",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["admin.stripe-reconciliation.run_now"] },
  condition: {
    description: "Only the existing authenticated admin run-now route may invoke the detector.",
    evaluate: (context) => {
      if (!context.payload || typeof context.payload !== "object") return false;
      return (context.payload as { adminAuthorized?: unknown }).adminAuthorized === true;
    },
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "runStripeReconciliation records each manual invocation and retains the existing narrow detector handoffs; this is not a scheduled run.",
  action: {
    kind: "call_external_api",
    detail: "The authenticated admin route directly invokes the existing Stripe drift detector with triggeredBy=manual.",
  },
  retryPolicy: "Existing route returns its current HTTP 500 shape on thrown failures; no automated retry is added.",
  failureBehavior: "Manual run-now remains user-triggered and does not create/enable a cron or warm timer.",
  enabled: true,
};