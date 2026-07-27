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
import { EARNER_ROLES as CANONICAL_EARNER_ROLES, isEarnerRole, isProviderRole } from "@shared/roles";

const router = Router();

const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ message: "Authentication required" });
};

// Roles allowed to claim a storefront handle — the canonical earner set (shared/roles.ts)
// plus legacy bare "provider" tolerated as a permissive allow (V.4 both-spellings posture;
// no canonical write path produces it, but a grandfathered row shouldn't lose its handle).
const EARNER_ROLES = new Set<string>([...CANONICAL_EARNER_ROLES, "provider"]);

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

// ─── Settings persistence (backoffice B6, migration 150) ────────────────────────────────────
//
// users.preferences is a namespaced jsonb; the Settings console owns ONLY its `settings` key.
// §14: user from session only. PATCH is a strict zod allow-list of exactly the fields the
// Settings tabs render (never raw req.body into jsonb — the trip-contexts PUT precedent), and
// the write SHALLOW-MERGES into preferences.settings so other namespaces are never clobbered.

const notificationChannelSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
}).strict();

const settingsPatchSchema = z.object({
  notifications: z.object({
    newMessage: notificationChannelSchema.optional(),
    bookingRequest: notificationChannelSchema.optional(),
    itineraryUpdate: notificationChannelSchema.optional(),
    paymentReceived: notificationChannelSchema.optional(),
    platformAnnouncements: notificationChannelSchema.optional(),
  }).strict().optional(),
  language: z.string().trim().max(20).optional(),
  timezone: z.string().trim().max(30).optional(),
}).strict();

router.get("/api/me/preferences", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub ?? req.user?.id;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const [me] = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!me) return res.status(401).json({ message: "Authentication required" });
    const prefs = (me.preferences as any) ?? {};
    res.json(prefs.settings ?? {});
  } catch (err) {
    console.error("[me/preferences] read error:", err);
    res.status(500).json({ message: "Failed to load preferences" });
  }
});

router.patch("/api/me/preferences", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub ?? req.user?.id;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const parsed = settingsPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid preferences", errors: parsed.error.flatten() });
    }

    const [me] = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!me) return res.status(401).json({ message: "Authentication required" });

    const current = ((me.preferences as any) ?? {});
    const currentSettings = current.settings ?? {};
    const patch = parsed.data;
    const nextSettings = {
      ...currentSettings,
      ...(patch.language !== undefined ? { language: patch.language } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.notifications
        ? { notifications: { ...(currentSettings.notifications ?? {}), ...patch.notifications } }
        : {}),
    };

    await db
      .update(users)
      .set({ preferences: { ...current, settings: nextSettings } })
      .where(eq(users.id, userId));

    res.json(nextSettings);
  } catch (err) {
    console.error("[me/preferences] write error:", err);
    res.status(500).json({ message: "Failed to save preferences" });
  }
});

// ─── Activation checklist (Build 1, "Open your business") ───────────────────────────────────
//
// GET /api/me/business-setup — the setup-progress aggregate for the console checklist card.
// §14: everything is scoped to the SESSION user. §13: every step's completion is DERIVED from
// real rows (handle column, Stripe account status, own offerings across the three lanes,
// future availability slots, identity-verification status) — nothing is self-reported and
// nothing is stored; there is no migration and no state to drift.
router.get("/api/me/business-setup", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub ?? req.user?.id;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const [me] = await db
      .select({
        id: users.id,
        role: users.role,
        handle: users.handle,
        stripeAccountStatus: users.stripeAccountStatus,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!me) return res.status(401).json({ message: "Authentication required" });

    // Non-earners (travelers, EA, admin-without-earner-role) get an explicit not-eligible
    // payload rather than a 403 — the card simply doesn't render for them.
    if (!isEarnerRole(me.role) && !EARNER_ROLES.has(me.role ?? "")) {
      return res.json({ eligible: false });
    }
    const consoleFamily = isProviderRole(me.role) || me.role === "provider" ? "provider" : "expert";

    // Offerings across the three lanes (same owner columns + approved criteria as the
    // public storefront gates above: F2 for services, §10 for templates, migration-133
    // status for Ready Made Trips).
    const [svcAgg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where ${providerServices.approvalStatus} = 'approved')::int`,
      })
      .from(providerServices)
      .where(eq(providerServices.userId, me.id));
    const [tplAgg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where ${expertTemplates.approvalStatus} = 'approved')::int`,
      })
      .from(expertTemplates)
      .where(eq(expertTemplates.expertId, me.id));
    const [rmtAgg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where ${readyMadeTrips.status} = 'approved')::int`,
      })
      .from(readyMadeTrips)
      .where(eq(readyMadeTrips.authorId, me.id));

    const offeringsTotal = (svcAgg?.total ?? 0) + (tplAgg?.total ?? 0) + (rmtAgg?.total ?? 0);
    const offeringsApproved = (svcAgg?.approved ?? 0) + (tplAgg?.approved ?? 0) + (rmtAgg?.approved ?? 0);

    // Availability applies to the in-person (provider) track only — future, non-blocked slots
    // on the caller's OWN services (the vendor_availability_slots canonical table).
    let availabilityCount = 0;
    const availabilityApplicable = consoleFamily === "provider";
    if (availabilityApplicable) {
      const slotResult = await db.execute(sql`
        SELECT count(*)::int AS n
        FROM vendor_availability_slots
        WHERE service_id IN (SELECT id FROM provider_services WHERE user_id = ${me.id})
          AND date >= CURRENT_DATE
          AND status <> 'blocked'
      `);
      availabilityCount = Number((slotResult.rows as any[])?.[0]?.n ?? 0);
    }

    // Verification is informational here (Build 3 flips the public-storefront gate); reuses
    // the same either-form check the storefront gate uses so the two never disagree.
    const identityVerified = await isOwnerIdentityVerified(me.id);
    const verificationRequired = await isStorefrontVerificationRequired();

    return res.json({
      eligible: true,
      consoleFamily,
      steps: {
        handle: { done: !!me.handle, value: me.handle ?? null },
        payouts: { done: me.stripeAccountStatus === "active", status: me.stripeAccountStatus ?? null },
        firstOffering: { done: offeringsTotal > 0, count: offeringsTotal },
        approvedOffering: { done: offeringsApproved > 0, count: offeringsApproved },
        availability: { applicable: availabilityApplicable, done: availabilityCount > 0, count: availabilityCount },
        verification: { done: identityVerified, requiredForStorefront: verificationRequired },
      },
      storefrontPath: me.handle ? `/p/${me.handle}` : null,
    });
  } catch (error: any) {
    console.error("[business-setup] aggregate failed:", error);
    return res.status(500).json({ message: "Failed to load business setup" });
  }
});

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
