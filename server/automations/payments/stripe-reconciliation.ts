import type { AutomationDefinition, AutomationContext } from "../contract";

export const stripeReconciliationAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.stripe-reconciliation",
  name: "Stripe reconciliation",
  domain: "payments",
  type: "financial",
  trigger: {
    kind: "cron",
    schedule: "0 9 * * * (UTC; with in-process daily defense timer)",
    scheduleId: "stripe-reconciliation",
    source: "POST /internal/jobs/stripe-reconciliation and warm-instance timer",
  },
  condition: {
    description: "Only the scheduled reconciliation invocation is eligible.",
    evaluate: (context) => context.triggeredBy === "stripe-reconciliation",
  },
  idempotencyKey: "reconciliation_exceptions.dedupe_key = the existing detector exception fingerprint",
  delay: null,
  cancels: [],
  actionGuard: "Every pass is recorded by the job; exception dedupe and narrow recovery handoffs retain their existing DB guards. The registry does not pre-check this key.",
  action: {
    kind: "call_external_api",
    detail: "runStripeReconciliation; preserves reconciliation ledger, detect-only policy, and existing recovery handoffs",
  },
  retryPolicy: "Existing runBackgroundJob transient-database retries; Stripe API failures remain job-reported failures.",
  failureBehavior: "Missing Stripe key is an explicit skipped result; failed result remains an HTTP failure and is logged/persisted by the job.",
  enabled: true,
};