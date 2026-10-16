// LW-1-0 (ledger `2026-10-15-lw1-0-oauth-email-merge`): what a person reads when a first-time social sign-in
// matched an existing account's email and was NOT merged into it (server/replit_integrations/auth/email-merge.ts).
// ONE spelling for the server's refusal and the login page's notice (§18 rule 1).

/** The code a refused merge carries from the verify callback to the OAuth callback route. */
export const EMAIL_SIGN_IN_REQUIRED = "EMAIL_SIGN_IN_REQUIRED";
/** The `/login?error=` value the OAuth callbacks redirect a refused merge to. */
export const EMAIL_SIGN_IN_REQUIRED_PARAM = "email_sign_in_required";
export const EMAIL_SIGN_IN_REQUIRED_MESSAGE =
  "An account with this email already exists. Sign in with your email and password.";
