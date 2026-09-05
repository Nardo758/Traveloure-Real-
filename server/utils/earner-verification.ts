/**
 * earner-verification.ts — "has this earner completed identity verification?", once.
 *
 * Extracted verbatim from `server/routes/storefront.routes.ts` by ledger
 * `2026-09-05-user-id-is-internal` (CLAUDE.md Locked Decision 40), which needs the same answer on
 * the contact start rail's recipient card. A second copy of it is the derivation-drift class §18
 * rule 1 names — the storefront pill and the message-recipient pill would disagree the day either
 * one's predicate moves.
 *
 * It reads the SAME `identityVerificationStatus === 'verified'` signal the "ID Verified" badge on
 * /experts/:id and /services/:id uses (a completed Stripe Identity session — flipped only by the
 * identity webhook, never self-reported). Checked on BOTH onboarding forms regardless of the
 * account's current role, because a user's stored role can be ambiguous relative to which form they
 * filled out, so verified-in-either counts.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { localExpertForms, serviceProviderForms } from "@shared/schema";

export async function isOwnerIdentityVerified(userId: string): Promise<boolean> {
  const [localExpertForm] = await db
    .select({ status: localExpertForms.identityVerificationStatus })
    .from(localExpertForms)
    .where(eq(localExpertForms.userId, userId))
    .limit(1);
  if (localExpertForm?.status === "verified") return true;

  const [providerForm] = await db
    .select({ status: serviceProviderForms.identityVerificationStatus })
    .from(serviceProviderForms)
    .where(eq(serviceProviderForms.userId, userId))
    .limit(1);
  return providerForm?.status === "verified";
}
