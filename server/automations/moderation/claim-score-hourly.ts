import type { AutomationContext, AutomationDefinition } from "../contract";

export const claimScoreHourlyAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.claim-score-hourly",
  name: "Neighborhood claim scorer authoritative hourly pass",
  domain: "moderation",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "hourly external jobs-cron due bucket",
    scheduleId: "score-neighborhood-claims",
    source: "POST /internal/jobs/score-neighborhood-claims",
  },
  condition: {
    description: "Only the authenticated existing internal job schedule is eligible.",
    evaluate: (context) => context.triggeredBy === "score-neighborhood-claims",
  },
  idempotencyKey: "claim_id + version",
  delay: null,
  cancels: [],
  actionGuard: "scorePendingClaims selects submitted, unfailed, unscored rows; scoreClaim owns the atomic claim/version guard and never writes neighborhood evidence.",
  action: { kind: "enqueue_job", detail: "Run the existing scorePendingClaims batch with the caller's optional limit" },
  retryPolicy: "Existing internal runJob/background-job-runner behavior; scorer-failed claims are excluded from automatic retries and require explicit rescore.",
  failureBehavior: "Internal job preserves existing HTTP failure/heartbeat semantics; per-claim failures remain recorded as scorer-failed or skipped.",
  enabled: true,
};