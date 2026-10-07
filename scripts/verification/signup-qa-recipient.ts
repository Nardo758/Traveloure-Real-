/**
 * Development verification ONLY. This module is not imported by the app or
 * its production build. Never copy this substitution into an email writer.
 */
export function resolveSignupQaRecipient(
  accountEmail: string,
  environment: Pick<NodeJS.ProcessEnv, "NODE_ENV" | "SIGNUP_QA_TEST_INBOX">,
): string {
  if (environment.NODE_ENV !== "development" || !/^[^@\s]+@traveloure-qa\.test$/i.test(accountEmail)) {
    return accountEmail;
  }
  const inbox = environment.SIGNUP_QA_TEST_INBOX;
  if (!inbox || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inbox) || /@traveloure-qa\.test$/i.test(inbox)) {
    throw new Error("A routable development signup QA inbox is required");
  }
  return inbox;
}
