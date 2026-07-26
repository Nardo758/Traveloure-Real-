/**
 * storefront.routes.ts — public earner storefront (backoffice Phase 1a/1b).
 *
 * The mockup's "/p/{handle}" identity layer (docs/backoffice/mockups/mockup-offering-page.html,
 * mockup-backoffice-dashboard.html). Three surfaces:
 *   PATCH /api/me/handle          — claim/change the caller's handle (§14: user from session only)
 *   GET   /api/storefront/:handle — public JSON: earner profile + APPROVED offerings across the
 *                                   three lanes (provider_services / expert_templates / ready_made_trips)
 *   GET   /p/:handle              — server-side OG-injected HTML shell (the trips.routes.ts
 *                                   /itinerary-view/:token route-interception pattern), then the SPA
 *                                   takes over client-side.
 *
 * Trust posture: the storefront lists ONLY admin-approved offerings (each lane's approval gate is
 * the platform's live trust review — F2/§10/Ready-Made queues), and 404s when the earner has zero
 * approved items, so an unvetted earner has no public page. Filed follow-up (V.1, IMPLEMENTATION_MAP
 * Phase 0.5): additionally gate on identity/KYB verification status before any marketing push.
 */
import { Router } from "express";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, expertTemplates, readyMadeTrips, localExpertForms, serviceProviderForms } from "@shared/schema";

const router = Router();

const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ message: "Authentication required" });
};

// Roles allowed to claim a storefront handle (earner roles; V.4 provider-vocab both spellings).
const EARNER_ROLES = new Set([
  "local_expert",
  "travel_expert",
  "event_planner",
  "expert",
  "provider",
  "service_provider",
]);

// Reserved first segments: platform vocabulary + abuse-prone names. A handle lives under /p/ so
// route collisions are impossible; this list protects brand/impersonation surface.
const RESERVED_HANDLES = new Set([
  "admin", "administrator", "api", "traveloure", "official", "support", "help",
  "staff", "team", "moderator", "mod", "root", "system", "security", "billing",
  "payments", "legal", "privacy", "terms", "about", "contact", "discover",
  "experts", "expert", "provider", "providers", "services", "service", "trips",
  "trip", "booking", "bookings", "checkout", "cart", "login", "signup", "signin",
  "register", "settings", "dashboard", "me", "you", "null", "undefined", "test",
]);

// lowercase alnum + hyphens, 3–30 chars, no leading/trailing/double hyphen
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]$/;

const claimSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Handle must be at least 3 characters")
    .max(30, "Handle must be at most 30 characters"),
});

router.patch("/api/me/handle", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub ?? req.user?.id;
    const parsed = claimSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid handle" });
    }
    const handle = parsed.data.handle;
    if (!HANDLE_RE.test(handle)) {
      return res.status(400).json({
        message: "Handles use lowercase letters, numbers, and single hyphens (3–30 chars).",
      });
    }
    if (RESERVED_HANDLES.has(handle)) {
      return res.status(400).json({ message: "That handle is reserved." });
    }

    const [me] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!me) return res.status(401).json({ message: "Authentication required" });
    if (!EARNER_ROLES.has(me.role ?? "")) {
      return res.status(403).json({ message: "Only expert and provider accounts can claim a storefront handle." });
    }

    try {
      const [updated] = await db
        .update(users)
        .set({ handle, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ handle: users.handle });
      return res.json({ handle: updated?.handle ?? handle });
    } catch (e: any) {
      // unique_violation → someone else owns it
      if (e?.code === "23505") {
        return res.status(409).json({ message: "That handle is already taken." });
      }
      throw e;
    }
  } catch (error: any) {
    console.error("[storefront] handle claim failed:", error);
    return res.status(500).json({ message: "Failed to update handle" });
  }
});

// V.1 — admin-switchable identity-verification gate for public storefront visibility.
// Reads platform_settings.storefront_require_verified ("true"/"false"); absent/error = "false"
// (today's behavior, unchanged). Mirrors the commission.ts:resolveInsuranceFromCategory
// platform_settings read pattern (raw SQL, best-effort, safe default on any failure).
async function isStorefrontVerificationRequired(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT setting_value
      FROM platform_settings
      WHERE setting_key = 'storefront_require_verified'
    `);
    const row = (result.rows as any[])?.[0];
    return row?.setting_value === "true";
  } catch {
    return false;
  }
}

// V.1 — has this owner completed identity verification on EITHER form? Checked regardless of
// current role (a user's stored role can be ambiguous relative to which onboarding form they
// filled out), so verified-in-either counts.
async function isOwnerIdentityVerified(userId: string): Promise<boolean> {
  const [localExpertForm] = await db
    .select({ status: localExpertForms.identityVerificationStatus })
    .from(localExpertForms)
    .where(eq(localExpertForms.userId, userId))
    .limit(1);
  if (localExpertForm?.status === "verified") return true;

  const [providerForm] = await db
    .select({ status: serviceProviderForms.identityVerificationStatus })
    .from(serviceProviderForms)
    .where(eq(serviceProviderForms.userId, userId))
    .limit(1);
  return providerForm?.status === "verified";
}

async function loadStorefront(handle: string) {
  const normalized = handle.trim().toLowerCase();
  if (!HANDLE_RE.test(normalized)) return null;

  const [owner] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      bio: users.bio,
      profileImageUrl: users.profileImageUrl,
      role: users.role,
      handle: users.handle,
    })
    .from(users)
    .where(and(eq(users.handle, normalized), eq(users.isDeleted, false), eq(users.isSuspended, false)))
    .limit(1);
  if (!owner) return null;

  // V.1 — enabled by admin flipping platform_settings.storefront_require_verified to "true" once
  // V.2/V.3 verification-flow sequencing lands; build-while-pending preserved (handle claim + the
  // owner's own console are never gated here — only this public read path). Default "false"
  // keeps today's behavior unchanged.
  if (await isStorefrontVerificationRequired()) {
    const verified = await isOwnerIdentityVerified(owner.id);
    if (!verified) return null;
  }

  // Lane 1: custom services — public read-gate is approval_status='approved' (F2) + active.
  const services = await db
    .select({
      id: providerServices.id,
      serviceName: providerServices.serviceName,
      price: providerServices.price,
      priceType: providerServices.priceType,
      averageRating: providerServices.averageRating,
      reviewCount: providerServices.reviewCount,
    })
    .from(providerServices)
    .where(
      and(
        eq(providerServices.userId, owner.id),
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "active"),
      ),
    );

  // Lane 2: itinerary templates — approved + expert-published (§10 read-gate). Teaser fields only
  // (the content-gate: no itineraryData here, ever).
  const templates = await db
    .select({
      id: expertTemplates.id,
      title: expertTemplates.title,
      destination: expertTemplates.destination,
      price: expertTemplates.price,
      coverImage: expertTemplates.coverImage,
    })
    .from(expertTemplates)
    .where(
      and(
        eq(expertTemplates.expertId, owner.id),
        eq(expertTemplates.approvalStatus, "approved"),
        eq(expertTemplates.isPublished, true),
      ),
    );

  // Lane 3: Ready Made Trips — status='approved' is the sellable state (migration 133 CHECK).
  const readyMade = await db
    .select({
      id: readyMadeTrips.id,
      title: readyMadeTrips.title,
      heroImageUrl: readyMadeTrips.heroImageUrl,
      priceCents: readyMadeTrips.priceCents,
    })
    .from(readyMadeTrips)
    .where(and(eq(readyMadeTrips.authorId, owner.id), eq(readyMadeTrips.status, "approved")));

  const total = services.length + templates.length + readyMade.length;
  // No approved inventory → no public page (an unvetted earner is not publishable).
  if (total === 0) return null;

  // S7 — earner-level rating aggregate (§13-honest), same formula as
  // storage.getExpertsWithProfiles: a review-count-WEIGHTED mean over the earner's
  // own approved services (Lane 1, already fetched above — no extra query, no second
  // parallel aggregate). Null when there are no reviews so the client renders "New",
  // never a fabricated number.
  let weightedSum = 0;
  let totalReviews = 0;
  for (const s of services) {
    const rc = Number(s.reviewCount ?? 0);
    const ar = s.averageRating != null ? Number(s.averageRating) : null;
    if (rc > 0 && ar != null && !Number.isNaN(ar)) {
      weightedSum += ar * rc;
      totalReviews += rc;
    }
  }
  const earnerAverageRating =
    totalReviews > 0 ? Math.round((weightedSum / totalReviews) * 100) / 100 : null;

  return {
    earner: {
      name: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Traveloure earner",
      bio: owner.bio ?? null,
      profileImageUrl: owner.profileImageUrl ?? null,
      role: owner.role,
      handle: owner.handle,
      averageRating: earnerAverageRating,
      reviewCount: totalReviews,
    },
    services,
    templates,
    readyMade,
  };
}

router.get("/api/storefront/:handle", async (req, res) => {
  try {
    const data = await loadStorefront(req.params.handle);
    if (!data) return res.status(404).json({ message: "Storefront not found" });
    return res.json(data);
  } catch (error: any) {
    console.error("[storefront] load failed:", error);
    return res.status(500).json({ message: "Failed to load storefront" });
  }
});

// Server-side OG injection for /p/:handle — crawlers (WhatsApp/FB/X) never run the SPA's JS, so
// the share preview must be in the initial HTML. Same handler shape as /itinerary-view/:token.
router.get("/p/:handle", async (req, res, next) => {
  try {
    const data = await loadStorefront(req.params.handle);
    if (!data) return next(); // SPA renders its own not-found

    const count = data.services.length + data.templates.length + data.readyMade.length;
    const title = `${data.earner.name} — Book local experiences | Traveloure`;
    const description =
      data.earner.bio ??
      `${count} bookable experience${count === 1 ? "" : "s"} from ${data.earner.name} on Traveloure. Secure checkout, verified reviews.`;
    const shareUrl = `${req.protocol}://${req.get("host")}/p/${data.earner.handle}`;
    const ogImage =
      data.readyMade[0]?.heroImageUrl ??
      data.templates[0]?.coverImage ??
      data.earner.profileImageUrl ??
      `${req.protocol}://${req.get("host")}/og-cover.png`;

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const ogTags = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}" />`,
      `<meta property="og:type" content="profile" />`,
      `<meta property="og:url" content="${esc(shareUrl)}" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:image" content="${esc(ogImage)}" />`,
      `<meta property="og:site_name" content="Traveloure" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
    ].join("\n    ");

    const clientTemplateDev = path.resolve(process.cwd(), "client", "index.html");
    const clientTemplateProd = path.resolve(__dirname, "public", "index.html");
    const templatePath = fs.existsSync(clientTemplateDev) ? clientTemplateDev : clientTemplateProd;
    if (!fs.existsSync(templatePath)) return next();

    let template = fs.readFileSync(templatePath, "utf-8");
    template = template.replace("<head>", `<head>\n    ${ogTags}`);
    return res.status(200).set({ "Content-Type": "text/html" }).end(template);
  } catch (err) {
    console.error("[storefront] OG injection error:", err);
    return next(); // fall through to SPA on any error
  }
});

// Server-side OG injection for /services/:id — same pattern as /p/:handle.
router.get("/services/:id", async (req, res, next) => {
  try {
    const [service] = await db
      .select({
        id: providerServices.id,
        serviceName: providerServices.serviceName,
        description: providerServices.description,
        price: providerServices.price,
        serviceImage: providerServices.serviceImage,
      })
      .from(providerServices)
      .where(
        and(
          eq(providerServices.id, req.params.id),
          eq(providerServices.approvalStatus, "approved"),
          eq(providerServices.status, "active"),
        ),
      )
      .limit(1);

    if (!service) return next(); // SPA renders its own not-found

    const title = `${service.serviceName} | Traveloure`;
    const description =
      service.description?.substring(0, 160) ??
      `Book ${service.serviceName} on Traveloure — secure checkout, verified reviews.`;
    const shareUrl = `${req.protocol}://${req.get("host")}/services/${service.id}`;
    const ogImage =
      service.serviceImage ??
      `${req.protocol}://${req.get("host")}/og-cover.png`;

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const ogTags = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:url" content="${esc(shareUrl)}" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:image" content="${esc(ogImage)}" />`,
      `<meta property="og:site_name" content="Traveloure" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
    ].join("\n    ");

    const clientTemplateDev = path.resolve(process.cwd(), "client", "index.html");
    const clientTemplateProd = path.resolve(__dirname, "public", "index.html");
    const templatePath = fs.existsSync(clientTemplateDev) ? clientTemplateDev : clientTemplateProd;
    if (!fs.existsSync(templatePath)) return next();

    let template = fs.readFileSync(templatePath, "utf-8");
    template = template.replace("<head>", `<head>\n    ${ogTags}`);
    return res.status(200).set({ "Content-Type": "text/html" }).end(template);
  } catch (err) {
    console.error("[storefront] OG injection error (service):", err);
    return next(); // fall through to SPA on any error
  }
});

export default router;
