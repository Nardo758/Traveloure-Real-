import type { AutomationContext, AutomationDefinition } from "../contract";
import { coreNode, type CoreMessage } from "./_core-definition";

export const authPasswordResetEmailAutomation: AutomationDefinition<AutomationContext> = {
  ...coreNode("reset_request", "messaging.auth-password-reset-email"),
  trigger: { kind: "event", events: ["signup_journey.reset_request", "auth.password_reset_email"] },
};

export const resetRequestMessage: CoreMessage = {
  kind: "reset_request",
  node: authPasswordResetEmailAutomation,
  copy: () => ({
    subject: "Reset your password",
    body: "We got a request to reset your password. If this wasn't you, ignore this email — your account is safe. Link expires in 60 minutes. Use the button within 1 hour. It works once.",
    button: "Reset password", path: "/reset-password",
  }),
};