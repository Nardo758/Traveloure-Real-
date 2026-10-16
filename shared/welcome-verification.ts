/**
 * AUTH-1 Finding A (ii): how long a signup welcome waits for the address to be verified before it is
 * cancelled with `email_never_verified`. It is an admin-editable `platform_settings` row; an absent or
 * invalid row reads the ruled default of 7 days. Durations only, never a rate (§8).
 */
export const WELCOME_VERIFICATION_WINDOW_SETTING = "welcome_verification_window_days" as const;
export const WELCOME_VERIFICATION_WINDOW_DEFAULT_DAYS = 7;

/** The two outbox reasons the verification gate writes (`email_outbox.last_error`). */
export const WELCOME_AWAITING_VERIFICATION = "awaiting_email_verification" as const;
export const WELCOME_NEVER_VERIFIED = "email_never_verified" as const;

/** A whole number of days from 1 to 9999, as the admin settings screen stores it. */
export function isValidWelcomeVerificationWindowSetting(v: unknown): boolean {
  return typeof v === "string" && /^[1-9][0-9]{0,3}$/.test(v.trim());
}

/** The stored value in days, or the default when the row is absent or not a valid number of days. */
export function parseWelcomeVerificationWindowDays(raw: string | null | undefined): number {
  return isValidWelcomeVerificationWindowSetting(raw) ? Number(String(raw).trim()) : WELCOME_VERIFICATION_WINDOW_DEFAULT_DAYS;
}
