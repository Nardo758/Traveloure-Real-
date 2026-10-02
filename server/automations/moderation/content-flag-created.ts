import type { AutomationContext, AutomationDefinition } from "../contract";

export const contentFlagCreatedAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.content-flag-created",
  name: "Persist a generic content flag and mark its content registry row flagged",
  domain: "moderation",
  type: "must_have",
  trigger: { kind: "event", events: ["content_flag.created"] },
  condition: {
    description: "Only a caller-supplied flag with a tracking number and flag type is eligible.",
    evaluate: (context) => context.flagInput !== null && typeof context.flagInput === "object" &&
      typeof (context.flagInput as Record<string, unknown>).trackingNumber === "string" &&
      typeof (context.flagInput as Record<string, unknown>).flagType === "string",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing createContentFlag implementation persists the flag then updates the content registry; admin resolution and status decisions remain manual.",
  action: { kind: "mutate_record", detail: "Run the existing storage createContentFlag action, including its flagged-status follow-on" },
  retryPolicy: "Caller-owned; no automatic retry is added around the existing storage operation.",
  failureBehavior: "Existing storage errors propagate to the route; no moderation decision or enforcement is inferred.",
  enabled: true,
};