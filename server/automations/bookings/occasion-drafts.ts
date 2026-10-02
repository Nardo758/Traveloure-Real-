import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingOccasionDraftsAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.occasion-drafts",
  name: "Generate eligible Plus occasion trip drafts",
  domain: "bookings",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "daily external internal-job trigger; warm-instance timer remains defense-in-depth",
    scheduleId: "run-occasion-drafts",
    source: "POST /internal/run-occasion-drafts and occasionDraftsScheduler",
  },
  condition: {
    description: "Run only through the existing occasion-drafts daily pass.",
    evaluate: (context) => context.triggeredBy === "run-occasion-drafts",
  },
  idempotencyKey: "occasion_id + recurrence cycle/date in occasion_drafts",
  delay: null,
  cancels: [],
  actionGuard: "Existing active-occasion, recurrence, Plus, lead-window and generation-lease gates remain in runOccasionDrafts; the ledger arbitrates endpoint/timer overlap.",
  action: { kind: "enqueue_job", detail: "Generate the existing occasion trip draft and run its existing one-attempt email enqueue" },
  retryPolicy: "Generation leases permit existing reclamation; notified_at is stamped before enqueue and is not cleared to retry a changed-policy or failed enqueue.",
  failureBehavior: "Per-occasion errors and existing endpoint/timer result behavior remain unchanged; no campaign or channel is added.",
  enabled: true,
};