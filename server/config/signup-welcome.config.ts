/**
 * AUTH-1 Finding A: while an account's address is unverified, its signup welcome is held and looked at
 * again after this many minutes. A duration, never a rate (§8). Env-overridable; an unset, non-numeric
 * or non-positive value reads the ruled default of 5 minutes. It is when the row becomes eligible again,
 * not a promise that a drain will run then.
 */
export function welcomeVerificationRetryMinutes(): number {
  const raw = process.env.WELCOME_VERIFICATION_RETRY_MINUTES;
  if (raw == null || raw.trim() === "") return 5;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 5;
}
