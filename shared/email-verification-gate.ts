/**
 * S-09: who may leave the verify-email screen, and which routes that screen may call.
 *
 * `emailVerified` set means the address is verified. A social sign-in counts only when
 * the provider's verified-email signal was stamped there (Replit OIDC `email_verified
 * === true` on a new account). Facebook never stamps it.
 *
 * `grandfathered` is a separate fact: the account already had platform activity, so
 * the gate stays open and `emailVerified` is left null. We do not record a
 * verification the person did not do.
 */
import { SIGNUP_STEP_VERIFY_EMAIL } from "./signup-steps";

export const EMAIL_VERIFICATION_REQUIRED_CODE = "email_verification_required";
export const EMAIL_VERIFICATION_HOLD_PATH = "/verify-email";

/**
 * Ledger `2026-10-23-drop-check-email`. The hold predicate stays. Callers do not
 * apply it: production sends no mail while EMAIL_SENDS_ENABLED is off, and
 * enforcing the hold is a later ruling after that gate is lifted.
 */
export const EMAIL_VERIFICATION_HOLD_ENFORCED = false;

/** What a blocked API call says. The verify screen has its own longer copy. */
export const EMAIL_VERIFICATION_HOLD_MESSAGE = "Verify your email to continue.";

/**
 * Public and signed-in resend. Same sentence either way, so the answer does not
 * say whether an account exists or whether a letter was sent.
 */
export const VERIFICATION_RESEND_MESSAGE =
  "If an account exists for that email and still needs verification, we've sent a link.";

/** Changing the address on the verify screen. Same answer when the address is free or taken. */
export const VERIFICATION_EMAIL_CHANGE_MESSAGE =
  "If this address can be used, check your email for a verification link.";

export const VERIFY_EMAIL_SUCCESS_MESSAGE = "Email verified successfully.";
export const VERIFY_EMAIL_INVALID_MESSAGE =
  "This verification link is invalid or has expired. Please request a new one.";

export type EmailVerificationAccess = "open" | "hold";

export function emailVerificationAccess(input: {
  emailVerified: Date | string | null | undefined;
  grandfathered: boolean;
}): EmailVerificationAccess {
  if (input.emailVerified) return "open";
  if (input.grandfathered) return "open";
  return "hold";
}

/**
 * Routes a held session may still call. Everything else is refused.
 * Login, logout, resend, change-email, and the verification link stay available.
 * Dashboard, application, listing, and payment routes are not in this set.
 */
const EMAIL_VERIFICATION_ALLOWLIST = new Set<string>([
  "POST /api/auth/register",
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "GET /api/auth/logout",
  "POST /api/auth/forgot-password",
  "POST /api/auth/reset-password",
  "POST /api/auth/verify-email",
  "POST /api/auth/send-verification",
  "POST /api/auth/resend-verification",
  "POST /api/auth/change-unverified-email",
  "GET /api/auth/user",
  "GET /api/auth/me",
  "GET /api/auth/session",
  "GET /api/users/me",
  "GET /api/auth/terms-versions",
  "POST /api/auth/accept-terms",
  "DELETE /api/auth/account",
  "GET /api/auth/facebook",
  "GET /api/auth/facebook/callback",
]);

export function isEmailVerificationAllowlisted(method: string, path: string): boolean {
  const bare = path.split("?")[0].replace(/\/+$/, "") || "/";
  return EMAIL_VERIFICATION_ALLOWLIST.has(`${method.toUpperCase()} ${bare}`);
}

export function emailVerificationDeniedBody(): {
  code: typeof EMAIL_VERIFICATION_REQUIRED_CODE;
  message: string;
  nextStep: typeof SIGNUP_STEP_VERIFY_EMAIL;
} {
  return {
    code: EMAIL_VERIFICATION_REQUIRED_CODE,
    message: EMAIL_VERIFICATION_HOLD_MESSAGE,
    nextStep: SIGNUP_STEP_VERIFY_EMAIL,
  };
}
