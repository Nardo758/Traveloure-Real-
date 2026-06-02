import { Router } from "express";
import Stripe from "stripe";
import { db } from "../db";
import { localExpertForms, serviceProviderForms, notifications } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { getBaseUrl } from "../services/stripe.service";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia" as any,
});

// POST /api/identity/create-session — Stripe Identity individual verification
router.post("/create-session", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;
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

// POST /api/identity/business/create-inquiry — Persona KYB for providers
router.post("/business/create-inquiry", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;
    const { country, registrationNumber } = req.body as { country: string; registrationNumber: string };

    if (!country || !registrationNumber) {
      return res.status(400).json({ message: "country and registrationNumber are required" });
    }

    const PERSONA_API_KEY = process.env.PERSONA_API_KEY;

    if (!PERSONA_API_KEY) {
      // No Persona key — store details and mark as submitted for manual admin review
      await db
        .update(serviceProviderForms)
        .set({
          businessVerificationStatus: "submitted",
          businessCountry: country,
          businessRegistrationNumber: registrationNumber,
        } as any)
        .where(eq(serviceProviderForms.userId, userId));

      return res.json({ success: true, inquiryUrl: null, message: "Submitted for manual review" });
    }

    // Persona API
    const personaRes = await fetch("https://withpersona.com/api/v1/inquiries", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERSONA_API_KEY}`,
        "Content-Type": "application/json",
        "Persona-Version": "2023-01-05",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            "inquiry-template-id": process.env.PERSONA_TEMPLATE_ID,
            "reference-id": userId,
            fields: {
              "business-registration-number": registrationNumber,
              "business-country-code": country,
            },
          },
        },
      }),
    });

    const personaData = await personaRes.json();

    if (!personaRes.ok) {
      throw new Error(personaData.errors?.[0]?.detail || "Persona API error");
    }

    const inquiryId = personaData.data?.id;
    const sessionToken = personaData.data?.attributes?.["session-token"];
    const inquiryUrl = inquiryId && sessionToken
      ? `https://withpersona.com/verify?inquiry-id=${inquiryId}&session-token=${sessionToken}`
      : null;

    await db
      .update(serviceProviderForms)
      .set({
        personaInquiryId: inquiryId,
        businessVerificationStatus: "submitted",
        businessCountry: country,
        businessRegistrationNumber: registrationNumber,
      } as any)
      .where(eq(serviceProviderForms.userId, userId));

    res.json({ inquiryUrl, inquiryId });
  } catch (err: any) {
    console.error("Persona KYB error:", err);
    res.status(500).json({ message: err.message || "Failed to create business verification" });
  }
});

// POST /api/webhooks/stripe-identity — Stripe Identity webhook
router.post("/webhooks/stripe-identity", async (req, res) => {
  let event: any;

  try {
    const sig = req.headers["stripe-signature"] as string;
    if (process.env.STRIPE_IDENTITY_WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_IDENTITY_WEBHOOK_SECRET
      );
    } else {
      event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    }
  } catch (err: any) {
    console.error("Stripe Identity webhook signature error:", err.message);
    return res.status(400).json({ message: err.message });
  }

  const session = event.data?.object;
  const userId = session?.metadata?.user_id;
  const formType = session?.metadata?.form_type;

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
    console.error("Stripe Identity webhook DB error:", err);
  }

  res.json({ received: true });
});

// POST /api/webhooks/persona — Persona KYB webhook
router.post("/webhooks/persona", async (req, res) => {
  try {
    const event = req.body;
    const inquiryId = event.data?.id;
    const status = event.data?.attributes?.status;

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
    console.error("Persona webhook error:", err);
  }

  res.json({ received: true });
});

export default router;
