import type { AutomationDefinition } from "../contract";

export const expertApplicationNeighborhoodStampAutomation: AutomationDefinition = {
  id: "provider.expert-application-neighborhood-stamp",
  name: "Stamp the existing new-expert no-neighborhoods state",
  domain: "provider",
  type: "operational",
  trigger: { kind: "event", events: ["expert_application.neighborhood_stamp"] },
  condition: {
    description: "Only an existing new-application hook supplies a persisted form and account ID.",
    evaluate: (context) => typeof context.formId === "string" && context.formId.length > 0 &&
      typeof context.userId === "string" && context.userId.length > 0,
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The unchanged stampNoNeighborhoodsAvailable action derives the city/claim/no-neighborhood predicate and retains its idempotent writes. Resubmissions have no stamp hook.",
  action: { kind: "mutate_record", detail: "Run the existing server-derived no-neighborhoods stamp after new expert application persistence, before the unchanged AI scoring call." },
  retryPolicy: "No registry retry or new backfill, claim, enforcement, or AI request.",
  failureBehavior: "Both original intake hooks catch/log errors and continue returning the persisted application.",
  enabled: true,
};