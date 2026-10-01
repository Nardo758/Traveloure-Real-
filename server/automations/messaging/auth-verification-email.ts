import type { AutomationContext, AutomationDefinition } from "../contract";

export const authVerificationEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.auth-verification-email",
  name: "Send email-verification email",
  domain: "messaging",
  type: "security",
  trigger: { kind: "event", events: ["auth.verification_email"] },
  condition: { description: "Run for the existing email-verification call.", evaluate: () => true },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "The auth caller's verification-token creation and verification checks remain authoritative.",
  action: { kind: "send_message", detail: "Invoke the existing email-verification sender." },
  retryPolicy: "No automation retry; existing sender behavior and provider response semantics are retained.",
  failureBehavior: "Existing sender errors propagate to the auth caller; a missing provider key may return without sending.",
  enabled: true,
};