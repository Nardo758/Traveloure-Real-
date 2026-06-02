import { Router } from "express";
import Stripe from "stripe";
import { db } from "../db";
import { localExpertForms, serviceProviderForms } from "@shared/schema";
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
    const { country, registrationNumber, additionalDocUrl } = req.body as { country: string; registrationNumber: string; additionalDocUrl?: string };

    if (!country || !registrationNumber) {
      return res.status(400).json({ message: "country and registrationNumber are required" });
    }

    // Fetch existing form to capture already-uploaded document URLs
    const [form] = await db
      .select()
      .from(serviceProviderForms)
      .where(eq(serviceProviderForms.userId, userId))
      .limit(1);

    if (!form) {
      return res.status(404).json({ message: "Provider application not found" });
    }

    // Collect already-uploaded documents from the application form
    const existingDocuments: Record<string, string> = {};
    if ((form as any).businessLicense) existingDocuments.businessLicense = (form as any).businessLicense;
    if ((form as any).businessGstTax) existingDocuments.businessGstTax = (form as any).businessGstTax;
    if ((form as any).businessLogo) existingDocuments.businessLogo = (form as any).businessLogo;
    // Include any additional document URL submitted at verification time
    if (additionalDocUrl) existingDocuments.additionalDoc = additionalDocUrl;

    const PERSONA_API_KEY = process.env.PERSONA_API_KEY;

    if (!PERSONA_API_KEY) {
      // No Persona key — store details and mark as submitted for manual admin review
      await db
        .update(serviceProviderForms)
        .set({
          businessVerificationStatus: "submitted",
          businessCountry: country,
          businessRegistrationNumber: registrationNumber,
          businessDocuments: existingDocuments,
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
        businessDocuments: existingDocuments,
      } as any)
      .where(eq(serviceProviderForms.userId, userId));

    res.json({ inquiryUrl, inquiryId });
  } catch (err: any) {
    console.error("Persona KYB error:", err);
    res.status(500).json({ message: err.message || "Failed to create business verification" });
  }
});

export default router;
