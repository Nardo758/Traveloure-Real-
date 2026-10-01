import type { AutomationContext, AutomationDefinition } from "../contract";

export const claimScoreWarmAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.claim-score-warm",
  name: "Neighborhood claim scorer warm-instance defense pass",
  domain: "moderation",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "every 15 minutes after the existing 7-minute jittered first pass",
    scheduleId: "evidence-scorer-warm",
    source: "evidenceScorerScheduler warm-process timer",
  },
  condition: {
    description: "Only the existing warm-instance evidence scorer timer is eligible.",
    evaluate: (context) => context.triggeredBy === "evidence-scorer-warm",
  },
  idempotencyKey: "claim_id + version",
  delay: null,
  cancels: [],
  actionGuard: "Uses the same scorePendingClaims selectors and atomic claim/version guard as the authoritative pass; this timer is best-effort defense-in-depth only.",
  action: { kind: "enqueue_job", detail: "Run the existing scorePendingClaims batch without an additional background-runner wrapper" },
  retryPolicy: "No same-pass automatic retry after scorer failure; next timer may pick eligible unfailed rows, while scorer-failed claims require explicit admin rescore.",
  failureBehavior: "Existing runOnce catches and records/logs pass failure; timer startup, cadence, overlap runner, and unref behavior remain owned by the scheduler.",
  enabled: true,
};