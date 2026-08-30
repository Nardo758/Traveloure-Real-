import { Router } from "express";
import { getUserId } from "../utils/auth";
import Stripe from "stripe";
import { db } from "../db";
import { localExpertForms, serviceProviderForms } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { getBaseUrl } from "../services/stripe.service";
import { getStripeSecretKey } from "../utils/stripe-key";

const router = Router();

const stripe = new Stripe(getStripeSecretKey()!, {
  apiVersion: "2024-12-18.acacia" as any,
});

// POST /api/identity/create-session — Stripe Identity individual verification
router.post("/create-session", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { formType } = req.body as { formType: "expert" | "provider" };

    if (!formType || !["expert", "provider"].includes(formType)) {
      return res.status(400).json({ message: "formType must be 'expert' or 'provider'" });
    }

    const returnUrl = `${getBaseUrl()}/${formType === "expert" ? "expert-status" : "provider-status"}?verification=complete`;

    const session = await (stripe.identity.verificationSessions as any).create({
      type: "document",
      metadata: { user_id: userId, form_type: formType },
      return_url: returnUrl,
    });

    if (formType === "expert") {
      await db
        .update(localExpertForms)
        .set({
          identityVerificationSessionId: session.id,
          identityVerificationStatus: "processing",
        } as any)
        .where(eq(localExpertForms.userId, userId));
    } else {
      await db
        .update(serviceProviderForms)
        .set({
          identityVerificationSessionId: session.id,
          identityVerificationStatus: "processing",
        } as any)
        .where(eq(serviceProviderForms.userId, userId));
    }

    res.json({ verificationUrl: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error("Stripe Identity create-session error:", err);
    res.status(500).json({ message: err.message || "Failed to create verification session" });
  }
});

// POST /api/identity/business/create-inquiry — RETIRED (Persona KYB removed Aug 2026)
// Business verification is now derived from the provider's Stripe Connect Express account
// via the account.updated webhook. Stripe performs its own KYB during Express onboarding.
// Any existing client calling this endpoint should be directed to the Connect onboarding flow.
router.post("/business/create-inquiry", (_req, res) => {
  res.status(410).json({
    message: "Persona KYB has been retired. Business verification is now handled through Stripe Connect onboarding.",
    code: "PERSONA_KYB_RETIRED",
    action: "Complete your Stripe Connect onboarding to verify your business.",
  });
});

export default router;
