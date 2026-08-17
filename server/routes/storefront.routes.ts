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
 *   GET   /services/:id           — same OG injection for the shareable offering page.
 *   GET   /ready-made/:id         — same OG injection for the Ready Made detail (the F4 `direct:*`
 *                                   link-preview format; approved+active only).
 *
 * Trust posture: the storefront lists ONLY admin-approved offerings (each lane's approval gate is
 * the platform's live trust review — F2/§10/Ready-Made queues), and 404s when the earner has zero
 * approved items, so an unvetted earner has no public page. Filed follow-up (V.1, IMPLEMENTATION_MAP
 * Phase 0.5): additionally gate on identity/KYB verification status before any marketing push.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import { sanitizeInput } from "../utils/sanitize";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, expertTemplates, readyMadeTrips, localExpertForms, serviceProviderForms, expertNeighborhoods, cityNeighborhoods, resolveBookingMode, serviceTranslations } from "@shared/schema";
import { isContentLocale, effectiveSourceLocale } from "../services/service-translation.service";
// Vacation mode (provider back-office wave, migration 189, decision-maker ratified Aug 9 2026):
// business-level flag only, read here for the storefront's `away` field — never touches
// providerServices/expertTemplates/readyMadeTrips rows or their approval/status columns.
import { EARNER_ROLES as CANONICAL_EARNER_ROLES, isEarnerRole, isProviderRole } from "@shared/roles";
import { planTypeLabel, isCustomPlanType } from "@shared/ready-made-plan-types";
import { transformDevHtml } from "../vite-dev-html";

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
    const userId = getUserId(req)!;
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
    // Deliberately fail OPEN (false = verification NOT required): this flag is an
    // admin-switchable HARDENING gate that defaults off (V.1). A transient settings-read
    // failure must not vanish every storefront on the platform; when the flag is ON and
    // the read fails, the next successful read re-applies it. (Corrects the a250e6a6
    // sweep's comment, which claimed "fail closed" above code that fails open.)
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

// Storefront identity-hero location (§13-honest): prefers the admin-managed neighborhood
// assignment (expertNeighborhoods → city_neighborhoods — the Kyoto lead-vetting table, isLead
// first), falling back to the local-expert onboarding form's own city/country.
// service_provider_forms carries no clean city column (only free-text `address`), so a
// provider with no local-expert form returns null and the client simply omits the location
// line — no fabricated/derived location is ever shown.
async function resolveEarnerLocation(userId: string): Promise<string | null> {
  const [neighborhood] = await db
    .select({ name: cityNeighborhoods.name, city: cityNeighborhoods.city })
    .from(expertNeighborhoods)
    .innerJoin(cityNeighborhoods, eq(expertNeighborhoods.neighborhoodId, cityNeighborhoods.id))
    .where(eq(expertNeighborhoods.expertId, userId))
    .orderBy(sql`${expertNeighborhoods.isLead} DESC`, expertNeighborhoods.sortOrder)
    .limit(1);
  if (neighborhood) return `${neighborhood.name}, ${neighborhood.city}`;

  const [localForm] = await db
    .select({ city: localExpertForms.city, country: localExpertForms.country })
    .from(localExpertForms)
    .where(eq(localExpertForms.userId, userId))
    .limit(1);
  if (localForm?.city) {
    return localForm.country ? `${localForm.city}, ${localForm.country}` : localForm.city;
  }
  return null;
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
  // Ruling 60 Phase A (chrome i18n): this field is the account-persisted copy of the chrome
  // locale — RESOLUTION STEP 1. It already existed on this allow-list as a free-form
  // max(20) string; tightening it to an enum keeps arbitrary text out of the jsonb namespace
  // while staying a minimal extension of the existing strict-allowlist posture (no new
  // endpoint, no new column, no migration — the preference rides users.preferences.settings).
  //
  // WHY THE LIST IS WIDER THAN THE SHIPPED LOCALES: only `en` and `ja` have locale files
  // (SUPPORTED_LOCALES, client/src/lib/i18n.ts). `es`/`fr`/`de` are here because
  // client/src/pages/expert/settings.tsx has offered them in its Language select since before
  // this ruling, and narrowing to en|ja would 400 that page's whole settings save (notifications
  // and timezone included) for any expert who had picked one. They persist and resolve to
  // nothing — the client's normalizeLocale drops an unshipped locale and the resolution order
  // falls through to the next step, which is exactly the pre-ruling behavior. Retiring those
  // three options is filed on the punchlist, not done here.
  language: z.enum(["en", "ja", "es", "fr", "de"]).optional(),
  timezone: z.string().trim().max(30).optional(),
  // Audit B-5: the Settings leaderboard toggle had a Save with no handler and no store —
  // now a real persisted preference (display opt-in only, no money/ranking semantics here).
  showOnLeaderboard: z.boolean().optional(),
  // Migration 225: DB-backed column on users (not JSONB). Written to users.email_booking_alerts.
  emailBookingAlerts: z.boolean().optional(),
}).strict();

router.get("/api/me/preferences", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const [me] = await db
      .select({ preferences: users.preferences, emailBookingAlerts: users.emailBookingAlerts })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!me) return res.status(401).json({ message: "Authentication required" });
    const prefs = (me.preferences as any) ?? {};
    // Migration 225: merge the DB-backed emailBookingAlerts column into the settings
    // payload so the client sees it alongside the JSONB preferences.
    res.json({
      ...(prefs.settings ?? {}),
      emailBookingAlerts: me.emailBookingAlerts ?? true,
    });
  } catch (err) {
    console.error("[me/preferences] read error:", err);
    res.status(500).json({ message: "Failed to load preferences" });
  }
});

router.patch("/api/me/preferences", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req)!;
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
      ...(patch.showOnLeaderboard !== undefined ? { showOnLeaderboard: patch.showOnLeaderboard } : {}),
      ...(patch.notifications
        ? { notifications: { ...(currentSettings.notifications ?? {}), ...patch.notifications } }
        : {}),
    };

    // Migration 225: emailBookingAlerts is a real column, not a JSONB key — split it out
    // of the settings merge and write it alongside (checked at every booking-alert send site).
    const columnUpdate: Record<string, unknown> = { preferences: { ...current, settings: nextSettings } };
    if (parsed.data.emailBookingAlerts !== undefined) {
      columnUpdate.emailBookingAlerts = parsed.data.emailBookingAlerts;
    }
    await db.update(users).set(columnUpdate as any).where(eq(users.id, userId));

    res.json({ ...nextSettings, ...(parsed.data.emailBookingAlerts !== undefined ? { emailBookingAlerts: parsed.data.emailBookingAlerts } : {}) });
  } catch (err) {
    console.error("[me/preferences] write error:", err);
    res.status(500).json({ message: "Failed to save preferences" });
  }
});

// ─── Storefront cover image (identity-hero rebuild) ──────────────────────────────────────────
//
// users.preferences is a namespaced jsonb; this owns ONLY its `storefront` key — the exact
// shallow-merge pattern ea.routes.ts uses for its `ea` sub-key (never the unrelated `settings`
// key /api/me/preferences above owns). §14: user from session only. No new column/migration —
// the cover image is optional earner-chosen decoration; gradient fallback renders when unset.

const httpsUrlSchema = z
  .string()
  .trim()
  .max(2048, "Cover image URL is too long")
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Cover image URL must be a valid https URL");

const storefrontPrefsPatchSchema = z.object({
  // Present + string → set; present + null → clear; absent → leave untouched.
  coverImageUrl: httpsUrlSchema.nullable().optional(),
  // Ruling 112 Q9: the Distribute storefront card edits handle & BIO together — bio is the
  // storefront's own intro line (users.bio, the column the public storefront read already
  // serves). Owner-authored profile prose; not an amount/identity/rate field.
  bio: z.string().trim().max(2000).nullable().optional(),
}).strict();

router.patch("/api/me/storefront", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const parsed = storefrontPrefsPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid storefront settings", errors: parsed.error.flatten() });
    }

    const [me] = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!me) return res.status(401).json({ message: "Authentication required" });

    const current = (me.preferences as any) ?? {};
    const currentStorefront = current.storefront ?? {};
    const patch = parsed.data;
    // Defense-in-depth (stored XSS): React auto-escapes on render, but future non-React
    // rendering paths (emails, PDFs, exports) may not — sanitize before persisting.
    if (typeof patch.bio === "string") patch.bio = sanitizeInput(patch.bio);
    const nextStorefront = {
      ...currentStorefront,
      ...(patch.coverImageUrl !== undefined ? { coverImageUrl: patch.coverImageUrl } : {}),
    };

    await db
      .update(users)
      .set({
        preferences: { ...current, storefront: nextStorefront },
        // Ruling 112 Q9: bio rides the same patch — present+string sets, present+null clears,
        // absent leaves untouched (the coverImageUrl contract, one column over).
        ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      })
      .where(eq(users.id, userId));

    res.json({ ...nextStorefront, ...(patch.bio !== undefined ? { bio: patch.bio } : {}) });
  } catch (err) {
    console.error("[me/storefront] write error:", err);
    res.status(500).json({ message: "Failed to save storefront settings" });
  }
});

// ─── Traveler travel preferences (H8) ────────────────────────────────────────────────────────
//
// users.preferences is a namespaced jsonb (migration 150); this owns ONLY its `travelPreferences`
// key — the same shallow-merge-a-sub-namespace pattern as `settings` (/api/me/preferences above)
// and `storefront` (/api/me/storefront above), never touching either. Fixes the profile page's
// "Preferred Travel Style" / "Budget Preference" chips, which previously had no onClick and no
// state — clicking did nothing and Save Changes never sent them (CLAUDE.md §13 decorative-control
// class). §14: user from session only, never body. No money path, no new column/migration.

const TRAVEL_STYLES = ["Adventure", "Relaxation", "Culture", "Food & Dining", "Nature", "Nightlife"] as const;
const BUDGET_PREFERENCES = ["Budget-Friendly", "Moderate", "Luxury"] as const;

const travelPreferencesPatchSchema = z.object({
  travelStyles: z.array(z.enum(TRAVEL_STYLES)).max(TRAVEL_STYLES.length).optional(),
  // Present + valid value → set; present + null → clear; absent → leave untouched.
  budgetPreference: z.enum(BUDGET_PREFERENCES).nullable().optional(),
}).strict();

router.get("/api/me/travel-preferences", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const [me] = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!me) return res.status(401).json({ message: "Authentication required" });
    const stored = ((me.preferences as any) ?? {}).travelPreferences ?? {};
    res.json({
      travelStyles: Array.isArray(stored.travelStyles) ? stored.travelStyles : [],
      budgetPreference: typeof stored.budgetPreference === "string" ? stored.budgetPreference : null,
    });
  } catch (err) {
    console.error("[me/travel-preferences] read error:", err);
    res.status(500).json({ message: "Failed to load travel preferences" });
  }
});

router.patch("/api/me/travel-preferences", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req)!;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const parsed = travelPreferencesPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid travel preferences", errors: parsed.error.flatten() });
    }

    const [me] = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!me) return res.status(401).json({ message: "Authentication required" });

    const current = ((me.preferences as any) ?? {});
    const currentTravel = current.travelPreferences ?? {};
    const patch = parsed.data;
    const nextTravel = {
      ...currentTravel,
      ...(patch.travelStyles !== undefined ? { travelStyles: patch.travelStyles } : {}),
      ...(patch.budgetPreference !== undefined ? { budgetPreference: patch.budgetPreference } : {}),
    };

    await db
      .update(users)
      .set({ preferences: { ...current, travelPreferences: nextTravel } })
      .where(eq(users.id, userId));

    res.json({
      travelStyles: Array.isArray(nextTravel.travelStyles) ? nextTravel.travelStyles : [],
      budgetPreference: typeof nextTravel.budgetPreference === "string" ? nextTravel.budgetPreference : null,
    });
  } catch (err) {
    console.error("[me/travel-preferences] write error:", err);
    res.status(500).json({ message: "Failed to save travel preferences" });
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
    const userId = getUserId(req)!;
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

// `activeLocale` (ruling 116 / P1 of the distribution-language audit): the viewer's resolved
// chrome locale, passed by the SPA as ?locale=. Applies the SAME ruling-60/115 content overlay
// GET /api/services/:id uses — an approved translation replaces the card's text when the viewer's
// locale differs from the listing's own source_locale; otherwise the honest original renders,
// flagged `shownInOriginal` so the client can label it (§13 — never silent, never machine-
// translated). Omitted (the OG-injection caller, crawlers) ⇒ no overlay, canonical content.
async function loadStorefront(handle: string, activeLocale?: string) {
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
      createdAt: users.createdAt,
      preferences: users.preferences,
      vacationUntil: users.vacationUntil,
      vacationMessage: users.vacationMessage,
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
      pricingUnit: providerServices.pricingUnit,
      deliveryMethod: providerServices.deliveryMethod,
      serviceImage: providerServices.serviceImage,
      averageRating: providerServices.averageRating,
      reviewCount: providerServices.reviewCount,
      // D5 (ratified Aug 10, 2026): text-only location chips on storefront cards. City-level
      // only — never the meeting point/address pre-purchase, and no map tiles here.
      city: providerServices.city,
      productShape: providerServices.productShape,
      // C3 (ruling 74/75): per-listing card display options rendered on the shared OfferingCard.
      // A provider who hides the price hides it everywhere — so the public storefront carries the
      // same two fields the Catalog Preview does. `bookingMode` is RESOLVED to a concrete value
      // below (the ONE derivation site), never returned null.
      showPrice: providerServices.showPrice,
      bookingMode: providerServices.bookingMode,
      // Ruling 115: the listing's declared source language (NULL = en) — drives the per-card
      // translation overlay below.
      sourceLocale: providerServices.sourceLocale,
    })
    .from(providerServices)
    .where(
      and(
        eq(providerServices.userId, owner.id),
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "active"),
      ),
    );

  // C3 (ruling 74/75): resolve each service's booking mode server-side, so the traveler card
  // always receives a CONCRETE value. This is THE ONE derivation site shared by both card reads
  // (the owner Catalog read enriches identically). An unset (NULL) listing inherits the account's
  // instant-booking flag — read here ONCE from service_provider_forms, never duplicated per row.
  // showPrice defaults true at the column, so it is already concrete (NULL only on a would-be
  // legacy row the DEFAULT covers; coalesce for safety).
  const [ownerForm] = await db
    .select({ instantBooking: serviceProviderForms.instantBooking })
    .from(serviceProviderForms)
    .where(eq(serviceProviderForms.userId, owner.id))
    .limit(1);
  const ownerInstantBooking = ownerForm?.instantBooking ?? false;
  let resolvedServices = services.map((s) => ({
    ...s,
    showPrice: s.showPrice ?? true,
    bookingMode: resolveBookingMode(s.bookingMode, ownerInstantBooking),
    // Set true below only when the viewer's locale differs from the card's source and no
    // approved translation exists — the client renders the honest one-line note (§13).
    shownInOriginal: false,
  }));

  // Ruling 115/116 content overlay — the storefront card follows the same rules as the detail
  // page it links to: approved rows only (a draft/AI-draft is NEVER shown to a traveler), name
  // overlaid where translated, honest original + flag where not. One batched query, not N.
  if (isContentLocale(activeLocale)) {
    const needing = resolvedServices.filter(
      (s) => effectiveSourceLocale(s.sourceLocale) !== activeLocale,
    );
    if (needing.length > 0) {
      const rows = await db
        .select({
          serviceId: serviceTranslations.serviceId,
          serviceName: serviceTranslations.serviceName,
        })
        .from(serviceTranslations)
        .where(
          and(
            inArray(serviceTranslations.serviceId, needing.map((s) => s.id)),
            eq(serviceTranslations.locale, activeLocale),
            eq(serviceTranslations.status, "approved"),
          ),
        );
      const byId = new Map(rows.map((r) => [r.serviceId, r]));
      resolvedServices = resolvedServices.map((s) => {
        if (effectiveSourceLocale(s.sourceLocale) === activeLocale) return s;
        const t = byId.get(s.id);
        // An approved row with a translated name overlays; an untranslated FIELD falls back to
        // the original (never blanked) — same field-level rule as the detail read.
        if (t?.serviceName) return { ...s, serviceName: t.serviceName };
        return { ...s, shownInOriginal: true };
      });
    }
  }

  // Lane 2: itinerary templates — approved + expert-published (§10 read-gate). Teaser fields only
  // (the content-gate: no itineraryData here, ever).
  const templates = await db
    .select({
      id: expertTemplates.id,
      title: expertTemplates.title,
      destination: expertTemplates.destination,
      price: expertTemplates.price,
      coverImage: expertTemplates.coverImage,
      duration: expertTemplates.duration,
      averageRating: expertTemplates.averageRating,
      reviewCount: expertTemplates.reviewCount,
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
      durationDays: readyMadeTrips.durationDays,
      insideCounts: readyMadeTrips.insideCounts,
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

  // Identity-hero fields (§13-honest, every value maps to a real row):
  //  - verified: the SAME identityVerificationStatus==='verified' signal already used for the
  //    "ID Verified" badge on /experts/:id and /services/:id (a completed Stripe Identity
  //    verification session — flips only via the identity webhook, never self-reported) and
  //    already computed above by isOwnerIdentityVerified for the V.1 gate. Reused, not
  //    reinvented, so the pill and the gate can never disagree.
  //  - location: resolveEarnerLocation above; null when no real field resolves — omitted
  //    client-side, never a guessed/derived location.
  //  - memberSince: users.createdAt, verbatim.
  //  - coverImageUrl: the earner's own storefront.coverImageUrl preference (see PATCH
  //    /api/me/storefront); null renders the gradient fallback.
  const [verified, location] = await Promise.all([
    isOwnerIdentityVerified(owner.id),
    resolveEarnerLocation(owner.id),
  ]);
  const coverImageUrl = ((owner.preferences as any)?.storefront?.coverImageUrl as string | undefined) ?? null;
  const memberSince = owner.createdAt ? owner.createdAt.toISOString() : null;

  // Vacation mode (§ above): non-null vacationUntil AND in the future = away. Business-level
  // flag only — the services/templates/readyMade arrays below are UNCHANGED by this; away
  // listings stay visible-not-bookable, enforcement happens at the booking path (checkout
  // claim), not by removing anything from this payload.
  const away =
    owner.vacationUntil && owner.vacationUntil.getTime() > Date.now()
      ? { until: owner.vacationUntil.toISOString(), message: owner.vacationMessage ?? null }
      : null;

  return {
    earner: {
      // Not sensitive — user ids are already public on /experts/:id and similar surfaces.
      // Lets the client (the "Message" CTA) open/create a chat thread with this earner and
      // detect the earner-viewing-their-own-storefront case (§14: only used for CTA gating,
      // never trusted as an identity/ownership decision on the server).
      id: owner.id,
      name: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Traveloure earner",
      bio: owner.bio ?? null,
      profileImageUrl: owner.profileImageUrl ?? null,
      role: owner.role,
      handle: owner.handle,
      averageRating: earnerAverageRating,
      reviewCount: totalReviews,
      verified,
      location,
      memberSince,
      coverImageUrl,
      offeringsCount: total,
    },
    services: resolvedServices,
    templates,
    readyMade,
    away,
  };
}

router.get("/api/storefront/:handle", async (req, res) => {
  try {
    const rawLocale = typeof req.query.locale === "string" ? req.query.locale : undefined;
    const data = await loadStorefront(req.params.handle, rawLocale);
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
    const shareUrl = `https://traveloure.com/p/${data.earner.handle}`;
    const ogImage =
      data.earner.coverImageUrl ??
      data.readyMade[0]?.heroImageUrl ??
      data.templates[0]?.coverImage ??
      data.earner.profileImageUrl ??
      `https://traveloure.com/og-cover.png`;

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const ogTags = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}" />`,
      `<meta property="og:type" content="profile" />`,
      `<link rel="canonical" href="${esc(shareUrl)}" />`,
      `<meta property="og:url" content="${esc(shareUrl)}" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:image" content="${esc(ogImage)}" />`,
      `<meta property="og:site_name" content="Traveloure" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
    ].join("\n    ");

    // ESM-safe template resolution (the dev runtime has no __dirname — a ReferenceError here
    // silently killed the injection via the catch/next()). Prod must serve the BUILT template
    // (hashed asset paths), so it wins whenever it exists under a production run.
    const clientTemplateDev = path.resolve(process.cwd(), "client", "index.html");
    const clientTemplateProd = path.resolve(process.cwd(), "dist", "public", "index.html");
    const templatePath =
      process.env.NODE_ENV === "production" && fs.existsSync(clientTemplateProd)
        ? clientTemplateProd
        : clientTemplateDev;
    if (!fs.existsSync(templatePath)) return next();

    let template = fs.readFileSync(templatePath, "utf-8");
    // Strip the template's own static og:title/og:description before injecting ours —
    // otherwise crawlers see duplicate tags (the injected pair still wins on order, but
    // duplicates are sloppy). Only sites that inject their own tags run this.
    template = template.replace(/<meta property="og:[^"]+"[^>]*>\s*/g, "");
    template = template.replace(/<meta name="twitter:[^"]+"[^>]*>\s*/g, "");
    template = template.replace(/<link rel="canonical"[^>]*>\s*/, "");
    template = template.replace(/<title>[\s\S]*?<\/title>\s*/, "");
    template = template.replace(/<meta name="description"[^>]*>\s*/, "");
    template = template.replace("<head>", `<head>\n    ${ogTags}`);
    // Dev-only: run the raw index.html through Vite's transform so the React-refresh
    // preamble/client injections are present (prod never registers a transformer, so this
    // is a no-op pass-through there).
    template = await transformDevHtml(req.originalUrl, template);
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
    const shareUrl = `https://traveloure.com/services/${service.id}`;
    // Managed covers are stored as `covers:${key}` — resolve to the absolute proxy URL.
    const resolvedServiceImage = service.serviceImage?.startsWith("covers:")
      ? `${req.protocol}://${req.get("host")}/api/services/${service.id}/cover-image`
      : service.serviceImage;
    const ogImage =
      resolvedServiceImage ??
      `https://traveloure.com/og-cover.png`;

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const ogTags = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}" />`,
      `<meta property="og:type" content="website" />`,
      `<link rel="canonical" href="${esc(shareUrl)}" />`,
      `<meta property="og:url" content="${esc(shareUrl)}" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:image" content="${esc(ogImage)}" />`,
      `<meta property="og:site_name" content="Traveloure" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
    ].join("\n    ");

    // ESM-safe template resolution (the dev runtime has no __dirname — a ReferenceError here
    // silently killed the injection via the catch/next()). Prod must serve the BUILT template
    // (hashed asset paths), so it wins whenever it exists under a production run.
    const clientTemplateDev = path.resolve(process.cwd(), "client", "index.html");
    const clientTemplateProd = path.resolve(process.cwd(), "dist", "public", "index.html");
    const templatePath =
      process.env.NODE_ENV === "production" && fs.existsSync(clientTemplateProd)
        ? clientTemplateProd
        : clientTemplateDev;
    if (!fs.existsSync(templatePath)) return next();

    let template = fs.readFileSync(templatePath, "utf-8");
    // Strip the template's own static og:title/og:description before injecting ours —
    // otherwise crawlers see duplicate tags (the injected pair still wins on order, but
    // duplicates are sloppy). Only sites that inject their own tags run this.
    template = template.replace(/<meta property="og:[^"]+"[^>]*>\s*/g, "");
    template = template.replace(/<meta name="twitter:[^"]+"[^>]*>\s*/g, "");
    template = template.replace(/<link rel="canonical"[^>]*>\s*/, "");
    template = template.replace(/<title>[\s\S]*?<\/title>\s*/, "");
    template = template.replace(/<meta name="description"[^>]*>\s*/, "");
    template = template.replace("<head>", `<head>\n    ${ogTags}`);
    // Dev-only: run the raw index.html through Vite's transform so the React-refresh
    // preamble/client injections are present (prod never registers a transformer, so this
    // is a no-op pass-through there).
    template = await transformDevHtml(req.originalUrl, template);
    return res.status(200).set({ "Content-Type": "text/html" }).end(template);
  } catch (err) {
    console.error("[storefront] OG injection error (service):", err);
    return next(); // fall through to SPA on any error
  }
});

// Server-side OG injection for /ready-made/:id — the `direct:*` link-preview format (F4,
// docs/backoffice/DISTRIBUTION_FORMATS.md): WhatsApp shares and /r/:code short-links land on
// this page, and crawlers never run the SPA's JS, so the preview card must be in the initial
// HTML. Same interception pattern as /p/:handle above. Gate mirrors the public read gate on
// GET /api/ready-made/:id (approved + active ONLY — an author's unapproved preview never gets
// OG data; it falls through to the default SPA shell). Every tag renders only real listing
// fields (§13): title, market, durationDays, planType; og:image only when heroImageUrl exists.
router.get("/ready-made/:id", async (req, res, next) => {
  try {
    const [listing] = await db
      .select({
        id: readyMadeTrips.id,
        title: readyMadeTrips.title,
        planType: readyMadeTrips.planType,
        planTypeCustom: readyMadeTrips.planTypeCustom,
        market: readyMadeTrips.market,
        durationDays: readyMadeTrips.durationDays,
        heroImageUrl: readyMadeTrips.heroImageUrl,
      })
      .from(readyMadeTrips)
      .where(
        and(
          eq(readyMadeTrips.id, req.params.id),
          eq(readyMadeTrips.status, "approved"),
          eq(readyMadeTrips.active, true),
        ),
      )
      .limit(1);

    if (!listing) return next(); // unapproved/unknown → default SPA shell (no draft oracle)

    // Migration 184: "custom" plan types carry their theme in planTypeCustom, not the closed
    // planType vocabulary — prefer it here so the OG description says "Kimono Rental Day Trip"
    // rather than "Custom…".
    const planLabel = (isCustomPlanType(listing.planType) && listing.planTypeCustom)
      ? listing.planTypeCustom
      : (planTypeLabel(listing.planType) ?? "trip plan");
    const title = `${listing.title} | Traveloure`;
    const description = `A ${listing.durationDays}-day ${planLabel.toLowerCase()} for ${listing.market}, expert-built on Traveloure — buy it and it becomes your own editable trip.`;
    const shareUrl = `https://traveloure.com/ready-made/${listing.id}`;
    const ogImage =
      listing.heroImageUrl ??
      `https://traveloure.com/og-cover.png`;

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const ogTags = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}" />`,
      `<meta property="og:type" content="website" />`,
      `<link rel="canonical" href="${esc(shareUrl)}" />`,
      `<meta property="og:url" content="${esc(shareUrl)}" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:image" content="${esc(ogImage)}" />`,
      `<meta property="og:site_name" content="Traveloure" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
    ].join("\n    ");

    // ESM-safe template resolution (the dev runtime has no __dirname — a ReferenceError here
    // silently killed the injection via the catch/next()). Prod must serve the BUILT template
    // (hashed asset paths), so it wins whenever it exists under a production run.
    const clientTemplateDev = path.resolve(process.cwd(), "client", "index.html");
    const clientTemplateProd = path.resolve(process.cwd(), "dist", "public", "index.html");
    const templatePath =
      process.env.NODE_ENV === "production" && fs.existsSync(clientTemplateProd)
        ? clientTemplateProd
        : clientTemplateDev;
    if (!fs.existsSync(templatePath)) return next();

    let template = fs.readFileSync(templatePath, "utf-8");
    // Strip the template's own static og:title/og:description before injecting ours —
    // otherwise crawlers see duplicate tags (the injected pair still wins on order, but
    // duplicates are sloppy). Only sites that inject their own tags run this.
    template = template.replace(/<meta property="og:[^"]+"[^>]*>\s*/g, "");
    template = template.replace(/<meta name="twitter:[^"]+"[^>]*>\s*/g, "");
    template = template.replace(/<link rel="canonical"[^>]*>\s*/, "");
    template = template.replace(/<title>[\s\S]*?<\/title>\s*/, "");
    template = template.replace(/<meta name="description"[^>]*>\s*/, "");
    template = template.replace("<head>", `<head>\n    ${ogTags}`);
    // Dev-only: run the raw index.html through Vite's transform so the React-refresh
    // preamble/client injections are present (prod never registers a transformer, so this
    // is a no-op pass-through there).
    template = await transformDevHtml(req.originalUrl, template);
    return res.status(200).set({ "Content-Type": "text/html" }).end(template);
  } catch (err) {
    console.error("[storefront] OG injection error (ready-made):", err);
    return next(); // fall through to SPA on any error
  }
});

// ── Notification email (migration 224) ─────────────────────────────────────
// GET  /api/me/notification-email  — return current value (null if unset)
// PATCH /api/me/notification-email — set or clear; earner-only, own record only

const notificationEmailSchema = z.object({
  notificationEmail: z
    .string()
    .email("Must be a valid email address")
    .max(255)
    .nullable()
    .optional(),
});

router.get("/api/me/notification-email", isAuthenticated, async (req: any, res) => {
  try {
    const userRole = req.user?.role ?? req.user?.claims?.role;
    if (!isEarnerRole(userRole)) {
      return res.status(403).json({ message: "Only experts and providers can set a notification email" });
    }
    const userId = getUserId(req)!;
    const [row] = await db
      .select({ notificationEmail: users.notificationEmail })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return res.json({ notificationEmail: row?.notificationEmail ?? null });
  } catch (err) {
    console.error("[notification-email] GET error:", err);
    return res.status(500).json({ message: "Failed to fetch notification email" });
  }
});

router.patch("/api/me/notification-email", isAuthenticated, async (req: any, res) => {
  try {
    const userRole = req.user?.role ?? req.user?.claims?.role;
    if (!isEarnerRole(userRole)) {
      return res.status(403).json({ message: "Only experts and providers can set a notification email" });
    }
    const userId = getUserId(req)!;
    const parsed = notificationEmailSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    }
    const { notificationEmail } = parsed.data;
    await db
      .update(users)
      .set({ notificationEmail: notificationEmail ?? null })
      .where(eq(users.id, userId));
    return res.json({ notificationEmail: notificationEmail ?? null });
  } catch (err) {
    console.error("[notification-email] PATCH error:", err);
    return res.status(500).json({ message: "Failed to update notification email" });
  }
});

export default router;
