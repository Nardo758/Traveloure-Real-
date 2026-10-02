import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingEarnerNoResponseNoticeAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.earner-no-response-notice",
  name: "Notify travelers about unanswered booking requests",
  domain: "bookings",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "as a separate notice-only arm of the existing four-hour booking-expiry pass",
    scheduleId: "booking-expiry",
    source: "BookingExpirySchedulerService.runCancellation",
  },
  condition: {
    description: "Run only from the existing booking-expiry pass.",
    evaluate: (context) => context.triggeredBy === "booking-expiry",
  },
  idempotencyKey: "booking:<bookingId>:earner_no_response or advisor:<advisorId>:earner_no_response",
  delay: null,
  cancels: [],
  actionGuard: "Candidate response/quote/chat gates and storage.createNotificationOnce's unique dedupe key remain authoritative; this action never cancels, reassigns, or moves money.",
  action: { kind: "send_message", detail: "Persist the existing in-app notice and, only for the inserting pass and enabled preference, enqueue the existing traveler email" },
  retryPolicy: "The later four-hour scan retries unmarked candidates; the existing outbox owns retries after enqueue. A persisted dedupe notice is not resent.",
  failureBehavior: "Candidate failures are collected while the rest of the pass proceeds; no new cancellation or notice retry policy is introduced.",
  enabled: true,
};