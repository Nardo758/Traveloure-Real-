import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingDeclaredWindowCloseAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.declared-window-close",
  name: "Close elapsed declared booking completion windows",
  domain: "bookings",
  type: "must_have",
  trigger: {
    kind: "cron",
    schedule: "as a distinct pass of the existing hourly completion job",
    scheduleId: "booking-auto-completion",
    source: "runBookingAutoCompletion pass 1b",
  },
  condition: {
    description: "Run only from the existing hourly completion job.",
    evaluate: (context) => context.triggeredBy === "booking-auto-completion",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The derived declared-window deadline, payment gate, and completeBooking's completion_declared from-state conditional remain authoritative; earning mint is guarded in the existing transaction.",
  action: { kind: "mutate_record", detail: "Close eligible completion_declared service bookings through completeBooking" },
  retryPolicy: "Failed rows remain eligible for the existing next hourly pass; no new retry policy is introduced.",
  failureBehavior: "The pass keeps its current isolated error handling and skip accounting.",
  enabled: true,
};