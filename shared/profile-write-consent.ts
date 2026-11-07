/**
 * Per-user consent for writing plan-edit feedback and selection counts back onto the
 * traveler profile. The flag lives on the existing `users.preferences` jsonb
 * (`profileWriteConsent.grantedAt`). Absent means off. No new column.
 *
 * HELD for Leon's wording approval. This sentence is not shown on any traveler surface.
 * Do not render it until that approval lands.
 */
export const PROFILE_WRITE_CONSENT_SENTENCE_HELD =
  "HELD: saving notes from plan changes waits on approved wording.";

export const PROFILE_WRITE_CONSENT_KEY = "profileWriteConsent";

/** True only when this account has an explicit grant timestamp. A missing key, a boolean, or a blank stamp is off. */
export function profileWriteConsentGranted(preferences: unknown): boolean {
  if (!preferences || typeof preferences !== "object") return false;
  const raw = (preferences as Record<string, unknown>)[PROFILE_WRITE_CONSENT_KEY];
  if (!raw || typeof raw !== "object") return false;
  const at = (raw as Record<string, unknown>).grantedAt;
  return typeof at === "string" && at.trim().length > 0;
}
