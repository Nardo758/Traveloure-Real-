/**
 * Signup journey's only durable writer. The existing outbox is the delay adapter;
 * its existing drain is the only scheduler/sender. All writers and auth delivery
 * share a per-user advisory lock, including duplicate signup and OAuth callers.
 */
import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { users, emailVerificationTokens } from "@shared/models/auth";
import { emailOutbox } from "@shared/schema";
import { dispatchAutomationEvent } from "../automations/event-dispatcher";
import { messagingAutomationRegistry } from "../automations/messaging";
import { reminderIds } from "../automations/messaging/signup-definition";
import { signupAutomations } from "../automations/messaging/signup-index";
import { getAppBaseUrl, type SendEmailParams, type SendEmailResult } from "./email.service";
import { REMINDER_DELAYS, VERIFICATION_TTL_MS, signupEmail, signupLanguage } from "./signup-email-payloads";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Account = typeof users.$inferSelect;
export type SignupMetadata = {
  signupJourney: true; userId: string; automationId: string; idempotencyKey: string;
  language: string; tokenHash?: string; dueAt: string;
};
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`signup:${userId}`}, 0))`);
}
async function cancelRows(tx: Tx, userId: string, automationId: string) {
  await tx.execute(sql`
    UPDATE email_outbox SET status='cancelled', retry_after=NULL, updated_at=NOW(),
      last_error='Cancelled by verified account state'
    WHERE metadata->>'signupJourney'='true' AND metadata->>'userId'=${userId}
      AND metadata->>'automationId'=${automationId} AND status IN ('pending','failed','processing')
  `);
}
async function queue(
  tx: Tx, user: Account, nodeId: string, key: string, dueAt: Date, tokenHash?: string, verifyUrl?: string,
): Promise<number> {
  const previous = await tx.execute(sql`SELECT id FROM email_outbox WHERE metadata->>'idempotencyKey'=${key} LIMIT 1`);
  if (previous.rows[0]) return Number((previous.rows[0] as { id: number }).id);
  const node = signupAutomations.find((n) => n.id === nodeId);
  if (!node || !user.email) throw new Error("Unknown signup node or missing account email");
  const language = signupLanguage(user.preferences);
  const payload = signupEmail(node.name, user.email, user.firstName, language, verifyUrl);
  const metadata: SignupMetadata = {
    signupJourney: true, userId: user.id, automationId: nodeId, idempotencyKey: key,
    language, dueAt: dueAt.toISOString(), ...(tokenHash ? { tokenHash } : {}),
  };
  const dispatched = await dispatchAutomationEvent(
    messagingAutomationRegistry, "messaging.email-outbox-enqueue",
    { event: "email.enqueue", emailType: node.name },
    async () => {
      const [row] = await tx.insert(emailOutbox).values({
        emailType: node.name, toEmail: user.email!, subject: payload.subject,
        html: payload.html, textBody: payload.text, status: "pending",
        retryAfter: dueAt, maxAttempts: 6, metadata,
      }).returning({ id: emailOutbox.id });
      if (!row) throw new Error("Signup outbox insert failed");
      return row.id;
    },
  );
  if (!dispatched.executed) throw new Error(`Signup enqueue skipped: ${dispatched.reason}`);
  return dispatched.result;
}
async function queueWelcome(tx: Tx, user: Account): Promise<number> {
  if (!user.emailVerified || user.isDeleted || user.isSuspended) throw new Error("Welcome requires a verified active account");
  const outcome = await dispatchAutomationEvent(
    messagingAutomationRegistry, "messaging.auth-welcome-email",
    { event: "auth.welcome_email", active: true, verified: true },
    async () => ({ ok: true, id: await queue(tx, user, "messaging.auth-welcome-email", `welcome:${user.id}`, new Date()) }),
    { cancellation: { cancel: async (_source, target) => cancelRows(tx, user.id, target) } },
  );
  if (!outcome.executed) throw new Error(`Welcome enqueue skipped: ${outcome.reason}`);
  await cancelRows(tx, user.id, "messaging.auth-verification-email");
  return outcome.result.id;
}
async function issue(tx: Tx, user: Account): Promise<number> {
  const now = new Date();
  if (user.emailVerified) return queueWelcome(tx, user);
  if (user.isDeleted || user.isSuspended || !user.email) throw new Error("Account cannot receive verification");
  await tx.update(emailVerificationTokens).set({ usedAt: now })
    .where(and(eq(emailVerificationTokens.userId, user.id), isNull(emailVerificationTokens.usedAt)));
  await cancelRows(tx, user.id, "messaging.auth-verification-email");
  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = hash(raw);
  await tx.insert(emailVerificationTokens).values({
    userId: user.id, tokenHash, expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
  });
  const id = await queue(tx, user, "messaging.auth-verification-email", `verify:${user.id}:${tokenHash}`, now,
    tokenHash, `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(raw)}`);
  for (let index = 0; index < reminderIds.length; index++) {
    const nodeId = reminderIds[index];
    const dueAt = new Date((user.createdAt ?? now).getTime() + REMINDER_DELAYS[index]);
    await queue(tx, user, nodeId, `${nodeId}:${user.id}`, dueAt);
  }
  return id;
}

/** Caller must deliver only after this transaction has committed. */
export async function issueSignupVerification(userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error("Account not found");
    return issue(tx, user);
  });
}
/** Email lock closes the concurrent duplicate-registration/unique-constraint tell. */
export async function registerSignupAccount(
  values: Pick<typeof users.$inferInsert, "email" | "password" | "firstName" | "lastName" |
    "termsAcceptedAt" | "privacyAcceptedAt" | "termsVersion" | "privacyVersion" | "preferences">,
  requestId: string,
): Promise<{ outboxId: number | null; createdUserId: string | null }> {
  if (!values.email) throw new Error("Email required");
  const email = values.email.toLowerCase();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`signup-email:${email}`}, 0))`);
    let [user] = await tx.select().from(users).where(eq(users.email, email));
    if (user) {
      await lockUser(tx, user.id);
      if (user.isDeleted || user.isSuspended) return { outboxId: null, createdUserId: null };
      const outboxId = await queue(tx, user, "messaging.already-have-account",
        `already:${user.id}:${requestId}`, new Date());
      return { outboxId, createdUserId: null };
    }
    const inserted = await tx.insert(users).values({ ...values, email, role: "user", authProvider: "email" })
      .onConflictDoNothing({ target: users.email }).returning();
    // Other account authors (OAuth) do not use our email lock.
    user = inserted[0] ?? (await tx.select().from(users).where(eq(users.email, email)))[0];
    if (!user) throw new Error("Account insert failed");
    await lockUser(tx, user.id);
    if (!inserted[0]) {
      if (user.isDeleted || user.isSuspended) return { outboxId: null, createdUserId: null };
      return { outboxId: await queue(tx, user, "messaging.already-have-account",
        `already:${user.id}:${requestId}`, new Date()), createdUserId: null };
    }
    return { outboxId: await issue(tx, user), createdUserId: user.id };
  });
}
export async function queueAlreadyHaveAccount(userId: string, requestId: string): Promise<number | null> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user || !user.email || user.isDeleted || user.isSuspended) return null;
    return queue(tx, user, "messaging.already-have-account", `already:${userId}:${requestId}`, new Date());
  });
}
export async function completeSignupVerification(rawToken: string): Promise<
  { verified: false } | { verified: true; outboxId: number }
> {
  return db.transaction(async (tx) => {
    const tokenHash = hash(rawToken);
    // Only identify the lock owner here. Re-read validity after acquiring the lock.
    const [candidate] = await tx.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, tokenHash));
    if (!candidate) return { verified: false };
    await lockUser(tx, candidate.userId);
    const [token] = await tx.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.id, candidate.id));
    const [user] = await tx.select().from(users).where(eq(users.id, candidate.userId));
    const now = new Date();
    if (!token || token.usedAt || token.expiresAt <= now || !user || user.isDeleted || user.isSuspended) return { verified: false };
    await tx.update(emailVerificationTokens).set({ usedAt: now }).where(eq(emailVerificationTokens.id, token.id));
    if (!user.emailVerified) await tx.update(users).set({ emailVerified: now }).where(eq(users.id, user.id));
    const outboxId = await queueWelcome(tx, { ...user, emailVerified: user.emailVerified ?? now });
    return { verified: true, outboxId };
  });
}

/** OAuth compatibility: no welcome for an unverified account. */
export async function ensureWelcomeForEmail(email: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (!user || user.isDeleted || user.isSuspended) return;
  const id = await issueSignupVerification(user.id);
  const { deliverQueuedEmail } = await import("./email-outbox.service");
  await deliverQueuedEmail(id);
}

/**
 * Execute provider work while holding the same lock as verification. No reminder
 * can begin delivery after verification wins that lock. Already-sent messages
 * cannot be recalled. Normal (non-journey) outbox rows never take this path.
 */
export async function guardSignupDelivery(
  outboxId: number, metadata: SignupMetadata,
  send: (options: Pick<SendEmailParams, "idempotencyKey" | "securityCritical">) => Promise<SendEmailResult>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockUser(tx, metadata.userId);
    const [row] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId));
    if (!row || row.status !== "processing") return false;
    const [user] = await tx.select().from(users).where(eq(users.id, metadata.userId));
    const node = messagingAutomationRegistry.byId.get(metadata.automationId);
    if (!node || node.trigger.kind !== "event") throw new Error("Unknown signup delivery automation");
    const token = metadata.tokenHash
      ? (await tx.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, metadata.tokenHash)))[0]
      : undefined;
    const active = !!user?.email && !user.isDeleted && !user.isSuspended && user.email === row.toEmail;
    const result = await dispatchAutomationEvent(
      messagingAutomationRegistry, node.id,
      {
        event: node.trigger.events[0], active, verified: !!user?.emailVerified,
        due: new Date(metadata.dueAt).getTime() <= Date.now(),
        tokenValid: !!token && !token.usedAt && token.expiresAt.getTime() > Date.now(),
      },
      () => send({ idempotencyKey: metadata.idempotencyKey, securityCritical: true }),
      { cancellation: { cancel: async (_source, target) => cancelRows(tx, metadata.userId, target) } },
    );
    if (!result.executed) {
      await tx.update(emailOutbox).set({ status: "cancelled", retryAfter: null,
        lastError: `Signup guard: ${result.reason}`, updatedAt: new Date() }).where(eq(emailOutbox.id, outboxId));
    }
    return result.executed;
  });
}