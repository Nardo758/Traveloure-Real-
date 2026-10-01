import type { AutomationContext, AutomationDefinition } from "../contract";

export const bookingProviderAcceptanceFollowOnAutomation: AutomationDefinition<AutomationContext> = {
  id: "bookings.provider-acceptance-follow-on",
  name: "Provider acceptance status and traveler notice",
  domain: "bookings",
  type: "operational",
  trigger: { kind: "event", events: ["service_booking.provider_accepted"] },
  condition: {
    description: "Run only when the existing status writer is supplied its provider-acceptance notification.",
    evaluate: (context) => context.status === "confirmed" && context.notificationType === "booking_confirmed",
  },
  idempotencyKey: "booking:<bookingId>:accepted",
  delay: null,
  cancels: [],
  actionGuard: "The existing shared status writer's expected-from-state UPDATE and same-transaction deduped traveler notice remain authoritative; no additional acceptance transition is created.",
  action: { kind: "mutate_record", detail: "Invoke the existing status writer for a provider acceptance and its supplied in-app notice" },
  retryPolicy: "Existing request retry behavior and notification dedupe remain unchanged.",
  failureBehavior: "The shared writer result or thrown transaction failure passes through unchanged.",
  enabled: true,
};