/**
 * Stripe Connect Reminder Scheduler
 *
 * Runs every 72 hours. Sends an in-app notification to providers and experts who
 * have not finished Stripe Connect. Providers are read from the users Connect
 * columns. Experts are read from local_expert_forms.stripe_connect_status, and an
 * expert whose only open step is Identity is skipped. The Money link follows the
 * expert-family role set, not a single role string.
 *
 * Throttle: one reminder per user per 72 hours — the same constant the manual
 * admin routes use — checked against the notifications table so the cadence
 * survives server restarts. Notification rows only; this service does not send email.
 *
 * Restart-safety: on startup the scheduler queries the most recent
 * stripe_connect_reminder notification to determine how long ago the last
 * batch ran. The first run is delayed by (CHECK_INTERVAL_MS - elapsed) so a
 * rapid restart loop cannot fire a duplicate batch before the cooldown expires.
 */

import { db } from "../db";
import { users, notifications, localExpertForms } from "@shared/schema";
import { EXPERT_ROLES } from "@shared/roles";
import { eq, and, sql, or, gte, inArray, desc } from "drizzle-orm";
import { jitteredStartupDelay } from "./startup-delay";
import { runPaymentSchedule } from "../automations/payments/runtime";
import { recordAdminDecisionAudit } from "./admin-decision-audit";
import { isRoutableExpert } from "./expert-routability";
import {
  STRIPE_CONNECT_REMINDER_COOLDOWN_MS,
  STRIPE_CONNECT_REMINDER_TYPE,
  STRIPE_CONNECT_REMINDER_AUDIT_ACTION,
  MANUAL_STRIPE_REMINDER_TITLE,
  MANUAL_STRIPE_REMINDER_MESSAGE,
  SCHEDULED_STRIPE_REMINDER_TITLE,
  SCHEDULED_STRIPE_REMINDER_MESSAGE,
  candidateNeedsStripeConnectReminder,
  providerNeedsStripeConnectReminder,
  stripeConnectReminderLink,
  reminderCooldownCutoff,
} from "./stripe-connect-reminder-policy";

const CHECK_INTERVAL_MS = STRIPE_CONNECT_REMINDER_COOLDOWN_MS;

class StripeConnectReminderService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    this.scheduleFirstRun();
    console.log("[StripeConnectReminder] Scheduler started — runs every 72 hours");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Determine how long ago the last reminder batch ran by checking the most
   * recent stripe_connect_reminder notification. If a batch ran within the
   * last CHECK_INTERVAL_MS, delay the first run until the interval has fully
   * elapsed. This prevents duplicate sends during rapid restart loops.
   */
  private async scheduleFirstRun(): Promise<void> {
    try {
      const [lastNotification] = await db
        .select({ createdAt: notifications.createdAt })
        .from(notifications)
        .where(eq(notifications.type, STRIPE_CONNECT_REMINDER_TYPE))
        .orderBy(desc(notifications.createdAt))
        .limit(1);

      let initialDelayMs: number;

      if (lastNotification?.createdAt) {
        const elapsedMs = Date.now() - new Date(lastNotification.createdAt).getTime();
        const remainingMs = CHECK_INTERVAL_MS - elapsedMs;

        if (remainingMs > 0) {
          // Last run was within the interval — wait out the remainder
          initialDelayMs = remainingMs;
          console.log(
            `[StripeConnectReminder] Last run was ${Math.round(elapsedMs / 3600000)}h ago — ` +
            `delaying first run by ${Math.round(remainingMs / 3600000)}h to avoid duplicates`
          );
        } else {
          // Interval has already elapsed — run soon after startup
          initialDelayMs = 10 * 60 * 1000;
          console.log("[StripeConnectReminder] Interval elapsed — first run in 10 minutes");
        }
      } else {
        // No prior reminders found — run soon after startup
        initialDelayMs = 10 * 60 * 1000;
        console.log("[StripeConnectReminder] No prior reminders found — first run in 10 minutes");
      }

      // Boot-herd fix (#1712): floor+jitter so the first pass never lands in the boot window.
      setTimeout(() => {
        void this.runRemindersGuarded();
        this.timer = setInterval(() => void this.runRemindersGuarded(), CHECK_INTERVAL_MS);
      }, jitteredStartupDelay(initialDelayMs));
    } catch (err) {
      // If the DB query fails, fall back to the safe default (full interval delay)
      console.error("[StripeConnectReminder] Failed to determine last run time — defaulting to 72h delay:", err);
      setTimeout(() => {
        void this.runRemindersGuarded();
        this.timer = setInterval(() => void this.runRemindersGuarded(), CHECK_INTERVAL_MS);
      }, jitteredStartupDelay(CHECK_INTERVAL_MS));
    }
  }

  /**
   * Route the reminder pass through runBackgroundJob so it counts against the pool-protection
   * concurrency cap and overlap-dedups (previously it called the DB directly, bypassing the cap).
   */
  private async runRemindersGuarded(): Promise<void> {
    await runPaymentSchedule(
      "payments.stripe-connect-reminder",
      "stripe-connect-reminder",
      () => this.runReminders(),
      { runnerName: "stripe-connect-reminder" },
    );
  }

  private async runReminders(): Promise<void> {
    try {
      const pendingUsers = await stripeConnectReminderCandidates();

      if (pendingUsers.length === 0) {
        console.log("[StripeConnectReminder] No users pending Stripe Connect setup");
        return;
      }

      const userIds = pendingUsers.map(u => u.id);

      // Find users who already received a reminder in the cooldown window.
      const cooldownCutoff = reminderCooldownCutoff();
      const recentlyNotified = await db
        .select({ userId: notifications.userId })
        .from(notifications)
        .where(
          and(
            inArray(notifications.userId, userIds),
            eq(notifications.type, STRIPE_CONNECT_REMINDER_TYPE),
            gte(notifications.createdAt, cooldownCutoff)
          )
        );

      const recentlyNotifiedSet = new Set(recentlyNotified.map(r => r.userId));

      const toNotify = pendingUsers.filter(u => !recentlyNotifiedSet.has(u.id));

      if (toNotify.length === 0) {
        console.log("[StripeConnectReminder] All pending users notified recently — skipping");
        return;
      }

      const notificationRows = toNotify.map(u => ({
        userId: u.id,
        type: STRIPE_CONNECT_REMINDER_TYPE,
        title: SCHEDULED_STRIPE_REMINDER_TITLE,
        message: SCHEDULED_STRIPE_REMINDER_MESSAGE,
        // C8/C9: the Earnings module is renamed Money on BOTH consoles (§17).
        data: { link: stripeConnectReminderLink(u.role) } as Record<string, unknown>,
      }));

      await db.insert(notifications).values(notificationRows);

      console.log(
        `[StripeConnectReminder] Sent ${notificationRows.length} reminder(s) to users pending Stripe Connect`
      );
    } catch (err) {
      console.error("[StripeConnectReminder] Failed to run reminders:", err);
    }
  }
}

export type StripeConnectReminderCandidate = {
  id: string;
  role: string | null;
  stripeAccountId: string | null;
  stripeAccountStatus: string | null;
  formStripeConnectStatus: string | null;
  identityVerificationStatus: string | null;
};

/**
 * Earners the scheduler may remind. Providers use the users Connect columns.
 * Experts use the expert-form Connect column and skip an Identity-only gap.
 * One row per user.
 */
export async function stripeConnectReminderCandidates(): Promise<StripeConnectReminderCandidate[]> {
  const providerOpen = sql`(${users.stripeAccountId} is null or ${users.stripeAccountStatus} is null or ${users.stripeAccountStatus} not in ('complete', 'active'))`;
  const expertConnectOpen = sql`(${localExpertForms.stripeConnectStatus} is null or ${localExpertForms.stripeConnectStatus} not in ('complete', 'active'))`;
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      stripeAccountId: users.stripeAccountId,
      stripeAccountStatus: users.stripeAccountStatus,
      formStripeConnectStatus: localExpertForms.stripeConnectStatus,
      identityVerificationStatus: localExpertForms.identityVerificationStatus,
    })
    .from(users)
    .leftJoin(localExpertForms, eq(localExpertForms.userId, users.id))
    .where(
      or(
        and(eq(users.role, "service_provider"), providerOpen),
        and(inArray(users.role, [...EXPERT_ROLES]), expertConnectOpen),
      ),
    );

  const seen = new Set<string>();
  const candidates: StripeConnectReminderCandidate[] = [];
  for (const row of rows) {
    const candidate: StripeConnectReminderCandidate = {
      id: row.id,
      role: row.role ?? null,
      stripeAccountId: row.stripeAccountId ?? null,
      stripeAccountStatus: row.stripeAccountStatus ?? null,
      formStripeConnectStatus: row.formStripeConnectStatus ?? null,
      identityVerificationStatus: row.identityVerificationStatus ?? null,
    };
    if (!candidateNeedsStripeConnectReminder(candidate)) continue;
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    candidates.push(candidate);
  }
  return candidates;
}

export async function reminderCooldownActive(userId: string, now = Date.now()): Promise<boolean> {
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, STRIPE_CONNECT_REMINDER_TYPE),
        gte(notifications.createdAt, reminderCooldownCutoff(now)),
      ),
    )
    .limit(1);
  return !!row;
}

export type AdminRemindResult =
  | { ok: true; auditWarning?: string }
  | { ok: false; reason: "cooldown" | "already_set_up"; status: 429 | 409; message: string };

const REMINDER_COOLDOWN_MESSAGE = "A Stripe Connect reminder was already sent to this account within the last 72 hours.";
const EXPERT_ALREADY_ROUTABLE_MESSAGE = "This expert is already routable.";
const PROVIDER_ALREADY_SET_UP_MESSAGE = "This provider is already set up for payouts.";

/**
 * True when `isRoutableExpert` accepts any application on this account.
 * The comparisons stay in that function.
 */
async function expertIsAlreadyRoutable(userId: string): Promise<boolean> {
  const [account] = await db
    .select({ email: users.email, isTest: users.isTest })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const forms = await db
    .select({
      applicationStatus: localExpertForms.status,
      identityVerificationStatus: localExpertForms.identityVerificationStatus,
      stripeConnectStatus: localExpertForms.stripeConnectStatus,
    })
    .from(localExpertForms)
    .where(eq(localExpertForms.userId, userId));
  return forms.some((form) => isRoutableExpert({
    applicationStatus: form.applicationStatus,
    identityVerificationStatus: form.identityVerificationStatus,
    stripeConnectStatus: form.stripeConnectStatus,
    email: account?.email,
    isTest: account?.isTest,
  }));
}

/**
 * Providers have no routability predicate. Fully set up means
 * `providerNeedsStripeConnectReminder` is false for the users Connect columns.
 */
async function providerIsAlreadySetUp(userId: string): Promise<boolean> {
  const [account] = await db
    .select({
      stripeAccountId: users.stripeAccountId,
      stripeAccountStatus: users.stripeAccountStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return !providerNeedsStripeConnectReminder({
    stripeAccountId: account?.stripeAccountId,
    stripeAccountStatus: account?.stripeAccountStatus,
  });
}

/**
 * Manual admin reminder. Inserts one notification row, then one audit row.
 * A routable expert, a provider who is already set up, or a cooldown refusal
 * writes neither. Does not send email.
 */
export async function adminRemindStripeConnect(input: {
  actorId: string;
  actorRole: string;
  targetUserId: string;
  targetRole: string | null;
  earnerKind: "expert" | "provider";
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<AdminRemindResult> {
  const alreadySetUp = input.earnerKind === "expert"
    ? await expertIsAlreadyRoutable(input.targetUserId)
    : await providerIsAlreadySetUp(input.targetUserId);
  if (alreadySetUp) {
    return {
      ok: false,
      reason: "already_set_up",
      status: 409,
      message: input.earnerKind === "expert" ? EXPERT_ALREADY_ROUTABLE_MESSAGE : PROVIDER_ALREADY_SET_UP_MESSAGE,
    };
  }
  if (await reminderCooldownActive(input.targetUserId)) {
    return { ok: false, reason: "cooldown", status: 429, message: REMINDER_COOLDOWN_MESSAGE };
  }
  await db.insert(notifications).values({
    userId: input.targetUserId,
    type: STRIPE_CONNECT_REMINDER_TYPE,
    title: MANUAL_STRIPE_REMINDER_TITLE,
    message: MANUAL_STRIPE_REMINDER_MESSAGE,
    data: { link: stripeConnectReminderLink(input.targetRole) },
  });
  const auditWarning = await recordAdminDecisionAudit({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: STRIPE_CONNECT_REMINDER_AUDIT_ACTION,
    resourceType: "user",
    resourceId: input.targetUserId,
    targetUserId: input.targetUserId,
    beforeStatus: null,
    afterStatus: "reminded",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: { earnerKind: input.earnerKind, emailSent: false },
  });
  return auditWarning ? { ok: true, auditWarning } : { ok: true };
}

export const stripeConnectReminderScheduler = new StripeConnectReminderService();
