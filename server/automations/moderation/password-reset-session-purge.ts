import type { AutomationContext, AutomationDefinition } from "../contract";

export const passwordResetSessionPurgeAutomation: AutomationDefinition<AutomationContext> = {
  id: "moderation.password-reset-session-purge",
  name: "Invalidate sessions atomically after password reset",
  domain: "moderation",
  type: "security",
  trigger: { kind: "event", events: ["password_reset.password_persisted"] },
  condition: {
    description: "Only a successfully claimed, unexpired, single-use reset token with a user ID may invalidate sessions.",
    evaluate: (context) => context.resetTokenClaimed === true && typeof context.userId === "string",
  },
  idempotencyKey: "password_reset_tokens.token_hash (single-use used_at claim)",
  delay: null,
  cancels: [],
  actionGuard: "The purge stays in the password-reset transaction with the password/token writes and removes both known Passport session shapes.",
  action: { kind: "mutate_record", detail: "Execute the existing transaction-scoped DELETE FROM sessions for the reset user" },
  retryPolicy: "Transaction/caller-owned; SQL failure rolls back password and token changes.",
  failureBehavior: "The existing password-reset transaction fails closed and does not report success if the purge fails.",
  enabled: true,
};