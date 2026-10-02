import type { AutomationContext, AutomationDefinition } from "../contract";

export const providerListingReviewDecisionNotificationAutomation: AutomationDefinition<AutomationContext> = {
  id: "provider.listing-review-decision-notification",
  name: "Insert existing provider listing review decision notification",
  domain: "provider",
  type: "operational",
  trigger: { kind: "event", events: ["provider.listing-review.decision-notification"] },
  condition: {
    description: "Only a requested existing listing decision notification with its recipient, service, and dedupe key is eligible.",
    evaluate: (context) => typeof context.userId === "string" &&
      typeof context.serviceId === "string" && typeof context.dedupeKey === "string" &&
      context.requestedContext === "listing-review-decision-notification",
  },
  idempotencyKey: "Existing SQL unique dedupe_key on the notification insert; dispatcher does not pre-check or claim it.",
  delay: null,
  cancels: [],
  actionGuard: "The existing storage insert owns the durable dedupe key and unique-violation interpretation; every other failure remains non-fatal in the helper's encompassing try/catch. This node adds no manual approval/rejection, audit, retry, or enforcement behavior.",
  action: { kind: "mutate_record", detail: "Attempt the existing deduplicated provider listing review notification insert" },
  retryPolicy: "Caller-owned; no retry or durable outbox is added.",
  failureBehavior: "The helper continues to suppress duplicate-key outcomes and log other insert/dispatch failures non-fatally.",
  enabled: true,
};