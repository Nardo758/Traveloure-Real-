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
import { db } from "../db";
import { localExpertForms, serviceProviderForms, expertPayouts, providerPayouts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { revenueTrackingService } from "../services/revenue-tracking.service";

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
      const updates = { identityVerificationStatus: "verified", identityVerifiedAt: new Date() };
      if (formType === "expert") {
        await db.update(localExpertForms).set(updates as any).where(eq(localExpertForms.userId, userId));
      } else {
        await db.update(serviceProviderForms).set(updates as any).where(eq(serviceProviderForms.userId, userId));
      }
    } else if (event.type === "identity.verification_session.requires_input") {
      const updates = { identityVerificationStatus: "failed" };
      if (formType === "expert") {
        await db.update(localExpertForms).set(updates as any).where(eq(localExpertForms.userId, userId));
      } else {
        await db.update(serviceProviderForms).set(updates as any).where(eq(serviceProviderForms.userId, userId));
      }
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

    await db
      .update(serviceProviderForms)
      .set({ businessVerificationStatus: newStatus } as any)
      .where(eq((serviceProviderForms as any).personaInquiryId, inquiryId));
  } catch (err) {
    console.error("Persona webhook processing error:", err);
  }

  res.json({ received: true });
});

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

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const userId = account.metadata?.userId;
        if (!userId) break;

        let status = "onboarding_incomplete";
        if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
          status = "active";
        } else if (account.details_submitted) {
          status = "under_review";
        }

        await storage.updateUserStripeAccount(userId, account.id, status);
        console.log(`Stripe account.updated: userId=${userId} status=${status}`);
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
        console.log(`Stripe ${event.type}: payoutId=${payoutId} transferId=${transfer.id}`);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const sourceType = paymentIntent.metadata?.sourceType as any;
        const sourceId = paymentIntent.metadata?.sourceId;
        const expertId = paymentIntent.metadata?.expertId;
        const providerId = paymentIntent.metadata?.providerId;

        // Only record if we have enough metadata and it hasn't been recorded already
        if (sourceId && sourceType) {
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
            console.log(`Stripe payment_intent.succeeded: recorded revenue for sourceId=${sourceId}`);
          } catch (err: any) {
            // Don't fail the webhook if revenue recording fails (idempotency)
            console.error("Failed to record revenue for payment_intent.succeeded:", err.message);
          }
        }
        break;
      }

      default:
        // Acknowledge unhandled event types without error
        break;
    }
  } catch (err) {
    console.error("Stripe Connect webhook processing error:", err);
  }

  res.json({ received: true });
});

export default router;
