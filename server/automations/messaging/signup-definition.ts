import type { AutomationContext, AutomationDefinition } from "../contract";

export const reminderIds = [
  "messaging.verify-reminder-1h",
  "messaging.verify-reminder-1d",
  "messaging.verify-reminder-3d",
] as const;

export function signupDefinition(
  id: string,
  name: string,
  condition: (context: AutomationContext) => boolean,
  cancels: readonly string[] = [],
): AutomationDefinition {
  return {
    id, name, domain: "messaging", type: "security",
    trigger: { kind: "event", events: [`auth.${name}`] },
    condition: { description: "Transaction-locked account and token delivery guard passes", evaluate: condition },
    idempotencyKey: name === "welcome_email" ? "welcome:{user_id}"
      : name.startsWith("verify_reminder") ? `${id}:{user_id}`
      : name === "verify_email" ? "verify:{user_id}:{token_hash}" : "already:{user_id}:{request_id}",
    delay: null,
    cancels,
    actionGuard: "Durable email_outbox row; per-user advisory lock; reload account/token before delivery",
    action: { kind: "send_message", detail: "Deliver only through the existing email outbox and provider transport" },
    actionOutcome: (result) => (result as { ok?: boolean } | null)?.ok === true ? "success" : "failure",
    retryPolicy: "Existing outbox backoff and provider idempotency key",
    failureBehavior: "Persist failed/dead outbox state; never claim inbox receipt",
    enabled: true,
  };
}