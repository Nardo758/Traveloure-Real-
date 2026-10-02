import type { AutomationContext, AutomationDefinition } from "../contract";
import { coreNode, type CoreMessage } from "./_core-definition";

export const authVerificationEmailAutomation: AutomationDefinition<AutomationContext> = {
  ...coreNode("verify_email", "messaging.auth-verification-email"),
  trigger: { kind: "event", events: ["signup_journey.verify_email", "auth.verification_email"] },
};

// Preserve the existing registered ID; the core journey uses its guarded event.
export const verifyEmailMessage: CoreMessage = {
  kind: "verify_email",
  node: authVerificationEmailAutomation,
  copy: ({ name }) => ({
    subject: "Confirm your email to start planning",
    body: `Hi ${name}, welcome to Traveloure. Tap the button to confirm your email. The link works for 24 hours.`,
    button: "Confirm my email", path: "/verify-email",
  }),
};