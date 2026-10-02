import type { AutomationDefinition, AutomationContext } from "../contract";

export const checkoutClaimSweepAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.checkout-claim-sweep",
  name: "Checkout claim expiry and stale authorization sweep",
  domain: "payments",
  type: "financial",
  trigger: {
    kind: "cron",
    schedule: "every 5 minutes in-process; */15 * * * * cold-instance backstop",
    scheduleId: "checkout-sweep",
    source: "checkoutClaimSweepScheduler and POST /internal/jobs/checkout-sweep",
  },
  condition: {
    description: "The checkout sweep trigger must not be overridden by caller data.",
    evaluate: (context) => context.triggeredBy === "checkout-sweep",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing atomic checkout-claim state predicates, Stripe status checks, and claim/release records are authoritative.",
  action: {
    kind: "mutate_record",
    detail: "sweepExpiredCheckoutClaims followed by sweepStaleAuthorizedClaims; PaymentIntent-aware claim guards remain authoritative",
  },
  retryPolicy: "Existing runBackgroundJob transient-database retries and checkout service behavior.",
  failureBehavior: "Thrown pass failures surface to the existing timer logger or internal-job HTTP failure path; no new claim state is written.",
  enabled: true,
};