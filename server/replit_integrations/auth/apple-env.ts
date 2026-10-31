/**
 * Sign in with Apple enablement (fix-queue row 282, ledger `2026-10-31-sign-in-with-apple`).
 *
 * Names only. Values stay in the environment. This module does not log them.
 * The flag defaults off: only the exact string "true" enables the feature, and
 * only when every APPLE_* name below is a non-empty string.
 */

export const SIGN_IN_WITH_APPLE_ENABLED = "SIGN_IN_WITH_APPLE_ENABLED";

export const APPLE_ENV_NAMES = [
  "APPLE_TEAM_ID",
  "APPLE_SERVICES_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
] as const;

export type AppleEnvName = (typeof APPLE_ENV_NAMES)[number];

function nonEmptyEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function appleSignInFlagOn(): boolean {
  return process.env[SIGN_IN_WITH_APPLE_ENABLED] === "true";
}

export function missingAppleEnvNames(): AppleEnvName[] {
  return APPLE_ENV_NAMES.filter((name) => !nonEmptyEnv(name));
}

/** True only when the flag is on and every Apple env name is set. */
export function appleSignInConfigured(): boolean {
  return appleSignInFlagOn() && missingAppleEnvNames().length === 0;
}

/** The Services ID, used as the id_token audience. Null when unset. Never logged by callers. */
export function appleServicesId(): string | null {
  const value = process.env.APPLE_SERVICES_ID;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
