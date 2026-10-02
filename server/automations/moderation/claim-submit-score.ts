import type { AutomationContext, AutomationDefinition } from "../contract";

export const claimSubmitScoreAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.claim-submit-score",
  name: "Score submitted neighborhood claim",
  domain: "moderation",
  type: "operational",
  trigger: { kind: "event", events: ["neighborhood_claim.submitted", "neighborhood_claim.rescore_requested"] },
  condition: {
    description: "Only an existing submitted claim/version pair may be handed to the scorer.",
    evaluate: (context) => typeof context.claimId === "string" && Number.isInteger(context.version),
  },
  idempotencyKey: "claim_id + version",
  delay: null,
  cancels: [],
  actionGuard: "scoreClaim retains its submitted-status/version conditional writes and scorer-failed exclusion; the dynamic import remains after the claim transaction commit.",
  action: { kind: "enqueue_job", detail: "Best-effort dynamic import of evidence-scorer.service.scoreClaim for the submitted claim/version" },
  retryPolicy: "No automatic retry; the existing fire-and-forget enqueue logs import/action failure, while explicit admin rescore is required for scorer-failed claims.",
  failureBehavior: "Submission remains committed; enqueue failure is logged and does not fail the submit or create enforcement.",
  enabled: true,
};