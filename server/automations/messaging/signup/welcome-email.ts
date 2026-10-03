import { reminderIds, signupDefinition } from "../signup-definition";
export const authWelcomeEmailAutomation = signupDefinition(
  "messaging.auth-welcome-email", "welcome_email",
  (c) => c.active === true && c.verified === true,
  reminderIds,
);