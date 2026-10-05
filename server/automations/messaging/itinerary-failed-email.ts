import type { AutomationContext, AutomationDefinition } from "../contract";

export const itineraryFailedEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.itinerary-failed-email",
  name: "Notify traveler that itinerary generation failed",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["itinerary.failed"] },
  condition: { description: "A generation error or attempt exceeding five minutes.", evaluate: () => true },
  idempotencyKey: "itinerary-failed:{comparisonId}:{attemptStartedAt}",
  delay: null,
  cancels: [],
  actionGuard: "Attempt-scoped conditional terminal update and transactional outbox; late workers cannot overwrite timeout.",
  action: { kind: "send_message", detail: "Persist failure notice in the existing email outbox." },
  retryPolicy: "Existing outbox retries and leases.",
  failureBehavior: "No billing changes or invented refund/credit claims; provider acceptance is not receipt.",
  enabled: true,
};