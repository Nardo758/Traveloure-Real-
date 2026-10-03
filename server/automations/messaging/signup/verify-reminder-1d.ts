import { signupDefinition } from "../signup-definition";
export const verifyReminder1dAutomation = signupDefinition(
  "messaging.verify-reminder-1d", "verify_reminder_1d",
  (c) => c.active === true && c.verified === false && c.due === true,
);