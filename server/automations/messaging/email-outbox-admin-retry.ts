import type { AutomationContext, AutomationDefinition } from "../contract";

export const emailOutboxAdminRetryAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.email-outbox-admin-retry",
  name: "Drain email outbox after an administrator retry",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["email_outbox.admin_retry"] },
  condition: {
    description: "Run only after the existing authenticated admin retry route resets a failed or dead row.",
    evaluate: (context) => context.event === "email_outbox.admin_retry",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The route's existing status-qualified UPDATE remains authoritative: only failed/dead rows are reset to pending with attempt_count zero; the outbox's atomic claim remains responsible for delivery.",
  action: { kind: "send_message", detail: "Run the existing outbox drain asynchronously after the admin retry reset" },
  retryPolicy: "No registry retry or added delay. The outbox's existing per-row attempts and retry schedule remain in force after the administrator reset.",
  failureBehavior: "The route still acknowledges the successful reset without waiting for delivery; delivery failures remain recorded on the outbox row, while drain-level promise rejection is logged by the existing background callback.",
  enabled: true,
};