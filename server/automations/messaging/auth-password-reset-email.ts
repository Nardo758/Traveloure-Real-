import type { AutomationContext, AutomationDefinition } from "../contract";

export const authPasswordResetEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.auth-password-reset-email",
  name: "Send password-reset email",
  domain: "messaging",
  type: "security",
  trigger: { kind: "event", events: ["auth.password_reset_email"] },
  condition: { description: "Run for the existing password-reset email call.", evaluate: () => true },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The auth caller's reset-token creation, expiry and single-use checks remain authoritative.",
  action: { kind: "send_message", detail: "Invoke the existing password-reset email sender." },
  retryPolicy: "No automation retry; existing sender behavior and provider response semantics are retained.",
  failureBehavior: "Existing sender errors propagate to the auth caller; a missing provider key may return without sending.",
  enabled: true,
};