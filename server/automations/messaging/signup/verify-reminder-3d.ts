import { signupDefinition } from "../signup-definition";
export const verifyReminder3dAutomation = signupDefinition(
  "messaging.verify-reminder-3d", "verify_reminder_3d",
  (c) => c.active === true && c.verified === false && c.due === true,
);