/**
 * Stripe Connect Reminder Scheduler
 *
 * Runs every 3 days. Sends an in-app notification to approved providers
 * (role = service_provider or local_expert) who have not yet completed
 * Stripe Connect onboarding (stripeAccountStatus is null or not 'complete').
 *
 * Throttle: one reminder per user per 3-day window — checked against the
 * notifications table so the cadence survives server restarts.
 *
 * Restart-safety: on startup the scheduler queries the most recent
 * stripe_connect_reminder notification to determine how long ago the last
 * batch ran. The first run is delayed by (CHECK_INTERVAL_MS - elapsed) so a
 * rapid restart loop cannot fire a duplicate batch before the cooldown expires.
 */

import { db } from "../db";
import { users, notifications } from "@shared/schema";
import { eq, and, sql, or, isNull, gte, inArray, desc } from "drizzle-orm";

const CHECK_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours
const REMINDER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours
const REMINDER_TYPE = "stripe_connect_reminder";

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
        .where(eq(notifications.type, REMINDER_TYPE))
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

      setTimeout(() => {
        this.runReminders();
        this.timer = setInterval(() => this.runReminders(), CHECK_INTERVAL_MS);
      }, initialDelayMs);
    } catch (err) {
      // If the DB query fails, fall back to the safe default (full interval delay)
      console.error("[StripeConnectReminder] Failed to determine last run time — defaulting to 72h delay:", err);
      setTimeout(() => {
        this.runReminders();
        this.timer = setInterval(() => this.runReminders(), CHECK_INTERVAL_MS);
      }, CHECK_INTERVAL_MS);
    }
  }

  private async runReminders(): Promise<void> {
    try {
      // Find approved providers/experts without a complete Stripe Connect account
      // stripe_account_id / stripe_account_status live on the users table in the DB
      // but are not yet reflected in the Drizzle TypeScript model — use raw SQL fragments.
      const pendingUsers = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(
          and(
            or(
              eq(users.role, "service_provider"),
              eq(users.role, "travel_expert")
            ),
            sql`("users"."stripe_account_id" is null or "users"."stripe_account_status" is null or "users"."stripe_account_status" not in ('complete', 'active'))`
          )
        );

      if (pendingUsers.length === 0) {
        console.log("[StripeConnectReminder] No users pending Stripe Connect setup");
        return;
      }

      const userIds = pendingUsers.map(u => u.id);

      // Find users who already received a reminder in the cooldown window
      const cooldownCutoff = new Date(Date.now() - REMINDER_COOLDOWN_MS);
      const recentlyNotified = await db
        .select({ userId: notifications.userId })
        .from(notifications)
        .where(
          and(
            inArray(notifications.userId, userIds),
            eq(notifications.type, REMINDER_TYPE),
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
        type: REMINDER_TYPE,
        title: "Set up payouts to get paid",
        message:
          "You have been approved but haven't connected your Stripe account yet. Complete Stripe Connect setup so you can receive payouts for your bookings.",
        data: { link: u.role === "local_expert" ? "/expert/earnings" : "/provider/earnings" } as Record<string, unknown>,
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

export const stripeConnectReminderScheduler = new StripeConnectReminderService();
