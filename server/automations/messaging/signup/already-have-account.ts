import { signupDefinition } from "../signup-definition";
export const alreadyHaveAccountAutomation = signupDefinition(
  "messaging.already-have-account", "already_have_account",
  (c) => c.active === true,
);