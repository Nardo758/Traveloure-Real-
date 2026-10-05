import type { AutomationContext, AutomationDefinition } from "../contract";
import type { ItineraryFollowupKind } from "../../services/itinerary-followup-email";

export function itineraryFollowupDefinition(id: string, kind: ItineraryFollowupKind, hours: number): AutomationDefinition<AutomationContext> {
  return {
    id, name: `Send ${kind}`, domain: "messaging", type: "marketing",
    trigger: { kind: "event", events: ["itinerary.followup_due"] },
    condition: { description: "Consent, current sequence, no booking; five-day notice additionally requires live bookable items.", evaluate: (context) => context.eligible === true },
    idempotencyKey: `${kind}:{comparisonId}`, delay: null,
    cancels: [],
    actionGuard: `Durable outbox due time is ready + ${hours} hours. Traveler-row lock spans eligibility and provider acceptance; booking triggers share this lock and cancel unsent rows.`,
    action: { kind: "send_message", detail: "Existing email outbox transport, retry identity, marketing consent, local calendar-day cap, and explicit quiet hours." },
    retryPolicy: "Existing outbox retry/backoff with a stable per-row provider key.",
    failureBehavior: "Fail closed on missing context/consent; no provider acceptance is reported as inbox receipt.",
    enabled: true,
  };
}