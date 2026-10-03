import { signupDefinition } from "../signup-definition";
export const authVerificationEmailAutomation = signupDefinition(
  "messaging.auth-verification-email", "verify_email",
  (c) => c.active === true && c.verified === false && c.tokenValid === true,
);