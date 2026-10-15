// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`; Phase 0 sanction 2 and override (c)): while the traveler
// sign-up switch is in waitlist mode, a Ready-Made purchase is refused with TRAVELER_WAITLIST — except for a
// QA-tagged account (its email on QA_ACCOUNT_EMAIL_DOMAIN, the ONE QA predicate `isQaDomainAccount`) and an admin,
// so checkout stays testable end to end. Pure decision plus one reader; the role is the DB's (§2), never the session's.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { getTravelerSignupMode } from "./platform-flags";
import { isQaDomainAccount } from "./qa-trip-pass.service";
import { TRAVELER_WAITLIST, type TravelerSignupMode } from "@shared/launch-signup";

export type WaitlistPurchaseDecision = { allowed: true } | { allowed: false; code: typeof TRAVELER_WAITLIST };

export function decideWaitlistPurchase(input: {
  mode: TravelerSignupMode;
  user: { role?: string | null; email?: string | null } | null | undefined;
  qaDomain: string | undefined;
}): WaitlistPurchaseDecision {
  if (input.mode === "open") return { allowed: true };
  if (input.user?.role === "admin") return { allowed: true };
  if (isQaDomainAccount(input.user?.email ?? null, input.qaDomain)) return { allowed: true };
  return { allowed: false, code: TRAVELER_WAITLIST };
}

export async function waitlistPurchaseDecisionFor(userId: string): Promise<WaitlistPurchaseDecision> {
  const mode = await getTravelerSignupMode();
  if (mode === "open") return { allowed: true };
  const [user] = await db.select({ role: users.role, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return decideWaitlistPurchase({ mode, user, qaDomain: process.env.QA_ACCOUNT_EMAIL_DOMAIN });
}
