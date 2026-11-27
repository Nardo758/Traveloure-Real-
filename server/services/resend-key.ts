import type { ResendKeySource } from "../../shared/resend-diagnostic";

/**
 * The one place the server reads its Resend credential.
 *
 * `TRAVELOURE_RESEND_API_KEY` wins. `RESEND_API_KEY` is read only when the new
 * name is unset (undefined or empty). A set value is returned exactly as it is:
 * whitespace and quotes are the diagnostic's to report, never repaired here,
 * so a malformed new value does not silently fall back to the old one.
 *
 * Why two names (ledger `2026-11-26-resend-key-var-rename`): on 2026-11-26 the
 * published deployment kept loading a dead `RESEND_API_KEY` that no secrets
 * screen showed and no publish replaced. Reading a new name takes that stored
 * copy out of the path.
 */
export const RESEND_KEY_VARS: readonly ResendKeySource[] = ["TRAVELOURE_RESEND_API_KEY", "RESEND_API_KEY"];

export interface ResolvedResendKey {
  /** The credential to use, or undefined when neither variable is set. */
  key: string | undefined;
  /** The NAME of the variable the credential came from. Never the value. */
  source: ResendKeySource | null;
}

export function resolveResendKey(
  env: Record<string, string | undefined> = process.env,
): ResolvedResendKey {
  for (const name of RESEND_KEY_VARS) {
    const value = env[name];
    if (typeof value === "string" && value.length > 0) return { key: value, source: name };
  }
  return { key: undefined, source: null };
}
