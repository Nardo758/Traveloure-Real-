import type { AutomationDefinition, AutomationContext } from "../contract";

export const affiliateExactReportAdoptionAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.affiliate-exact-report-adoption",
  name: "Affiliate exact attribution-token report adoption",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["affiliate.report.exact_token_adoption.check"] },
  condition: {
    description: "An existing affiliate reconciliation pass must contain both internal and external report rows.",
    evaluate: (context) => {
      if (!context.payload || typeof context.payload !== "object") return false;
      return (context.payload as { matchingRequested?: unknown }).matchingRequested === true;
    },
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "For each exact token, the existing affiliate_earnings UPDATE is conditional on reconciliation_status <> matched; linked expert earnings are adopted afterward, and the shared booking-confirmation writer remains conditional.",
  action: {
    kind: "mutate_record",
    detail: "The report-matching pass adopts the partner-reported amount verbatim and links the exact-token affiliate booking request/trip; it does not estimate commission.",
  },
  retryPolicy: "Existing matchRecords callers retain their own catch/HTTP response behavior; ancillary confirmation failures remain caught for a later pass.",
  failureBehavior: "Fuzzy-match behavior remains separate, and no new report fetch, payout, or booking confirmation policy is added.",
  enabled: true,
};