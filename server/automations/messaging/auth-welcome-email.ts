import type { AutomationContext, AutomationDefinition } from "../contract";

export const authWelcomeEmailAutomation: AutomationDefinition<AutomationContext> = {
  id: "messaging.auth-welcome-email",
  name: "Send account welcome email",
  domain: "messaging",
  type: "operational",
  trigger: { kind: "event", events: ["auth.welcome_email"] },
  condition: { description: "Run for the existing account welcome-email call.", evaluate: () => true },
  idempotencyKey: null,
  delay: null,
  cancels: [],
  actionGuard: "Account creation remains owned by its existing caller; this action does not create or alter accounts.",
  action: { kind: "send_message", detail: "Invoke the existing best-effort welcome email sender." },
  retryPolicy: "No automation retry; the sender catches/logs provider errors.",
  failureBehavior: "The sender's existing best-effort behavior is preserved; a returned void is not proof of delivery.",
  enabled: true,
};