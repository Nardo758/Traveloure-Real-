import type { AutomationContext, AutomationDefinition } from "../contract";

export const pushNotificationDispatchAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.push-notification-dispatch",
  name: "Attempt immediate phone push for a notification",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["notification.push_requested"] },
  condition: {
    description: "Run only for the existing immediate push-dispatch entrypoint.",
    evaluate: (context) => context.event === "notification.push_requested",
  },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The push action retains its configured-key check, recent-notification/device filters, atomic push_claimed_at update, preference-key mapping, and per-user preference gate. It claims before external delivery; registry dispatch is not a delivery guarantee.",
  action: { kind: "call_external_api", detail: "Claim and attempt the existing Web Push delivery for one notification" },
  retryPolicy: "No registry retry. Existing push claims are at-most-once and failed claims are not reopened by this node; the normal recent-notification sweep covers only unclaimed notices.",
  failureBehavior: "The existing immediate push action is non-fatal and returns no delivery receipt. Provider-reported invalid subscriptions (404/410) are removed; other failures are logged and counted by the push service.",
  enabled: true,
};