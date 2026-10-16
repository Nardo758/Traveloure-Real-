/**
 * AUTH-1 fix 3b (ledger `2026-10-16-auth1-3b-neutral-registration`): the ONE neutral answer to an email sign-up.
 *
 * `POST /api/auth/register` gives this same status and body to a valid sign-up for a new address and for an
 * address that already has an account. The body carries no user id, role, email or "account exists" field, and the
 * request signs nobody in. The new account confirms its address by email and then signs in like anyone else.
 *
 * Both clients read `code` to show the neutral completion state; the visible sentence comes from the locale files.
 * `REGISTRATION_NEUTRAL_MESSAGE` is the server's English copy of that sentence, for API callers.
 */
export const REGISTRATION_NEUTRAL_STATUS = 202;
export const REGISTRATION_NEUTRAL_CODE = "registration_received";
export const REGISTRATION_NEUTRAL_MESSAGE =
  "If this address can be used, check your email for next steps. You can also sign in or reset your password.";

export interface RegistrationNeutralBody {
  code: typeof REGISTRATION_NEUTRAL_CODE;
  message: string;
}

export function registrationNeutralBody(): RegistrationNeutralBody {
  return { code: REGISTRATION_NEUTRAL_CODE, message: REGISTRATION_NEUTRAL_MESSAGE };
}

/** True when a register response is the neutral answer (checked by both clients). */
export function isRegistrationNeutral(status: number, body: unknown): boolean {
  return (
    status === REGISTRATION_NEUTRAL_STATUS &&
    !!body &&
    typeof body === "object" &&
    (body as { code?: unknown }).code === REGISTRATION_NEUTRAL_CODE
  );
}
