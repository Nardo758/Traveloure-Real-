import type { AutomationContext, AutomationDefinition } from "../contract";

export const authWelcomeEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.auth-welcome-email",
  name: "Send account welcome email",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["auth.welcome_email"] },
  condition: { description: "Persist one welcome row for an existing signup account.", evaluate: () => true },
  idempotencyKey: "signup-welcome:{accountId}",
  delay: null,
  cancels: [],
  actionGuard: "Existing outbox checks account, unchanged email, recorded consent and prior delivery under row locks.",
  action: { kind: "send_message", detail: "Queue the welcome in the existing email_outbox; only its dispatcher sends." },
  retryPolicy: "Existing outbox lease, backoff and terminal-attempt policy; stable provider retry key.",
  failureBehavior: "No send without an outbox row; provider acceptance does not establish inbox delivery.",
  enabled: true,
};