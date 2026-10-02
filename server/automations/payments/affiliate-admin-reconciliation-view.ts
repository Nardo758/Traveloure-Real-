import type { AutomationDefinition, AutomationContext } from "../contract";

export const affiliateAdminReconciliationViewAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.affiliate-admin-reconciliation-view",
  name: "Admin affiliate reconciliation view and matching",
  domain: "payments",
  type: "financial",
  trigger: { kind: "event", events: ["admin.affiliate.reconciliation_view.requested"] },
  condition: {
    description: "The existing admin route must authorize an administrator before matching begins.",
    evaluate: (context) => {
      if (!context.payload || typeof context.payload !== "object") return false;
      return (context.payload as { adminAuthorized?: unknown }).adminAuthorized === true;
    },
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "getReconciliationView invokes the existing matchRecords pipeline; exact report-token adoption is conditionally guarded, while fuzzy matching retains its per-pass consumed-set behavior.",
  action: {
    kind: "call_external_api",
    detail: "The authenticated admin GET triggers partner report reads and matching before rendering the reconciliation view.",
  },
  retryPolicy: "Existing route catches errors and returns HTTP 500; partner fetchers that return empty arrays remain indistinguishable from no report rows.",
  failureBehavior: "This remains request-triggered and admin-authorized; the registry does not schedule or otherwise activate matching.",
  enabled: true,
};