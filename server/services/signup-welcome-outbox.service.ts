import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { emailOutbox, users } from "../../shared/schema";
import { dispatchMessagingEvent } from "../automations/messaging/runtime";
import {
  buildWelcomeEmailPayload,
  type SendEmailParams,
  type SendEmailResult,
} from "./email.service";
import { getWelcomeVerificationWindowDays } from "./platform-flags";
import { welcomeVerificationRetryMinutes } from "../config/signup-welcome.config";
import { WELCOME_AWAITING_VERIFICATION, WELCOME_NEVER_VERIFIED } from "@shared/welcome-verification";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const SIGNUP_WELCOME_EMAIL_TYPE = "signup_welcome";
type Account = typeof users.$inferSelect;

/** These notices are operational, not marketing. Require recorded signup consent. */
export function welcomeSuppressionReason(
  account: Pick<Account, "email" | "isDeleted" | "isSuspended" | "termsAcceptedAt" | "privacyAcceptedAt"> | undefined,
  recipient: string,
  alreadySent: boolean,
): string | null {
  if (!account || account.isDeleted) return "Account no longer exists";
  if (account.isSuspended) return "Account suspended";
  if (account.email !== recipient) return "Account email changed";
  if (!account.termsAcceptedAt || !account.privacyAcceptedAt) return "Signup consent absent";
  if (alreadySent) return "Welcome already sent";
  return null;
}

/**
 * The signup author calls this in its account-creation transaction. The account
 * row serializes repeat callers; no second outbox, scheduler, or schema is needed.
 */
export async function enqueueSignupWelcome(tx: Tx, accountId: string): Promise<number> {
  const [account] = await tx.select().from(users).where(eq(users.id, accountId)).for("update");
  if (!account?.email) throw new Error("Welcome requires an existing account with an email");
  const [existing] = await tx.select({ id: emailOutbox.id }).from(emailOutbox)
    .where(sql`${emailOutbox.emailType} = ${SIGNUP_WELCOME_EMAIL_TYPE}
      AND ${emailOutbox.metadata}->>'signupAccountId' = ${accountId}`).limit(1);
  if (existing) return existing.id;

  const payload = buildWelcomeEmailPayload({ toEmail: account.email, firstName: account.firstName });
  return dispatchMessagingEvent(
    "messaging.auth-welcome-email", "auth.welcome_email", { accountId }, {},
    () => dispatchMessagingEvent(
      "messaging.email-outbox-enqueue", "email.enqueue",
      { emailType: SIGNUP_WELCOME_EMAIL_TYPE }, {},
      async () => {
        const [row] = await tx.insert(emailOutbox).values({
          emailType: SIGNUP_WELCOME_EMAIL_TYPE,
          toEmail: account.email!,
          subject: payload.subject,
          html: payload.html,
          textBody: payload.text,
          status: "pending",
          maxAttempts: 6,
          metadata: { signupAccountId: accountId, signupWelcomeVersion: 1 },
        }).returning({ id: emailOutbox.id });
        if (!row) throw new Error("Welcome outbox insertion failed");
        return row.id;
      },
    ),
  );
}

/** Existing SSO callers also enqueue, retaining their public Promise<void> contract. */
export async function enqueueWelcomeForEmail(email: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [account] = await tx.select({ id: users.id }).from(users)
      .where(eq(users.email, email.toLowerCase())).limit(1);
    if (!account) throw new Error("Welcome requires an existing account");
    await enqueueSignupWelcome(tx, account.id);
  });
}

/**
 * Called only by the EXISTING outbox dispatcher, including immediate delivery,
 * scheduled drain and admin retry. Hold both rows through transport and result
 * persistence: duplicate senders and account edits cannot bypass eligibility.
 */
export async function deliverSignupWelcome(
  outboxId: number,
  send: (payload: SendEmailParams) => Promise<SendEmailResult>,
  nextRetryAfter: (attempt: number) => Date,
): Promise<void> {
  // Read outside the transaction: a cached settings read, never a lock holder.
  const windowDays = await getWelcomeVerificationWindowDays();
  const retryMinutes = welcomeVerificationRetryMinutes();
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId)).for("update");
    if (!row || row.status !== "processing" || row.emailType !== SIGNUP_WELCOME_EMAIL_TYPE) return;
    const metadata = row.metadata as { signupAccountId?: string; signupWelcomeVersion?: number } | null;
    const accountId = metadata?.signupAccountId;
    const [account] = accountId
      ? await tx.select().from(users).where(eq(users.id, accountId)).for("update")
      : [];
    const [sent] = accountId
      ? await tx.select({ id: emailOutbox.id }).from(emailOutbox)
        .where(sql`${emailOutbox.emailType} = ${SIGNUP_WELCOME_EMAIL_TYPE}
          AND ${emailOutbox.metadata}->>'signupAccountId' = ${accountId}
          AND ${emailOutbox.status} = 'sent' AND ${emailOutbox.id} <> ${outboxId}`).limit(1)
      : [];
    const reason = metadata?.signupWelcomeVersion !== 1
      ? "Invalid welcome metadata"
      : welcomeSuppressionReason(account, row.toEmail, Boolean(sent));
    if (reason) {
      await tx.update(emailOutbox).set({
        status: "cancelled", lastError: reason, retryAfter: null, updatedAt: new Date(),
      }).where(and(eq(emailOutbox.id, outboxId), eq(emailOutbox.status, "processing")));
      return;
    }

    // AUTH-1 Finding A: no welcome reaches the provider before the address is verified. The account row
    // is locked above, so a verification committing now is either seen here or waits for this to finish.
    // A held row goes back to `pending` with no attempt counted and nothing sent; once the window has
    // passed since the welcome was enqueued, it is cancelled instead. Times are the database's.
    if (!account!.emailVerified) {
      const ageCheck = await tx.execute(sql`
        SELECT (${row.createdAt} <= NOW() - make_interval(days => ${windowDays})) AS expired`);
      const expired = (ageCheck.rows?.[0] as { expired?: boolean } | undefined)?.expired === true;
      await tx.update(emailOutbox).set(expired ? {
        status: "cancelled", lastError: WELCOME_NEVER_VERIFIED, retryAfter: null, updatedAt: new Date(),
      } : {
        status: "pending", lastError: WELCOME_AWAITING_VERIFICATION,
        retryAfter: sql`NOW() + make_interval(secs => ${retryMinutes * 60})`, updatedAt: new Date(),
      }).where(and(eq(emailOutbox.id, outboxId), eq(emailOutbox.status, "processing")));
      return;
    }

    let result: SendEmailResult;
    try {
      result = await send({
        to: row.toEmail, subject: row.subject, html: row.html,
        ...(row.textBody ? { text: row.textBody } : {}),
        ...(row.replyTo ? { replyTo: row.replyTo } : {}),
        idempotencyKey: `signup-welcome-${accountId}`,
        emailType: row.emailType,
      });
      if (result.ok && !result.id) result = { ok: false, error: "Provider returned no message id" };
    } catch {
      // Never persist transport exception strings containing keys/recipient addresses.
      result = { ok: false, error: "Welcome provider transport failed" };
    }
    if (result.suppressed === "template_not_allowed") {
      await tx.update(emailOutbox).set({
        status: "held",
        lastError: "EMAIL_TEMPLATE_ALLOWLIST",
        retryAfter: null,
        updatedAt: new Date(),
      }).where(and(eq(emailOutbox.id, outboxId), eq(emailOutbox.status, "processing")));
      return;
    }
    if (result.suppressed === "development_gate" || result.suppressed === "kill_switch") {
      const now = new Date();
      await tx.update(emailOutbox).set(result.suppressed === "development_gate" ? {
        status: "cancelled",
        lastError: result.error ?? "No approved development inbox",
        retryAfter: null,
        updatedAt: now,
      } : {
        status: "pending",
        lastError: result.error ?? "Email notifications are disabled by platform settings",
        retryAfter: nextRetryAfter(1),
        updatedAt: now,
      }).where(and(eq(emailOutbox.id, outboxId), eq(emailOutbox.status, "processing")));
      return;
    }
    const attempt = row.attemptCount + 1;
    const now = new Date();
    const dead = attempt >= row.maxAttempts;
    await tx.update(emailOutbox).set(result.ok ? {
      status: "sent", resendId: result.id, attemptCount: attempt,
      sentAt: now, lastError: null, retryAfter: null, updatedAt: now,
    } : {
      status: dead ? "dead" : "failed", attemptCount: attempt,
      lastError: "Welcome provider delivery attempt failed",
      retryAfter: dead ? null : nextRetryAfter(attempt), updatedAt: now,
    }).where(and(eq(emailOutbox.id, outboxId), eq(emailOutbox.status, "processing")));
  });
}
