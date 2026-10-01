import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingArtifactAcceptanceAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.artifact-acceptance",
  name: "Artifact acceptance prompt and escalation",
  domain: "bookings",
  type: "operational",
  trigger: {
    kind: "cron",
    schedule: "as a distinct pass of the existing hourly completion job",
    scheduleId: "booking-auto-completion",
    source: "runBookingAutoCompletion pass 3",
  },
  condition: {
    description: "Run only from the existing hourly completion job.",
    evaluate: (context) => context.triggeredBy === "booking-auto-completion",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Existing delivery-instant derivation, payment verification for prompts, unpaid stamp, and named from-state transitions remain in artifact-acceptance-timer.service. This pass prompts or escalates only; it does not complete or mint.",
  action: { kind: "mutate_record", detail: "Run the existing confirmed-to-awaiting_acceptance and elapsed-window-to-disputed arms" },
  retryPolicy: "Transition/Stripe failures defer to the existing next hourly pass; no separate communication retry is added.",
  failureBehavior: "Missing delivery timestamps and other refusals remain explicit skip reasons; no timestamp or email is invented.",
  enabled: true,
};