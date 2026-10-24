/**
 * Soft verification for money and booking starts (row 101, Leon, Oct 24 2026).
 *
 * An account whose email is not verified may sign in. It may not start a checkout
 * or create a booking while email sends are on. The switch is EMAIL_SENDS_ENABLED,
 * read on every request from emailSendsEnabled() — the same exact-string "true"
 * rule as the send path, with no cached copy. Any other value, including unset,
 * leaves every mounted route byte-identical to an ungated handler.
 *
 * Verified means users.email_verified is non-null in the database. Session claims
 * are not consulted, and grandfathering is not honored: a null column is unverified
 * even when the account already has platform activity.
 */
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { emailVerificationDeniedBody } from "@shared/email-verification-gate";
import { users } from "@shared/models/auth";
import { authStorage } from "../replit_integrations/auth/storage";
import { emailSendsEnabled } from "./email.service";

/**
 * db or a transaction that already holds the users row lock.
 * The chain is drizzle's select/from/where/limit. `any` keeps that builder
 * assignable from both the pool and a transaction without importing db here.
 */
type EmailVerifiedConn = {
  select: (shape: { emailVerified: typeof users.emailVerified }) => any;
};

export type VerifiedEmailAction =
  | "checkout"
  | "booking"
  | "expert_contact"
  | "payout"
  | "password_reset"
  | "email_change";

export type VerifiedEmailActionDecision = "allow" | "deny";

/** Production send gate, read per call. Only the exact string true enforces. */
export function verifiedEmailActionsEnforced(): boolean {
  return emailSendsEnabled();
}

/**
 * One decision, no I/O. `emailVerified` is the caller's reading of the column
 * (non-null). While enforcement is off the answer is allow either way.
 */
export function decideVerifiedEmailAction(input: {
  enforced: boolean;
  emailVerified: boolean;
}): VerifiedEmailActionDecision {
  if (!input.enforced) return "allow";
  if (input.emailVerified) return "allow";
  return "deny";
}

/** True only when the stored column is non-null. A missing row is not verified. */
export async function isEmailVerifiedForUser(userId: string): Promise<boolean> {
  const dbUser = await authStorage.getUser(userId);
  return dbUser?.emailVerified != null;
}

/**
 * Refuse an unverified account. `action` names the call site; every action in
 * the set shares this one decision. Mount after isAuthenticated so a signed-out
 * request still receives that route's 401. A missing, deleted, or suspended
 * account passes through for the same reason. A database failure is 503 and the
 * log line carries only the user id.
 */
export function requireVerifiedEmail(action: VerifiedEmailAction): RequestHandler {
  return async (req, res, next) => {
    void action;
    if (!verifiedEmailActionsEnforced()) return next();
    if (!req.isAuthenticated || !req.isAuthenticated()) return next();

    const sessionUser = req.user as { claims?: { sub?: string }; id?: string } | undefined;
    const userId = sessionUser?.claims?.sub ?? sessionUser?.id;
    if (!userId) return next();

    try {
      const dbUser = await authStorage.getUser(userId);
      if (!dbUser || dbUser.isDeleted || dbUser.isSuspended) return next();
      const decision = decideVerifiedEmailAction({
        enforced: true,
        emailVerified: dbUser.emailVerified != null,
      });
      if (decision === "deny") {
        return res.status(403).json(emailVerificationDeniedBody());
      }
      return next();
    } catch {
      console.error("[verified-email-action] account read failed for user", userId);
      return res.status(503).json({ message: "Authentication service temporarily unavailable" });
    }
  };
}

/**
 * Payout refusal while sends are on (row 101). The body is the shared
 * verification refusal. Grandfathering is not an input: only users.email_verified
 * counts, and a null column is unverified.
 */
export const PAYOUT_EMAIL_VERIFICATION_BODY = emailVerificationDeniedBody();

/** Real column value on the caller's connection, so a held users-row lock covers the read. */
export async function earnerEmailVerifiedForPayout(
  conn: EmailVerifiedConn,
  earnerId: string,
): Promise<boolean> {
  const [row] = await conn
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, earnerId))
    .limit(1);
  return row?.emailVerified != null;
}

/**
 * The payout refusal, or null when the payout may proceed.
 * Enforcement off returns null without reading the column.
 */
export async function payoutEmailVerificationDenial(
  conn: EmailVerifiedConn,
  earnerId: string,
): Promise<typeof PAYOUT_EMAIL_VERIFICATION_BODY | null> {
  if (!verifiedEmailActionsEnforced()) return null;
  const emailVerified = await earnerEmailVerifiedForPayout(conn, earnerId);
  if (decideVerifiedEmailAction({ enforced: true, emailVerified }) === "allow") return null;
  return PAYOUT_EMAIL_VERIFICATION_BODY;
}
