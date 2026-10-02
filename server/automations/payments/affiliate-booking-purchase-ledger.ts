import type { AutomationDefinition, AutomationContext } from "../contract";

export const affiliateBookingPurchaseLedgerAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.affiliate-booking-purchase-ledger",
  name: "Affiliate agent-booking purchase ledger entry",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["affiliate.booking_request.purchase_recorded"] },
  condition: {
    description: "The human purchase transition must have won its existing atomic claim.",
    evaluate: (context) => {
      if (!context.purchaseClaimed || !context.payload || typeof context.payload !== "object") return false;
      return !!(context.payload as { requestId?: unknown }).requestId;
    },
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The preceding recordAffiliateBookingPurchase status transition gates the side effect once; createAffiliateEarning itself has no independent dedupe and remains best-effort.",
  action: {
    kind: "mutate_record",
    detail: "The existing expert/admin purchase route records honest zero commission/share values and the configured split snapshot; it does not invent partner commission.",
  },
  retryPolicy: "The route catches/logs ledger-write errors; no automatic retry or repair queue is invented.",
  failureBehavior: "A ledger-write failure remains nonfatal after the purchase; later report matching may lack that earning row.",
  enabled: true,
};