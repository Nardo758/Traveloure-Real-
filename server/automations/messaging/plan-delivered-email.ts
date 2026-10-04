import type { AutomationContext, AutomationDefinition } from "../contract";

export const planDeliveredEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.plan-delivered-email",
  name: "Notify traveler that a plan was delivered",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["plan.delivered_email", "itinerary.ready"] },
  condition: { description: "Expert delivery or a persisted AI-generation outcome.", evaluate: () => true },
  idempotencyKey: "AI only: itinerary-ready:{comparisonId}; legacy expert delivery retains its transition gate",
  delay: null,
  cancels: [],
  actionGuard: "Expert transition gate unchanged; AI completion uses an attempt-scoped conditional update and transactional outbox.",
  action: { kind: "send_message", detail: "Expert-delivered sender unchanged; AI-ready email uses the existing outbox." },
  retryPolicy: "AI notices use existing outbox retries; expert sender behavior unchanged.",
  failureBehavior: "Outbox acceptance is not inbox receipt; AI outcome and notice persist atomically.",
  enabled: true,
};