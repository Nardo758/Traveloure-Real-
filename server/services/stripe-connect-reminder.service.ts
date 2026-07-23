/**
 * Stripe Connect Reminder Scheduler
 *
 * Runs every 3 days. Sends an in-app notification to approved providers
 * (role = service_provider or local_expert) who have not yet completed
 * Stripe Connect onboarding (stripeAccountStatus is null or not 'complete').
 *
 * Throttle: one reminder per user per 3-day window — checked against the
 * notifications table so the cadence survives server restarts.
 */

import { db } from "../db";
import { users, notifications } from "@shared/schema";
import { eq, and, sql, or, isNull, gte, inArray } from "drizzle-orm";

const CHECK_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours
const REMINDER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours
const REMINDER_TYPE = "stripe_connect_reminder";

class StripeConnectReminderService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;

    // First run 10 minutes after startup
    setTimeout(() => this.runReminders(), 10 * 60 * 1000);

    this.timer = setInterval(() => this.runReminders(), CHECK_INTERVAL_MS);
    console.log("[StripeConnectReminder] Scheduler started — runs every 72 hours");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runReminders(): Promise<void> {
    try {
      // Find approved providers/experts without a complete Stripe Connect account
      const pendingUsers = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(
          and(
            or(
              eq(users.role, "service_provider"),
              eq(users.role, "local_expert")
            ),
            or(
              isNull(users.stripeAccountId),
              sql`(${users.stripeAccountStatus} is null or ${users.stripeAccountStatus} not in ('complete', 'active'))`
            )
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
