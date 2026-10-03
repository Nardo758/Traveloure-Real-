import { signupDefinition } from "../signup-definition";
export const verifyReminder1hAutomation = signupDefinition(
  "messaging.verify-reminder-1h", "verify_reminder_1h",
  (c) => c.active === true && c.verified === false && c.due === true,
);