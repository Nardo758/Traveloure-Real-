/**
 * The consent flag for profile write-back. Reads of an existing profile do not call this.
 * `grantProfileWriteConsent` / `revokeProfileWriteConsent` are the only writers of the key.
 * No route calls them: the sentence in `PROFILE_WRITE_CONSENT_SENTENCE_HELD` is HELD for
 * Leon's wording approval and is not shown.
 */
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { PROFILE_WRITE_CONSENT_KEY, profileWriteConsentGranted } from "@shared/profile-write-consent";
import { db } from "../db";
import { updateUserPreferences } from "./user-preferences-writer";

export async function hasProfileWriteConsent(userId: string): Promise<boolean> {
  const [row] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  return profileWriteConsentGranted(row?.preferences);
}

/** Stamp an explicit grant. Returns false when the user does not exist. */
export async function grantProfileWriteConsent(userId: string, at: string = new Date().toISOString()): Promise<boolean> {
  const wrote = await updateUserPreferences(userId, (current) => ({
    preferences: { ...current, [PROFILE_WRITE_CONSENT_KEY]: { grantedAt: at } },
    result: true,
  }));
  return wrote === true;
}

/** Clear the grant. Other preference keys stay. */
export async function revokeProfileWriteConsent(userId: string): Promise<void> {
  await updateUserPreferences(userId, (current) => {
    const next = { ...current };
    delete next[PROFILE_WRITE_CONSENT_KEY];
    return { preferences: next, result: true };
  });
}
