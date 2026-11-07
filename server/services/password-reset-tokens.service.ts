/**
 * AUTH-1 Finding B: a new reset request revokes every earlier link, and issuing and using a link take
 * the SAME lock in the SAME order — the account row first, then its tokens — so the two can never
 * deadlock and never interleave half-way.
 *
 *   · Issue: lock the account; mark every unused reset token of that account used (`used_at` IS the
 *     revocation mark — no new column); insert the new hashed token; commit. A failure rolls the
 *     revocation and the insert back together, so the earlier link stays valid.
 *   · Use: find the token's account WITHOUT claiming it; lock that account; claim the token only if it
 *     is still unused and unexpired; change the password and purge the account's sessions; commit. A
 *     failure rolls the claim and the password back together.
 *
 * "Newest" means the last issuance to COMMIT. Emails can still arrive out of order; an older email's
 * link simply no longer works.
 */
import crypto from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { users, passwordResetTokens } from "@shared/models/auth";
import { dispatchModerationEvent } from "../automations/moderation/runtime";
import { accessAuditLogs } from "@shared/schema";
import { isTestAccount } from "./test-account";
import { verifyLoginCredential } from "./login-credentials.service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const RESET_TOKEN_TTL_MIN = 60;

/** No secrets leave this result. Recipient fields are used only by the existing notice producer. */
export type AdminQaResetResult =
  | { ok: false }
  | { ok: true; auditId: string; email: string; firstName: string | null };

/**
 * QA-only admin recovery. Lock both accounts in ID order so concurrent resets cannot deadlock.
 * Re-authentication and target eligibility are checked under those locks, not trusted from the UI.
 * This does not create an email identity, verify an address, restore an account or grant a role.
 */
export async function resetQaPasswordAsAdmin(input: {
  adminId: string;
  targetId: string;
  adminPassword: string;
  hashedPassword: string;
}): Promise<AdminQaResetResult> {
  return db.transaction(async (tx) => {
    const accounts = new Map<string, typeof users.$inferSelect>();
    for (const id of Array.from(new Set([input.adminId, input.targetId])).sort()) {
      const [account] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (account) accounts.set(id, account);
    }
    const admin = accounts.get(input.adminId);
    const target = accounts.get(input.targetId);
    const credentialOk = await verifyLoginCredential(input.adminPassword, admin?.password ?? null);
    if (!credentialOk || !admin || admin.role !== "admin" || admin.isDeleted || admin.isSuspended
      || !target || target.role === "admin" || target.isDeleted || target.isSuspended
      || !target.password || !target.email || !isTestAccount(target)) {
      return { ok: false };
    }
    const auditId = crypto.randomUUID();
    await tx.update(users).set({ password: input.hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, target.id));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, target.id), isNull(passwordResetTokens.usedAt)));
    await tx.execute(sql`
      DELETE FROM sessions
      WHERE sess->'passport'->'user'->'claims'->>'sub' = ${target.id}
         OR sess->'passport'->'user'->>'id' = ${target.id}
    `);
    // An audit failure is fatal: never commit an unrecorded credential replacement.
    await tx.insert(accessAuditLogs).values({
      id: auditId, actorId: admin.id, actorRole: "admin",
      action: "reset_qa_password", resourceType: "user",
      resourceId: target.id, targetUserId: target.id,
      metadata: { decision: "qa_password_reset", sessionsRevoked: true, resetLinksRevoked: true },
    });
    return { ok: true, auditId, email: target.email, firstName: target.firstName };
  });
}

/** sha256 of a raw emailed token; only the hash is ever stored. Shared with email verification. */
export function hashAuthToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * The account a reset link names. Read-only: no lock, no `used_at` write, no expiry check.
 * An unknown raw token returns null. Callers that must not consume an unverified account's
 * link (row 101, while email sends are on) ask this before `consumePasswordResetToken`.
 */
export async function peekPasswordResetTokenUser(rawToken: string): Promise<string | null> {
  const tokenHash = hashAuthToken(rawToken);
  const [row] = await db
    .select({ userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  return row?.userId ?? null;
}

/** Test seams only: force a failure part-way through a transaction to prove it rolls back whole. */
export const _resetTokenTestHooks: {
  afterRevoke?: (tx: Tx, userId: string) => Promise<void>;
  afterAccountLock?: (tx: Tx, userId: string) => Promise<void>;
  afterPasswordWrite?: (tx: Tx, userId: string) => Promise<void>;
} = {};

/** Issue a new link for an account, revoking every earlier unused one. Returns the raw token. */
export async function issuePasswordResetToken(userId: string): Promise<{ raw: string; expiresAt: Date }> {
  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashAuthToken(raw);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    await tx.update(passwordResetTokens).set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
    if (_resetTokenTestHooks.afterRevoke) await _resetTokenTestHooks.afterRevoke(tx, userId);
    await tx.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
  });
  return { raw, expiresAt };
}

/**
 * Use a link: set the already-hashed password and end the account's sessions. Returns false — and
 * changes nothing — for an unknown, used, revoked or expired token.
 */
export async function consumePasswordResetToken(rawToken: string, hashedPassword: string): Promise<boolean> {
  const tokenHash = hashAuthToken(rawToken);
  const [candidate] = await db.select({ userId: passwordResetTokens.userId }).from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
  if (!candidate) return false;
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, candidate.userId)).for("update");
    if (_resetTokenTestHooks.afterAccountLock) await _resetTokenTestHooks.afterAccountLock(tx, candidate.userId);
    const now = new Date();
    // The claim is the guard: exactly one caller can move used_at from NULL, and a revoked token
    // already carries a used_at.
    const [claimed] = await tx.update(passwordResetTokens).set({ usedAt: now })
      .where(and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        eq(passwordResetTokens.userId, candidate.userId),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ))
      .returning({ userId: passwordResetTokens.userId });
    if (!claimed) return false;

    await tx.update(users).set({ password: hashedPassword }).where(eq(users.id, claimed.userId));
    if (_resetTokenTestHooks.afterPasswordWrite) await _resetTokenTestHooks.afterPasswordWrite(tx, claimed.userId);
    // Session invalidation is part of the same transaction and covers both Passport user shapes.
    await dispatchModerationEvent(
      "moderation.password-reset-session-purge",
      "password_reset.password_persisted",
      { userId: claimed.userId, resetTokenClaimed: true },
      { userId: claimed.userId, resetTokenClaimed: true },
      () => tx.execute(sql`
        DELETE FROM sessions
        WHERE sess->'passport'->'user'->'claims'->>'sub' = ${claimed.userId}
           OR sess->'passport'->'user'->>'id' = ${claimed.userId}
      `),
    );
    return true;
  });
}
