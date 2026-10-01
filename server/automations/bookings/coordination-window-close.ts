import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingCoordinationWindowCloseAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.coordination-window-close",
  name: "Close elapsed coordination completion windows",
  domain: "bookings",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "as a distinct pass of the existing hourly completion job",
    scheduleId: "booking-auto-completion",
    source: "runBookingAutoCompletion pass 1c",
  },
  condition: {
    description: "Run only from the existing hourly completion job.",
    evaluate: (context) => context.triggeredBy === "booking-auto-completion",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The declared window derivation and storage.updateCoordinationStatus completion_declared guard remain authoritative. Coordination completion does not mint earnings or alter the fee.",
  action: { kind: "mutate_record", detail: "Run the existing coordination window close pass" },
  retryPolicy: "Existing pass-level and row-level failure behavior remains unchanged.",
  failureBehavior: "Missing declaration timestamps and open windows retain their explicit skip reasons.",
  enabled: true,
};