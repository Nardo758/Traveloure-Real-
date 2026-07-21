/**
 * Webhook handlers for third-party verification services.
 * Mounted at /api/webhooks in routes.ts.
 *
 * IMPORTANT: These routes receive raw request bodies because the server's
 * express.json() middleware captures req.rawBody via its `verify` callback.
 * Stripe webhook signature verification MUST use req.rawBody (Buffer), NOT req.body.
 */

import { Router } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { storage } from "../storage";
import { revenueTrackingService } from "../services/revenue-tracking.service";
import { stripePaymentService } from "../services/stripe-payment.service";
import { db } from "../db";
import { localExpertForms, serviceBookings, webhookEvents, bookings, adminNotifications, expertRequests } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia" as any,
});

// POST /api/webhooks/stripe-identity
// Uses req.rawBody (Buffer) captured by the server's JSON verify callback for signature verification.
router.post("/stripe-identity", async (req: any, res) => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const webhookSecret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
  let event: any;

  if (webhookSecret) {
    if (!sig) {
      return res.status(400).json({ message: "Missing Stripe-Signature header" });
    }
    if (!req.rawBody) {
      return res.status(500).json({ message: "Raw body unavailable for signature verification" });
    }
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("Stripe Identity signature verification failed:", err.message);
      return res.status(400).json({ message: `Webhook signature error: ${err.message}` });
    }
  } else {
    // Dev/test mode: no secret configured — only allow in non-production environments
    if (process.env.NODE_ENV === "production") {
      return res.status(400).json({ message: "STRIPE_IDENTITY_WEBHOOK_SECRET must be set in production" });
    }
    try {
      event = typeof req.body === "object" ? req.body : JSON.parse(req.rawBody?.toString() ?? "{}");
    } catch (err: any) {
      return res.status(400).json({ message: "Invalid JSON body" });
    }
  }

  const session = event.data?.object;
  const userId: string | undefined = session?.metadata?.user_id;
  const formType: string | undefined = session?.metadata?.form_type;

  if (!userId) return res.json({ received: true });

  try {
    if (event.type === "identity.verification_session.verified") {
      const ft = formType === "expert" ? "expert" : "provider";
      await storage.updateFormIdentityVerification(ft, userId, "verified", new Date());
    } else if (event.type === "identity.verification_session.requires_input") {
      const ft = formType === "expert" ? "expert" : "provider";
      await storage.updateFormIdentityVerification(ft, userId, "failed");
    }
  } catch (err) {
    console.error("Stripe Identity webhook DB update error:", err);
  }

  res.json({ received: true });
});

// POST /api/webhooks/persona
// Verifies Persona HMAC signature when PERSONA_WEBHOOK_SECRET is configured.
router.post("/persona", async (req: any, res) => {
  const personaSecret = process.env.PERSONA_WEBHOOK_SECRET;

  if (personaSecret) {
    const personaSig = req.headers["persona-signature"] as string | undefined;
    if (!personaSig) {
      return res.status(400).json({ message: "Missing Persona-Signature header" });
    }
    // Persona uses t=<timestamp>,v1=<hmac> format
    const parts: Record<string, string> = {};
    personaSig.split(",").forEach(part => {
      const [k, v] = part.split("=", 2);
      parts[k] = v;
    });
    const timestamp = parts["t"];
    const signature = parts["v1"];
    if (!timestamp || !signature) {
      return res.status(400).json({ message: "Malformed Persona-Signature header" });
    }
    // Rebuild signed payload: timestamp + "." + raw body
    const rawPayload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
    const expected = crypto
      .createHmac("sha256", personaSecret)
      .update(`${timestamp}.${rawPayload}`)
      .digest("hex");
    if (expected !== signature) {
      console.error("Persona webhook signature mismatch");
      return res.status(400).json({ message: "Invalid Persona webhook signature" });
    }
  } else if (process.env.NODE_ENV === "production") {
    // In production, PERSONA_WEBHOOK_SECRET must be set
    return res.status(400).json({ message: "PERSONA_WEBHOOK_SECRET must be set in production" });
  }

  try {
    const event = req.body;
    const inquiryId: string | undefined = event.data?.id;
    const status: string | undefined = event.data?.attributes?.status;

    if (!inquiryId) return res.json({ received: true });

    const newStatus =
      status === "approved" ? "verified" :
      status === "declined" ? "failed" :
      "submitted";

    await storage.updateProviderBusinessVerificationByInquiry(inquiryId, newStatus);
  } catch (err) {
    console.error("Persona webhook processing error:", err);
  }

  res.json({ received: true });
});

// ─── Core Stripe event processor ────────────────────────────────────────────
// Runs AFTER res.json({ received: true }) so Stripe never times out waiting.
//
// Responsibilities:
//   1. Deduplication  — check webhook_events for already-processed event IDs
//   2. Event logging  — INSERT into webhook_events before any business logic
//   3. Business logic — switch on event.type (account, transfer, payment)
//   4. Mark complete  — UPDATE webhook_events.processed=true or record error
//
// Any unhandled error is surfaced via the error column on webhook_events and
// will appear in GET /api/admin/webhooks/unprocessed for manual review.
async function processStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  // ── 1. Deduplication ──────────────────────────────────────────────────────
  // Stripe guarantees at-least-once delivery; the same event ID can arrive twice.
  const existing = await db
    .select({ processed: webhookEvents.processed })
    .from(webhookEvents)
    .where(eq(webhookEvents.stripeEventId, event.id))
    .limit(1);

  if (existing.length > 0 && existing[0].processed) {
    console.info(`[WEBHOOK] Duplicate event ${event.id} (${event.type}) already processed — skipping`);
    return;
  }

  // ── 2. Event log insert ───────────────────────────────────────────────────
  // ON CONFLICT DO NOTHING handles any concurrent delivery of the same event.
  await db.execute(sql`
    INSERT INTO webhook_events (stripe_event_id, event_type, processed, raw_payload)
    VALUES (
      ${event.id},
      ${event.type},
      FALSE,
      ${JSON.stringify(event)}::jsonb
    )
    ON CONFLICT (stripe_event_id) DO NOTHING
  `);

  let processingError: string | null = null;

  try {
    // ── 3. Business logic ─────────────────────────────────────────────────
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const userId = account.metadata?.userId;

        // ── Restriction detection ─────────────────────────────────────────────
        // Stripe sets requirements.disabled_reason when it restricts or suspends
        // an account (compliance violation, dispute, etc.). This can happen AFTER
        // an expert is already approved and receiving leads, so we must detect it
        // at webhook time and alert admins immediately — not just at onboarding.
        const disabledReason = account.requirements?.disabled_reason;
        const isRestricted =
          disabledReason !== null && disabledReason !== undefined && disabledReason !== "";

        // Canonical stripeConnectStatus for this event
        const newStripeConnectStatus = isRestricted
          ? "restricted"
          : account.details_submitted && account.charges_enabled && account.payouts_enabled
          ? "complete"
          : account.details_submitted
          ? "pending"
          : "not_started";

        // ── Path A: Update via metadata.userId (normal onboarding flow) ───────
        if (userId) {
          const userStatus =
            !isRestricted && account.details_submitted && account.charges_enabled && account.payouts_enabled
              ? "active"
              : account.details_submitted
              ? "under_review"
              : "onboarding_incomplete";

          await storage.updateUserStripeAccount(userId, account.id, userStatus);

          await db
            .update(localExpertForms)
            .set({ stripeConnectStatus: newStripeConnectStatus } as any)
            .where(eq(localExpertForms.userId, userId));
        }

        // ── Path B: Restriction alert via stripeAccountId lookup ─────────────
        // Stripe compliance events often lack metadata.userId. We resolve the
        // expert by matching account.id against local_expert_forms.stripe_account_id.
        // Fire an admin notification if an already-approved expert gets restricted.
        const expertByAccount = await db
          .select()
          .from(localExpertForms)
          .where(eq(localExpertForms.stripeAccountId, account.id))
          .limit(1);

        if (expertByAccount.length > 0) {
          const expert = expertByAccount[0];

          // Sync status (only if Path A didn't already write the same row)
          if (!userId || expert.userId !== userId) {
            await db
              .update(localExpertForms)
              .set({ stripeConnectStatus: newStripeConnectStatus } as any)
              .where(eq(localExpertForms.id, expert.id));
          }

          // Alert admin when an approved expert's account becomes restricted.
          // The expert may still appear in lead routing and be receiving leads
          // but will be unable to receive payouts — admin must act immediately.
          if (newStripeConnectStatus === "restricted" && expert.status === "approved") {
            await db.insert(adminNotifications).values({
              type: "expert_stripe_restricted",
              message:
                `Expert ${expert.id} Stripe account restricted: ` +
                `${disabledReason ?? "unknown reason"}`,
              reason: "stripe_account_restricted",
            } as any);

            console.error(
              `[STRIPE RESTRICTION] Expert ${expert.id} ` +
              `(${expert.firstName ?? ""} ${expert.lastName ?? ""}) ` +
              `account restricted. Reason: ${disabledReason}`
            );
          }
        }

        console.log(
          `[WEBHOOK] account.updated: connectId=${account.id} userId=${userId ?? "—"} ` +
          `newStripeStatus=${newStripeConnectStatus} restricted=${isRestricted}`
        );
        break;
      }

      case "transfer.created":
      case "transfer.paid": {
        const transfer = event.data.object as Stripe.Transfer;
        const payoutId = transfer.metadata?.payoutId;
        const requesterType = transfer.metadata?.requesterType;
        if (!payoutId || !requesterType) break;

        if (requesterType === "expert") {
          await storage.updateExpertPayoutStatus(payoutId, "completed", undefined, transfer.id);
        } else if (requesterType === "provider") {
          await storage.updateProviderPayoutStatus(payoutId, "completed", undefined, transfer.id);
        }
        console.info(`Stripe ${event.type}: payoutId=${payoutId} transferId=${transfer.id}`);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        // ── Step 1: Confirm cart bookings (authoritative path) ──────────────
        // stripePaymentService.handlePaymentSucceeded() is idempotent — it skips
        // bookings that are already confirmed and generates confirmation codes for
        // any that are still in pending_payment status.
        try {
          await stripePaymentService.handlePaymentSucceeded(paymentIntent);
        } catch (bookingErr: any) {
          console.error("payment_intent.succeeded: booking confirmation error:", bookingErr.message);
          // Non-fatal: continue to revenue tracking even if booking confirmation fails
        }

        // ── Step 2: Crash-recovery for service_bookings ─────────────────────
        // If the checkout server crashed after the Stripe charge but before Step C
        // (stamping stripe_payment_intent_id) or before the client received the
        // response, these rows remain at status="payment_pending".
        // The webhook is the authoritative recovery path.
        try {
          const recovered = await db.execute(sql`
            UPDATE service_bookings
            SET status       = 'confirmed',
                confirmed_at = NOW()
            WHERE stripe_payment_intent_id = ${paymentIntent.id}
              AND status = 'payment_pending'
            RETURNING id
          `);
          if (recovered.rows.length > 0) {
            const ids = (recovered.rows as any[]).map((r: any) => r.id).join(', ');
            console.info(`[RECOVERY] payment_intent.succeeded: confirmed ${recovered.rows.length} payment_pending service_booking(s) [${ids}] via webhook for PI ${paymentIntent.id}`);
          }
        } catch (recoveryErr: any) {
          console.error("payment_intent.succeeded: service_booking crash-recovery error:", recoveryErr.message);
        }

        // ── Step 3: Revenue tracking ────────────────────────────────────────
        const sourceType = paymentIntent.metadata?.sourceType as any;
        const sourceId = paymentIntent.metadata?.sourceId;
        const expertId = paymentIntent.metadata?.expertId;
        const providerId = paymentIntent.metadata?.providerId;

        if (sourceId && sourceType) {
          const alreadyRecorded = await storage.hasPaymentIntentRevenue(paymentIntent.id);
          if (alreadyRecorded) {
            console.info(`Stripe payment_intent.succeeded: already recorded for paymentIntentId=${paymentIntent.id}, skipping`);
            break;
          }

          const amount = paymentIntent.amount / 100;
          const expertShare = expertId && paymentIntent.metadata?.expertShare
            ? parseFloat(paymentIntent.metadata.expertShare)
            : undefined;
          const providerShare = providerId && paymentIntent.metadata?.providerShare
            ? parseFloat(paymentIntent.metadata.providerShare)
            : undefined;

          try {
            await revenueTrackingService.recordRevenueEvent({
              sourceType: sourceType || "other",
              sourceId,
              grossAmount: amount,
              expertId,
              expertShare,
              providerId,
              providerShare,
              description: `Payment intent ${paymentIntent.id}`,
              metadata: { paymentIntentId: paymentIntent.id },
            });
            console.info(`Stripe payment_intent.succeeded: recorded revenue for sourceId=${sourceId} paymentIntentId=${paymentIntent.id}`);
          } catch (err: any) {
            console.error("Failed to record revenue for payment_intent.succeeded:", err.message);
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        // Flip any service_bookings still at payment_pending to "failed" so they
        // stop accumulating in the stuck-pending admin report and the customer
        // can safely retry without hitting the idempotency guard.
        try {
          const failed = await db.execute(sql`
            UPDATE service_bookings
            SET status     = 'failed',
                updated_at = NOW()
            WHERE stripe_payment_intent_id = ${paymentIntent.id}
              AND status = 'payment_pending'
            RETURNING id, traveler_id, service_id
          `);
          if (failed.rows.length > 0) {
            const ids = (failed.rows as any[]).map((r: any) => r.id).join(', ');
            console.info(`[payment_intent.payment_failed] Marked ${failed.rows.length} service_booking(s) as failed [${ids}] for PI ${paymentIntent.id}`);

            // Fire-and-forget payment-failed email to each affected traveler so
            // they know the booking wasn't confirmed and can retry. Non-blocking.
            for (const r of failed.rows as any[]) {
              if (!r.traveler_id) continue;
              try {
                const detail = await db.execute(sql`
                  SELECT u.email, u.first_name, u.last_name, ps.service_name AS title
                  FROM users u
                  LEFT JOIN provider_services ps ON ps.id = ${r.service_id}
                  WHERE u.id = ${r.traveler_id}
                  LIMIT 1
                `);
                const row = detail.rows?.[0] as any;
                if (row?.email) {
                  const { sendPaymentFailedEmail } = await import("../services/email.service");
                  sendPaymentFailedEmail({
                    toEmail: row.email,
                    userName: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
                    bookingTitle: row.title ?? null,
                  }).catch((e: any) => console.error(`[email] payment-failed send error for booking ${r.id}:`, e?.message));
                }
              } catch (mailErr: any) {
                console.error(`[payment_intent.payment_failed] email resolve error for booking ${r.id}:`, mailErr.message);
              }
            }
          }
        } catch (failErr: any) {
          console.error("payment_intent.payment_failed: service_booking update error:", failErr.message);
        }

        // Also update the payment_intents ledger row if one exists
        try {
          await db.execute(sql`
            UPDATE payment_intents
            SET status = 'failed'
            WHERE stripe_payment_intent_id = ${paymentIntent.id}
          `);
        } catch (_) {
          // payment_intents row may not exist for all PI flows — non-fatal
        }

        console.info(`Stripe payment_intent.payment_failed: pi=${paymentIntent.id} last_error=${(paymentIntent as any).last_payment_error?.message ?? 'unknown'}`);
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;

        // Fetch the charge to get bookingId from metadata
        const charge = await stripe.charges.retrieve(dispute.charge as string);
        const bookingId = charge.metadata?.bookingId;

        if (bookingId) {
          // Mark booking as disputed
          await db
            .update(bookings)
            .set({
              status: "disputed",
              disputeId: dispute.id,
              disputeReason: dispute.reason,
            })
            .where(eq(bookings.id, bookingId));

          // Alert admin immediately
          await db.insert(adminNotifications).values({
            type: "dispute_created",
            message: `Chargeback filed for booking ${bookingId} — reason: ${dispute.reason}`,
            reason: dispute.reason,
          } as any);

          console.warn(`[DISPUTE] Booking ${bookingId} disputed. Reason: ${dispute.reason} · Dispute ID: ${dispute.id}`);

          // Check if expert was already paid for this booking —
          // DO NOT automatically claw back funds; flag for human review only.
          const booking = await db
            .select({ tripId: bookings.tripId })
            .from(bookings)
            .where(eq(bookings.id, bookingId))
            .limit(1);

          if (booking[0]?.tripId) {
            const relatedExpertRequest = await db
              .select({ status: expertRequests.status })
              .from(expertRequests)
              .where(eq(expertRequests.tripId, booking[0].tripId))
              .limit(1);

            if (relatedExpertRequest[0]?.status === "completed") {
              await db.insert(adminNotifications).values({
                type: "dispute_after_payout",
                message: `URGENT: Booking ${bookingId} disputed but expert may have already been paid. Manual review required.`,
                reason: "payout_clawback_review",
              } as any);
              console.warn(`[DISPUTE] Booking ${bookingId}: expert request was completed — possible payout clawback needed. Manual review required.`);
            }
          }
        } else {
          console.warn(`[DISPUTE] Dispute ${dispute.id} on charge ${dispute.charge} has no bookingId in metadata — no booking updated.`);
        }
        break;
      }

      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;

        // won  → we keep the funds; restore booking to confirmed
        // lost → customer refunded; mark booking as dispute_lost for ops
        const charge = await stripe.charges.retrieve(dispute.charge as string);
        const bookingId = charge.metadata?.bookingId;

        if (bookingId) {
          const newStatus = dispute.status === "won" ? "confirmed" : "dispute_lost";
          await db
            .update(bookings)
            .set({ status: newStatus })
            .where(eq(bookings.id, bookingId));

          await db.insert(adminNotifications).values({
            type: "dispute_closed",
            message: `Dispute ${dispute.id} for booking ${bookingId} closed — outcome: ${dispute.status}. Booking status set to "${newStatus}".`,
            reason: dispute.status,
          } as any);

          console.info(`[DISPUTE] Dispute ${dispute.id} closed (${dispute.status}). Booking ${bookingId} → ${newStatus}.`);
        }
        break;
      }

      default:
        // Acknowledge unhandled event types without error
        break;
    }
  } catch (err: any) {
    processingError = err.message ?? String(err);
    console.error(`[WEBHOOK] Processing error for ${event.type} (${event.id}):`, err);
  }

  // ── 4. Mark processed / record error ──────────────────────────────────────
  // processed=false + error text → shows in GET /api/admin/webhooks/unprocessed
  if (processingError === null) {
    await db.execute(sql`
      UPDATE webhook_events
      SET processed    = TRUE,
          processed_at = NOW()
      WHERE stripe_event_id = ${event.id}
    `);
  } else {
    await db.execute(sql`
      UPDATE webhook_events
      SET error = ${processingError}
      WHERE stripe_event_id = ${event.id}
    `);
  }
}

// POST /api/webhooks/stripe
// Handles Stripe Connect account events, transfer confirmations, and payment intents.
// No auth middleware — verified via Stripe-Signature header using raw body.
router.post("/stripe", async (req: any, res) => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  let event: Stripe.Event;

  if (webhookSecret) {
    if (!sig) {
      return res.status(400).json({ message: "Missing Stripe-Signature header" });
    }
    if (!req.rawBody) {
      return res.status(500).json({ message: "Raw body unavailable for signature verification" });
    }
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("Stripe Connect webhook signature verification failed:", err.message);
      return res.status(400).json({ message: `Webhook signature error: ${err.message}` });
    }
  } else {
    if (process.env.NODE_ENV === "production") {
      return res.status(400).json({ message: "STRIPE_CONNECT_WEBHOOK_SECRET must be set in production" });
    }
    try {
      event = typeof req.body === "object" ? req.body : JSON.parse(req.rawBody?.toString() ?? "{}");
    } catch (err: any) {
      return res.status(400).json({ message: "Invalid JSON body" });
    }
  }

  // Acknowledge receipt IMMEDIATELY — Stripe's 30-second timeout starts from
  // the HTTP request. Blocking on DB writes risks a timeout that triggers Stripe
  // to re-queue the event, creating duplicate deliveries.
  res.json({ received: true });

  // Process AFTER responding — fire-and-forget with full error logging
  processStripeWebhookEvent(event).catch(err => {
    console.error("[WEBHOOK PROCESSING ERROR]", event.type, err);
  });
});

export default router;
