import type { AutomationDefinition, AutomationContext } from "../contract";

export const bundlePartialSettlementAutomation: AutomationDefinition<AutomationContext> = {
  id: "payments.bundle-partial-settlement",
  name: "Bundle partial-settlement recovery sweep",
  domain: "payments",
  type: "financial",
  trigger: {
    kind: "cron",
    schedule: "daily warm-instance timer after existing ~90m startup delay",
    scheduleId: "bundle-partial-settlement-sweep",
    source: "server/index.ts warm-instance timer only; no internal endpoint or cron route found",
  },
  condition: {
    description: "Run only from the existing bundle partial-settlement timer.",
    evaluate: (context) => context.triggeredBy === "bundle-partial-settlement-sweep",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "sweepUnsettledBundlePartials re-drives the existing settlement implementation and its durable claim/settled_at guards; it does not decide settlement.",
  action: {
    kind: "mutate_record",
    detail: "The existing bundle partial-settlement service is imported lazily and invoked by its sole daily timer.",
  },
  retryPolicy: "Existing runBackgroundJob transient-database retry; sweep reports per-outcome counts and retains its documented failure handling.",
  failureBehavior: "No new refund or settlement decision is introduced; charge.refunded remains the other existing promoter.",
  enabled: true,
};