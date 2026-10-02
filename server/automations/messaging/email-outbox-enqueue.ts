import type { AutomationContext, AutomationDefinition } from "../contract";

export const emailOutboxEnqueueAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.email-outbox-enqueue",
  name: "Enqueue and immediately attempt transactional email delivery",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["email.enqueue"] },
  condition: {
    description: "Run only for the existing transactional-email enqueue entrypoint.",
    evaluate: (context) => context.event === "email.enqueue",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The existing outbox insert and conditional processing-state updates, 10-minute lease, and delivery implementation remain authoritative. An insert failure still causes one direct delivery attempt without a durable row.",
  action: { kind: "send_message", detail: "Insert the email outbox row and perform its existing immediate delivery attempt" },
  retryPolicy: "No registry retry. Existing outbox retry timing is 5, 15, 45, 120, and 360 minutes after failures; the sixth failed attempt becomes dead. A missing row after insert failure cannot be retried.",
  failureBehavior: "The existing enqueue result is the outbox row ID or null, not a delivery receipt; delivery errors are recorded by the outbox action and are not propagated to callers.",
  enabled: true,
};