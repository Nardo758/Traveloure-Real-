/**
 * Admin Digest Scheduler
 *
 * Runs every 24 hours. Sends one email to the platform admin when either:
 *   a) There are unread admin_notifications (dead-end leads not yet resolved), or
 *   b) There are active experts who have not completed Stripe Connect onboarding.
 *
 * Recipients: ADMIN_EMAIL env var (falls back to no-op if unset).
 * Email: sent via Resend through email.service.ts.
 */

import { db } from "../db";
import { adminNotifications, users } from "@shared/schema";
import { eq, and, isNull, or, ne } from "drizzle-orm";
import { sendAdminDigestEmail } from "./email.service";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // every 24 hours

class AdminDigestSchedulerService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;

    // First run 5 minutes after startup so the server is fully warmed up
    setTimeout(() => this.runDigest(), 5 * 60 * 1000);

    this.timer = setInterval(() => this.runDigest(), CHECK_INTERVAL_MS);
    console.log("[AdminDigest] Scheduler started — digest runs every 24 hours");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runDigest(): Promise<void> {
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (!adminEmail) {
        console.log("[AdminDigest] ADMIN_EMAIL not set — skipping digest");
        return;
      }

      // Unread lead-routing alerts
      const unresolvedNotifications = await db
        .select({ id: adminNotifications.id, message: adminNotifications.message, destination: adminNotifications.destination })
        .from(adminNotifications)
        .where(eq(adminNotifications.isRead, false))
        .limit(20);

      // Experts without completed Stripe Connect
      const expertsWithoutPayout = await db
        .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(
          and(
            eq(users.role, "local_expert"),
            or(
              isNull(users.stripeAccountId),
              ne(users.stripeAccountStatus, "complete")
            )
          )
        )
        .limit(50);

      if (unresolvedNotifications.length === 0 && expertsWithoutPayout.length === 0) {
        console.log("[AdminDigest] Nothing to report — skipping email");
        return;
      }

      await sendAdminDigestEmail({
        toEmail: adminEmail,
        unresolvedNotifications,
        expertsWithoutPayout,
      });

      console.log(
        `[AdminDigest] Digest sent — ${unresolvedNotifications.length} unresolved alerts, ${expertsWithoutPayout.length} experts without payout`
      );
    } catch (err) {
      console.error("[AdminDigest] Failed to run digest:", err);
    }
  }
}

export const adminDigestScheduler = new AdminDigestSchedulerService();
