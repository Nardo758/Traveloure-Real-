/**
 * Admin Digest Scheduler
 *
 * Runs every 24 hours. Sends one email to the platform admin when any of
 * the following conditions are detected:
 *   a) Unread admin_notifications (dead-end leads not yet resolved)
 *   b) Active experts who have not completed Stripe Connect onboarding
 *   c) Stripe events visible in the API that never arrived at the webhook endpoint
 *      (gap detection: compares Stripe's last-100 events against webhook_events table)
 *
 * Recipients: ADMIN_EMAIL env var (falls back to no-op if unset).
 * Email: sent via Resend through email.service.ts.
 */

import Stripe from "stripe";
import { db } from "../db";
import { adminNotifications, users, webhookEvents } from "@shared/schema";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
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

      // ── A: Unread lead-routing alerts ───────────────────────────────────────
      const unresolvedNotifications = await db
        .select({ id: adminNotifications.id, message: adminNotifications.message, destination: adminNotifications.destination })
        .from(adminNotifications)
        .where(eq(adminNotifications.isRead, false))
        .limit(20);

      // ── B: Experts without completed Stripe Connect ─────────────────────────
      const expertsWithoutPayout = await db
        .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(
          and(
            eq(users.role, "local_expert"),
            sql`(${users.stripeAccountId} is null or ${users.stripeAccountStatus} <> 'complete')`
          )
        )
        .limit(50);

      // ── C: Stripe webhook gap check ─────────────────────────────────────────
      // Fetch the last 100 events from Stripe API and compare against the
      // webhook_events table. Any event Stripe knows about but we don't have
      // locally is a potential missed delivery that needs ops attention.
      const missedWebhooks: { stripeEventId: string; eventType: string; stripeCreatedAt: number }[] = [];

      if (process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: "2024-12-18.acacia" as any,
          });

          // Pull last 100 Stripe events from the last 24 hours
          const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
          const stripeEvents = await stripe.events.list({
            limit: 100,
            created: { gte: oneDayAgo },
          });

          if (stripeEvents.data.length > 0) {
            const stripeEventIds = stripeEvents.data.map(e => e.id);

            // Find which of those IDs exist in our local webhook_events table
            const localRows = await db
              .select({ stripeEventId: webhookEvents.stripeEventId })
              .from(webhookEvents)
              .where(inArray(webhookEvents.stripeEventId, stripeEventIds));

            const localSet = new Set(localRows.map(r => r.stripeEventId));

            for (const evt of stripeEvents.data) {
              if (!localSet.has(evt.id)) {
                missedWebhooks.push({
                  stripeEventId: evt.id,
                  eventType: evt.type,
                  stripeCreatedAt: evt.created,
                });
              }
            }
          }

          if (missedWebhooks.length > 0) {
            console.log(`[AdminDigest] Stripe gap check: ${missedWebhooks.length} event(s) in Stripe API not found in local webhook_events`);
          } else {
            console.log("[AdminDigest] Stripe gap check: all recent Stripe events accounted for");
          }
        } catch (stripeErr: any) {
          // Non-fatal: Stripe API may be unavailable; log and continue
          console.error("[AdminDigest] Stripe gap check failed:", stripeErr.message);
        }
      } else {
        console.log("[AdminDigest] STRIPE_SECRET_KEY not set — skipping Stripe gap check");
      }

      // ── Send digest if anything needs attention ─────────────────────────────
      if (
        unresolvedNotifications.length === 0 &&
        expertsWithoutPayout.length === 0 &&
        missedWebhooks.length === 0
      ) {
        console.log("[AdminDigest] Nothing to report — skipping email");
        return;
      }

      await sendAdminDigestEmail({
        toEmail: adminEmail,
        unresolvedNotifications,
        expertsWithoutPayout,
        missedWebhooks,
      });

      console.log(
        `[AdminDigest] Digest sent — ${unresolvedNotifications.length} unresolved alerts, ${expertsWithoutPayout.length} experts without payout, ${missedWebhooks.length} missed webhooks`
      );
    } catch (err) {
      console.error("[AdminDigest] Failed to run digest:", err);
    }
  }
}

export const adminDigestScheduler = new AdminDigestSchedulerService();
