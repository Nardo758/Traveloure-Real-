import { authVerificationEmailAutomation } from "./signup/verify-email";
import { authWelcomeEmailAutomation } from "./signup/welcome-email";
import { verifyReminder1hAutomation } from "./signup/verify-reminder-1h";
import { verifyReminder1dAutomation } from "./signup/verify-reminder-1d";
import { verifyReminder3dAutomation } from "./signup/verify-reminder-3d";
import { alreadyHaveAccountAutomation } from "./signup/already-have-account";

export const signupAutomations = [
  authVerificationEmailAutomation, authWelcomeEmailAutomation,
  verifyReminder1hAutomation, verifyReminder1dAutomation, verifyReminder3dAutomation,
  alreadyHaveAccountAutomation,
] as const;
// The two existing stable producer IDs above are already in producerAutomations.
export const additionalSignupAutomations = signupAutomations.slice(2);