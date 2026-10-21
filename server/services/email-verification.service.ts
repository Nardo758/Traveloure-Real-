/**
 * S-09 email verification (ledger `2026-10-21-email-verification-gate`).
 *
 * Issuing a link revokes every earlier unused one and stores only the sha256.
 * Using a link locks the account first (the same order as password reset), claims
 * the token only while it is unused and unexpired, and stamps email_verified in
 * that same transaction. A second use of a link that already verified the address
 * answers success again. A revoked or expired link does not.
 *
 * The gate stays open for an unverified account that already has platform activity.
 * email_verified is left null in that case. The session remembers the open so later
 * requests skip the activity read. A failed activity read holds the account.
 */
import crypto from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { users, emailVerificationTokens } from "@shared/models/auth";
import { hashAuthToken } from "./password-reset-tokens.service";
import { getAppBaseUrl, sendEmailVerificationEmail } from "./email.service";
import { isEmailUniqueViolation } from "../replit_integrations/auth/email-unique-violation";
import {
  emailVerificationAccess,
  type EmailVerificationAccess,
  EMAIL_VERIFICATION_HOLD_PATH,
} from "@shared/email-verification-gate";
import { nextSignupStep, type SignupStep } from "@shared/signup-steps";

export const VERIFY_TOKEN_TTL_HOURS = 24;

export interface EmailVerificationSession {
  emailVerificationGrandfathered?: boolean;
}

export interface EmailVerificationGateState {
  access: EmailVerificationAccess;
  emailVerificationRequired: boolean;
  nextStep: SignupStep | null;
}

type GateUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  emailVerified: Date | null;
  isDeleted: boolean | null;
  isSuspended: boolean | null;
};

async function loadGateUser(userId: string): Promise<GateUser | null> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      emailVerified: users.emailVerified,
      isDeleted: users.isDeleted,
      isSuspended: users.isSuspended,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

/**
 * Activity that keeps an existing unverified account on the full product.
 * A new signup has none of these. Chat-only AI conversations count. A cart
 * line does not. Admins are not exempt by role.
 */
export async function accountHasVerificationActivity(userId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 AS hit FROM trips WHERE user_id = ${userId}
    UNION ALL
    SELECT 1 FROM service_bookings WHERE traveler_id = ${userId} OR provider_id = ${userId}
    UNION ALL
    SELECT 1 FROM bookings WHERE user_id = ${userId}
    UNION ALL
    SELECT 1 FROM local_expert_forms WHERE user_id = ${userId}
    UNION ALL
    SELECT 1 FROM service_provider_forms WHERE user_id = ${userId}
    UNION ALL
    SELECT 1 FROM provider_services WHERE user_id = ${userId}
    UNION ALL
    SELECT 1 FROM payment_intents WHERE user_id = ${userId}
    UNION ALL
    SELECT 1 FROM conversations WHERE user_id = ${userId}
    UNION ALL
    SELECT 1 FROM trip_expert_advisors WHERE local_expert_id = ${userId}
    LIMIT 1
  `);
  return result.rows.length > 0;
}

export async function resolveEmailVerificationAccess(
  user: { id: string; emailVerified: Date | string | null | undefined },
  session?: EmailVerificationSession,
): Promise<EmailVerificationAccess> {
  if (user.emailVerified) return "open";
  if (session?.emailVerificationGrandfathered) return "open";
  try {
    const active = await accountHasVerificationActivity(user.id);
    if (active) {
      if (session) session.emailVerificationGrandfathered = true;
      return emailVerificationAccess({ emailVerified: null, grandfathered: true });
    }
    return emailVerificationAccess({ emailVerified: null, grandfathered: false });
  } catch {
    console.error("[email-verification] activity check failed for user", user.id);
    return "hold";
  }
}

export async function readEmailVerificationGate(
  user: { id: string; emailVerified: Date | string | null | undefined },
  session?: EmailVerificationSession,
): Promise<EmailVerificationGateState> {
  const access = await resolveEmailVerificationAccess(user, session);
  const emailVerificationRequired = access === "hold";
  return {
    access,
    emailVerificationRequired,
    nextStep: nextSignupStep({ emailVerificationRequired }),
  };
}

/** Call after the login session exists. The pre-login session was regenerated away. */
export function stampGrandfatherOnSession(
  session: EmailVerificationSession | null | undefined,
  access: EmailVerificationAccess,
  emailVerified: Date | string | null | undefined,
): void {
  if (session && access === "open" && !emailVerified) {
    session.emailVerificationGrandfathered = true;
  }
}

/** Where a just-signed-in browser goes. Fail closed to the verify screen. */
export async function pathAfterAuth(
  session: EmailVerificationSession | null | undefined,
  userId: string | null | undefined,
  fallback: string,
): Promise<string> {
  if (!userId) return EMAIL_VERIFICATION_HOLD_PATH;
  try {
    const user = await loadGateUser(userId);
    if (!user || user.isDeleted || user.isSuspended) return fallback;
    const access = await resolveEmailVerificationAccess(user, session ?? undefined);
    return access === "hold" ? EMAIL_VERIFICATION_HOLD_PATH : fallback;
  } catch (err) {
    console.error("[email-verification] post-auth path failed for user", userId);
    return EMAIL_VERIFICATION_HOLD_PATH;
  }
}

export async function mintEmailVerificationToken(userId: string): Promise<{ raw: string; expiresAt: Date }> {
  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashAuthToken(raw);
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    await tx
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)));
    await tx.insert(emailVerificationTokens).values({ userId, tokenHash, expiresAt });
  });
  return { raw, expiresAt };
}

function dispatchVerificationEmail(userId: string, email: string, firstName: string | null, raw: string): void {
  const verifyUrl = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(raw)}`;
  void sendEmailVerificationEmail({
    toEmail: email,
    firstName,
    verifyUrl,
    expiresInHours: VERIFY_TOKEN_TTL_HOURS,
  }).catch(() => {
    console.error("[email-verification] delivery failed for user", userId);
  });
}

export async function issueEmailVerification(
  userId: string,
  email: string,
  firstName: string | null,
): Promise<void> {
  const { raw } = await mintEmailVerificationToken(userId);
  const verifyUrl = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(raw)}`;
  await sendEmailVerificationEmail({
    toEmail: email,
    firstName,
    verifyUrl,
    expiresInHours: VERIFY_TOKEN_TTL_HOURS,
  });
}

/** Public resend. Sends only for an unverified, live account. Callers always answer the same sentence. */
export async function deliverVerificationResend(email: string): Promise<void> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      emailVerified: users.emailVerified,
      isDeleted: users.isDeleted,
      isSuspended: users.isSuspended,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (!user?.email || user.emailVerified || user.isDeleted || user.isSuspended) return;
  const { raw } = await mintEmailVerificationToken(user.id);
  dispatchVerificationEmail(user.id, user.email, user.firstName, raw);
}

/** Signed-in resend. No letter when the address is already verified or the account is closed. */
export async function sendVerificationForSessionUser(userId: string): Promise<void> {
  const user = await loadGateUser(userId);
  if (!user?.email || user.emailVerified || user.isDeleted || user.isSuspended) return;
  const { raw } = await mintEmailVerificationToken(user.id);
  dispatchVerificationEmail(user.id, user.email, user.firstName, raw);
}

export type ConsumeVerificationResult = "verified" | "invalid";

export async function consumeEmailVerificationToken(rawToken: string): Promise<ConsumeVerificationResult> {
  const tokenHash = hashAuthToken(rawToken);
  const [candidate] = await db
    .select({ userId: emailVerificationTokens.userId })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1);
  if (!candidate) return "invalid";

  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, candidate.userId)).for("update");
    const now = new Date();
    const [claimed] = await tx
      .update(emailVerificationTokens)
      .set({ usedAt: now })
      .where(and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        eq(emailVerificationTokens.userId, candidate.userId),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, now),
      ))
      .returning({ userId: emailVerificationTokens.userId });
    if (claimed) {
      await tx.update(users).set({ emailVerified: now }).where(eq(users.id, claimed.userId));
      return "verified";
    }
    const [user] = await tx
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, candidate.userId))
      .limit(1);
    const [row] = await tx
      .select({ usedAt: emailVerificationTokens.usedAt })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);
    if (row?.usedAt && user?.emailVerified) return "verified";
    return "invalid";
  });
}

/**
 * Change the address on a held account. A free address is saved and a new link is
 * minted. A taken address, a verified account, and a grandfathered account are
 * left as they are. Callers answer one sentence either way.
 */
export async function changeUnverifiedEmail(
  userId: string,
  nextEmail: string,
  session?: EmailVerificationSession | null,
): Promise<void> {
  const user = await loadGateUser(userId);
  if (!user?.email || user.isDeleted || user.isSuspended) return;
  const access = await resolveEmailVerificationAccess(user, session ?? undefined);
  if (access !== "hold") return;
  const next = nextEmail.toLowerCase();
  if (next === user.email.toLowerCase()) {
    const { raw } = await mintEmailVerificationToken(user.id);
    dispatchVerificationEmail(user.id, user.email, user.firstName, raw);
    return;
  }
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, next)).limit(1);
  if (taken) return;
  let updated = false;
  try {
    updated = await db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const [row] = await tx
        .update(users)
        .set({ email: next })
        .where(and(eq(users.id, userId), isNull(users.emailVerified)))
        .returning({ id: users.id });
      return Boolean(row);
    });
  } catch (err) {
    if (isEmailUniqueViolation(err)) return;
    throw err;
  }
  if (!updated) return;
  const { raw } = await mintEmailVerificationToken(userId);
  dispatchVerificationEmail(userId, next, user.firstName, raw);
}
