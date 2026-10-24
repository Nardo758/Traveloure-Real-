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
 *
 * Contact (row 101, the same switch): an unverified non-earner may not start contact
 * with an earner. assertTravelerMayContact refuses that case on the message rails.
 * A traveler request route has no recipient id yet; refuseUnverifiedTravelerSender
 * applies the same decision with the route standing in as the earner address.
 * An earner sender is allowed. Expert accept, decline, and inbox answers do not
 * mount this gate. The websocket refuses only the unverified traveler's first
 * message to an earner, and leaves the socket open; a thread the earner has
 * already answered stays open.
 */
import type { RequestHandler } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  EMAIL_VERIFICATION_HOLD_MESSAGE,
  EMAIL_VERIFICATION_REQUIRED_CODE,
  emailVerificationDeniedBody,
} from "@shared/email-verification-gate";
import { users } from "@shared/models/auth";
import { isEarnerRole } from "@shared/roles";
import { authStorage } from "../replit_integrations/auth/storage";
import { db } from "../db";
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

/**
 * Pure contact decision. Deny only while enforcement is on, the sender is not an
 * earner, the recipient is an earner, and the sender's email_verified is null.
 * A missing role is not an earner. A missing verification timestamp is unverified.
 */
export function decideTravelerMayContact(input: {
  enforced: boolean;
  senderRole: string | null | undefined;
  recipientRole: string | null | undefined;
  senderEmailVerified: Date | string | null | undefined;
}): VerifiedEmailActionDecision {
  if (!input.enforced) return "allow";
  if (isEarnerRole(input.senderRole)) return "allow";
  if (!isEarnerRole(input.recipientRole)) return "allow";
  if (input.senderEmailVerified != null) return "allow";
  return "deny";
}

/**
 * One query for both accounts. While enforcement is off this does not touch the
 * database, so a refused-when-on path stays byte-identical to an ungated handler.
 */
export async function assertTravelerMayContact(input: {
  senderId: string;
  recipientId: string;
}): Promise<VerifiedEmailActionDecision> {
  if (!verifiedEmailActionsEnforced()) return "allow";
  if (!input.senderId || !input.recipientId) return "allow";

  const ids =
    input.senderId === input.recipientId
      ? [input.senderId]
      : [input.senderId, input.recipientId];
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(inArray(users.id, ids));

  const sender = rows.find((row) => row.id === input.senderId);
  const recipient = rows.find((row) => row.id === input.recipientId);
  return decideTravelerMayContact({
    enforced: true,
    senderRole: sender?.role,
    recipientRole: recipient?.role,
    senderEmailVerified: sender?.emailVerified,
  });
}

/** Writes the shared 403 and returns true when the sender may not contact this recipient. */
export async function refuseUnverifiedTravelerContact(
  res: { status(code: number): { json(body: unknown): unknown } },
  senderId: string,
  recipientId: string,
): Promise<boolean> {
  if ((await assertTravelerMayContact({ senderId, recipientId })) !== "deny") return false;
  res.status(403).json(emailVerificationDeniedBody());
  return true;
}

/**
 * Sender half of the contact decision for a route that is itself a request to an
 * earner. While enforcement is off this does not touch the database. An earner
 * sender is allowed. An unverified non-earner is refused.
 */
export async function assertTravelerMayRequestExpert(senderId: string): Promise<VerifiedEmailActionDecision> {
  if (!verifiedEmailActionsEnforced()) return "allow";
  if (!senderId) return "allow";
  const [sender] = await db
    .select({ role: users.role, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, senderId))
    .limit(1);
  return decideTravelerMayContact({
    enforced: true,
    senderRole: sender?.role,
    recipientRole: "travel_expert",
    senderEmailVerified: sender?.emailVerified,
  });
}

/** Writes the shared 403 and returns true when this sender may not open an expert request. */
export async function refuseUnverifiedTravelerSender(
  res: { status(code: number): { json(body: unknown): unknown } },
  senderId: string,
): Promise<boolean> {
  if ((await assertTravelerMayRequestExpert(senderId)) !== "deny") return false;
  res.status(403).json(emailVerificationDeniedBody());
  return true;
}

/** Socket frame for the same refusal. The connection stays open. */
export function travelerContactSocketError(): {
  type: "error";
  errorCode: typeof EMAIL_VERIFICATION_REQUIRED_CODE;
  error: typeof EMAIL_VERIFICATION_HOLD_MESSAGE;
} {
  return {
    type: "error",
    errorCode: EMAIL_VERIFICATION_REQUIRED_CODE,
    error: EMAIL_VERIFICATION_HOLD_MESSAGE,
  };
}
