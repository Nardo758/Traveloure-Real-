/**
 * storefront.routes.ts — public earner storefront (backoffice Phase 1a/1b).
 *
 * The mockup's "/s/{handle}" identity layer (docs/backoffice/mockups/mockup-offering-page.html,
 * mockup-backoffice-dashboard.html). Three surfaces:
 *   PATCH /api/me/handle          — claim/change the caller's handle (§14: user from session only)
 *   GET   /api/storefront/:handle — public JSON: earner profile + APPROVED offerings across the
 *                                   two lanes (provider_services / ready_made_trips). The third
 *                                   lane (`expert_templates`) retired with that product, response
 *                                   key included — ledger 2026-09-03-expert-templates-consumer-sunset.
 *   GET   /s/:handle              — server-side OG-injected HTML shell (the trips.routes.ts
 *   GET   /p/:handle              — legacy alias redirecting to the canonical /s/:handle route
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
import { loadLiveStatus } from "../services/live-status.service";
import { Router } from "express";
import { zodErrorBody } from "../utils/zod-error-body";
import { getUserId, getDbRole } from "../utils/auth";
import { sanitizeInput } from "../utils/sanitize";
import { z } from "zod";
import { HANDLE_RE, HANDLE_MIN_LENGTH, HANDLE_MAX_LENGTH, normalizeHandle } from "@shared/handle";
import { resolveEarnerByHandle } from "../services/contact-rails.service";
import { isBusinessVerificationStatus, isOwnerIdentityVerified } from "../utils/earner-verification";
import { isExpertHireable } from "../services/booking-actions.service";
import fs from "fs";
import path from "path";
import { eq, and, sql, inArray, isNotNull, desc } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, readyMadeTrips, localExpertForms, serviceProviderForms, serviceReviews, expertNeighborhoods, cityNeighborhoods, resolveBookingMode, serviceTranslations, travelPulseHiddenGems } from "@shared/schema";
import { isContentLocale, effectiveSourceLocale } from "../services/service-translation.service";
// L23 (brief §11.5, ruling 9): the ONE author of a buy button, shipped on each card.
import { buildListingBuyActions, resolveBuyerState } from "../services/buy-action-payload";
import type { BuyActionBuyer } from "@shared/buy-action";
// Vacation mode (provider back-office wave, migration 189, decision-maker ratified Aug 9 2026):
// business-level flag only, read here for the storefront's `away` field — never touches
// providerServices/readyMadeTrips rows or their approval/status columns.
import { EARNER_ROLES as CANONICAL_EARNER_ROLES, isEarnerRole, isExpertRole, isProviderRole } from "@shared/roles";
import { planTypeLabel, isCustomPlanType } from "@shared/ready-made-plan-types";
import { transformDevHtml } from "../vite-dev-html";
import { RECORD_BOOKING_STATUSES } from "@shared/booking-visibility";
import { lowestListedPrice } from "@shared/listing-price";
import { directoryCardListings, type DirectoryListingFacts } from "../services/provider-directory-listings";
import { loadEarnerRatings, summarizeApprovedRatings } from "../services/earner-rating.service";
import { updateUserPreferences } from "../services/user-preferences-writer";
import { injectIntoHead } from "../utils/html-head";

const router = Router();

const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ message: "Authentication required" });
};

// Roles allowed to claim a storefront handle — the canonical earner set (shared/roles.ts)
// plus legacy bare "provider" tolerated as a permissive allow (V.4 both-spellings posture;
// no canonical write path produces it, but a grandfathered row shouldn't lose its handle).
const EARNER_ROLES = new Set<string>([...CANONICAL_EARNER_ROLES, "provider"]);

// Reserved first segments: platform vocabulary + abuse-prone names. A handle lives under /s/ so
// route collisions are impossible; this list protects brand/impersonation surface.
const RESERVED_HANDLES = new Set([
  "admin", "administrator", "api", "traveloure", "official", "support", "help",
  "staff", "team", "moderator", "mod", "root", "system", "security", "billing",
  "payments", "legal", "privacy", "terms", "about", "contact", "discover",
  "experts", "expert", "provider", "providers", "services", "service", "trips",
  "trip", "booking", "bookings", "checkout", "cart", "login", "signup", "signin",
  "register", "settings", "dashboard", "me", "you", "null", "undefined", "test",
]);

// lowercase alnum + hyphens, 3–30 chars, no leading/trailing/double hyphen. Moved to
// `shared/handle.ts` by ledger `2026-09-05-user-id-is-internal`: the contact start rail addresses
// an earner BY HANDLE and needs the same shape, and a second copy of it is the derivation-drift
// class §18 rule 1 names. Re-exported here so the existing local references are unchanged.

const claimSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    // §18 rule 1: the bounds come from `shared/handle.ts` — the module that owns HANDLE_RE, which
    // is what actually decides. Re-typed literals here would be a second authority.
    .min(HANDLE_MIN_LENGTH, `Handle must be at least ${HANDLE_MIN_LENGTH} characters`)
    .max(HANDLE_MAX_LENGTH, `Handle must be at most ${HANDLE_MAX_LENGTH} characters`),
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
      // unique_violation → someone else owns it. Drizzle wraps the driver error, so the pg code
      // lives on `.cause` (see e2e-test-accounts purge fix); read both or a real 23505 reads as 500.
      if ((e?.code ?? e?.cause?.code) === "23505") {
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

// V.1 — has this owner completed identity verification on EITHER form? MOVED to
// `server/utils/earner-verification.ts` by ledger `2026-09-05-user-id-is-internal`: the contact
// start rail's recipient card shows the same pill, and a second copy of the predicate is the
// derivation-drift class §18 rule 1 names. Imported above; behaviour unchanged.

// Storefront identity-hero location (§13-honest): prefers the admin-managed neighborhood
// assignment (expertNeighborhoods → city_neighborhoods — the Kyoto lead-vetting table, isLead
// first), falling back to the local-expert onboarding form's own city/country, then (intake-
// fixes C4, migration 261) the provider form's discrete city/country. A provider row with a
// NULL city (every pre-260 application — the intake used to concatenate the city into the
// free-text address and lose it) still returns null and the client omits the location line —
// no fabricated/derived location is ever shown, never a city parsed out of free text (§13).
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

  const [providerForm] = await db
    .select({ city: serviceProviderForms.city, country: serviceProviderForms.country })
    .from(serviceProviderForms)
    .where(eq(serviceProviderForms.userId, userId))
    .limit(1);
  if (providerForm?.city) {
    return providerForm.country ? `${providerForm.city}, ${providerForm.country}` : providerForm.city;
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

    const patch = parsed.data;
    // The ONE locked writer (`user-preferences-writer.ts`): the merge runs on the value read
    // under the row lock, so a concurrent save to another key can no longer be overwritten.
    const nextSettings = await updateUserPreferences(userId, (current) => {
      const currentSettings = current.settings ?? {};
      const merged = {
        ...currentSettings,
        ...(patch.language !== undefined ? { language: patch.language } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.showOnLeaderboard !== undefined ? { showOnLeaderboard: patch.showOnLeaderboard } : {}),
        ...(patch.notifications
          ? { notifications: { ...(currentSettings.notifications ?? {}), ...patch.notifications } }
          : {}),
      };
      return {
        preferences: { ...current, settings: merged },
        // Migration 225: emailBookingAlerts is a real column, not a JSONB key — written in the
        // same statement (checked at every booking-alert send site).
        columns: patch.emailBookingAlerts !== undefined ? { emailBookingAlerts: patch.emailBookingAlerts } : undefined,
        result: merged,
      };
    });
    if (!nextSettings) return res.status(401).json({ message: "Authentication required" });

    res.json({ ...nextSettings, ...(patch.emailBookingAlerts !== undefined ? { emailBookingAlerts: patch.emailBookingAlerts } : {}) });
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

    const patch = parsed.data;
    // Defense-in-depth (stored XSS): React auto-escapes on render, but future non-React
    // rendering paths (emails, PDFs, exports) may not — sanitize before persisting.
    if (typeof patch.bio === "string") patch.bio = sanitizeInput(patch.bio);

    // The ONE locked writer (`user-preferences-writer.ts`) — see the settings route above.
    const nextStorefront = await updateUserPreferences(userId, (current) => {
      const merged = {
        ...(current.storefront ?? {}),
        ...(patch.coverImageUrl !== undefined ? { coverImageUrl: patch.coverImageUrl } : {}),
      };
      return {
        preferences: { ...current, storefront: merged },
        // Ruling 112 Q9: bio rides the same patch — present+string sets, present+null clears,
        // absent leaves untouched (the coverImageUrl contract, one column over).
        columns: patch.bio !== undefined ? { bio: patch.bio } : undefined,
        result: merged,
      };
    });
    if (!nextStorefront) return res.status(401).json({ message: "Authentication required" });

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

    const patch = parsed.data;
    // The ONE locked writer (`user-preferences-writer.ts`) — see the settings route above.
    const nextTravel = await updateUserPreferences(userId, (current) => {
      const merged: Record<string, any> = {
        ...(current.travelPreferences ?? {}),
        ...(patch.travelStyles !== undefined ? { travelStyles: patch.travelStyles } : {}),
        ...(patch.budgetPreference !== undefined ? { budgetPreference: patch.budgetPreference } : {}),
      };
      return { preferences: { ...current, travelPreferences: merged }, result: merged };
    });
    if (!nextTravel) return res.status(401).json({ message: "Authentication required" });

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

    // Offerings across the two live lanes (same owner columns + approved criteria as the
    // public storefront gates above: F2 for services, migration-133 status for Ready Made
    // Trips). The `expert_templates` lane retired — ledger
    // 2026-09-03-expert-templates-consumer-sunset.
    const [svcAgg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where ${providerServices.approvalStatus} = 'approved')::int`,
      })
      .from(providerServices)
      .where(eq(providerServices.userId, me.id));
    const [rmtAgg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where ${readyMadeTrips.status} = 'approved')::int`,
      })
      .from(readyMadeTrips)
      .where(eq(readyMadeTrips.authorId, me.id));

    const offeringsTotal = (svcAgg?.total ?? 0) + (rmtAgg?.total ?? 0);
    const offeringsApproved = (svcAgg?.approved ?? 0) + (rmtAgg?.approved ?? 0);

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
      storefrontPath: me.handle ? `/s/${me.handle}` : null,
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
// Exported for storefront-gems-shared.db.test.ts (ruling 7 proof) — route callers unchanged.
/**
 * L23: `buyer` is OPTIONAL and there is deliberately no default. A buy action is a statement about
 * a specific buyer, so a caller that has no buyer to speak of — the OG shell, the legacy redirects
 * — gets NO `buyAction` on its rows rather than a guest-shaped one, which would be a claim about
 * somebody the caller never saw (§13). Only the JSON read the SPA calls resolves a buyer.
 */
type StorefrontOwner = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  role: string | null;
  handle: string | null;
  createdAt: Date | null;
  preferences: unknown;
  vacationUntil: Date | null;
  vacationMessage: string | null;
};

const storefrontOwnerFields = {
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
};

async function findStorefrontOwnerByHandle(handle: string): Promise<StorefrontOwner | null> {
  // "Which earner does this handle name?" is answered ONCE, by `resolveEarnerByHandle` — the same
  // resolver the contact start rail and the advisors rail use (§18 rule 1): normalized handle, not
  // deleted, not suspended, an earner role. This page then reads that earner's storefront fields by
  // id. A malformed handle is refused before any query, as it always was.
  if (!HANDLE_RE.test(normalizeHandle(handle))) return null;
  const earner = await resolveEarnerByHandle(handle);
  return earner ? findStorefrontOwnerById(earner.id) : null;
}

async function findStorefrontOwnerById(id: string): Promise<StorefrontOwner | null> {
  const [owner] = await db
    .select(storefrontOwnerFields)
    .from(users)
    .where(and(eq(users.id, id), eq(users.isDeleted, false), eq(users.isSuspended, false)))
    .limit(1);
  return owner ?? null;
}

async function loadStorefrontFromOwner(
  owner: StorefrontOwner,
  activeLocale?: string,
  buyer?: BuyActionBuyer,
  enforcePublicGates = true,
) {
  // The canonical storefront serves every public earner family. Inventory remains governed by
  // the existing approved/active predicates below, so role unification never widens what is
  // publishable; it only gives providers and experts one stable public URL.
  if (!isExpertRole(owner.role) && !isProviderRole(owner.role)) return null;

  // V.1 — enabled by admin flipping platform_settings.storefront_require_verified to "true" once
  // V.2/V.3 verification-flow sequencing lands; build-while-pending preserved (handle claim + the
  // owner's own console are never gated here — only this public read path). Default "false"
  // keeps today's behavior unchanged.
  if (enforcePublicGates && (await isStorefrontVerificationRequired())) {
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
      // Storefront booking panel (ledger `2026-09-23-storefront-booking-panel`): the panel states a
      // lead time or a cancellation policy ONLY when every listing agrees, so it needs each row's
      // own answer. Both are the listing's public terms (the detail page already shows them); NULL
      // = not declared, and the panel then says nothing (§13).
      leadTimeHours: providerServices.leadTimeHours,
      cancellationPolicyType: providerServices.cancellationPolicyType,
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
  const [[ownerForm], [expertProfile]] = await Promise.all([
    db
      .select({
        instantBooking: serviceProviderForms.instantBooking,
        hasInsurance: serviceProviderForms.hasInsurance,
        businessName: serviceProviderForms.businessName,
        businessType: serviceProviderForms.businessType,
        businessVerificationStatus: serviceProviderForms.businessVerificationStatus,
      })
      .from(serviceProviderForms)
      .where(eq(serviceProviderForms.userId, owner.id))
      .limit(1),
    isExpertRole(owner.role)
      ? db
          .select({
            destinations: localExpertForms.destinations,
            specialties: localExpertForms.specialties,
            languages: localExpertForms.languages,
            neighborhoods: localExpertForms.neighborhoods,
            localSpecialties: localExpertForms.localSpecialties,
            responseTime: localExpertForms.responseTime,
            headline: localExpertForms.headline,
            formBio: localExpertForms.bio,
            status: localExpertForms.status,
          })
          .from(localExpertForms)
          .where(eq(localExpertForms.userId, owner.id))
          .limit(1)
      : Promise.resolve([]),
  ]);

  // The legacy no-handle profile existed only for approved expert applications. It may render
  // without inventory, but pending, rejected, and missing-form profiles remain private.
  if (!owner.handle && isExpertRole(owner.role) && expertProfile?.status !== "approved") return null;

  // Approved review rows are the rating authority. Listing aggregates can be stale or fixture-
  // written, so neither the profile nor cards may derive public review claims from them.
  const approvedReviewRows = await db
    .select({
      id: serviceReviews.id,
      serviceId: serviceReviews.serviceId,
      rating: serviceReviews.rating,
      reviewText: serviceReviews.reviewText,
      responseText: serviceReviews.responseText,
      providerReply: serviceReviews.providerReply,
      isVerified: serviceReviews.isVerified,
      createdAt: serviceReviews.createdAt,
      serviceName: providerServices.serviceName,
    })
    .from(serviceReviews)
    .leftJoin(providerServices, eq(serviceReviews.serviceId, providerServices.id))
    .where(
      and(
        eq(serviceReviews.providerId, owner.id),
        eq(serviceReviews.status, "approved"),
      ),
    )
    .orderBy(desc(serviceReviews.createdAt));
  const publicServiceIds = new Set(services.map((service) => service.id));
  const serviceReviewRows = approvedReviewRows.filter((review) =>
    publicServiceIds.has(review.serviceId),
  );
  const reviews = serviceReviewRows.slice(0, 24).map((review) => ({
    id: review.id,
    rating: Number(review.rating),
    comment: review.reviewText,
    createdAt: review.createdAt,
    serviceName: review.serviceName,
    providerReply: review.providerReply ?? review.responseText,
    isVerified: review.isVerified ?? false,
  }));

  const ownerInstantBooking = ownerForm?.instantBooking ?? false;
  // L23 (brief §11.5, ruling 9 — register §A4): the ONE resolver authors each card's buy button and
  // its landing rule, computed here and shipped on the row; the storefront draws it and never
  // decides for itself. `isLive` is true by construction — the select above is already gated on
  // `approval_status='approved' AND status='active'`. Two batched queries for the whole storefront.
  const storefrontBuyActions = buyer
    ? await buildListingBuyActions(
        services.map((s) => ({
          id: s.id,
          ownerUserId: owner.id,
          bookingMode: s.bookingMode,
          deliveryMethod: s.deliveryMethod,
          productShape: s.productShape,
          price: s.price,
          isLive: true,
        })),
        buyer,
      )
    : null;
  let resolvedServices = services.map((s) => ({
    ...s,
    averageRating: null as string | null,
    reviewCount: 0,
    showPrice: s.showPrice ?? true,
    bookingMode: resolveBookingMode(s.bookingMode, ownerInstantBooking),
    buyAction: storefrontBuyActions?.get(s.id),
    // Set true below only when the viewer's locale differs from the card's source and no
    // approved translation exists — the client renders the honest one-line note (§13).
    shownInOriginal: false,
  }));
  const serviceReviewFacts = new Map<string, { ratingTotal: number; count: number }>();
  for (const review of serviceReviewRows) {
    const facts = serviceReviewFacts.get(review.serviceId) ?? { ratingTotal: 0, count: 0 };
    facts.ratingTotal += Number(review.rating);
    facts.count += 1;
    serviceReviewFacts.set(review.serviceId, facts);
  }
  resolvedServices = resolvedServices.map((service) => {
    const facts = serviceReviewFacts.get(service.id);
    return {
      ...service,
      averageRating: facts ? (facts.ratingTotal / facts.count).toFixed(2) : null,
      reviewCount: facts?.count ?? 0,
    };
  });

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

  // Lane 2 (itinerary templates) RETIRED — ledger 2026-09-03-expert-templates-consumer-sunset.
  // The lane is gone from the query, the offering total and the response body; no
  // `expert_templates` row can reach a public page.

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

  const total = services.length + readyMade.length;
  // No approved inventory → no public page (an unvetted earner is not publishable).
  if (enforcePublicGates && total === 0) return null;

  // The earner's rating is the ONE rule every surface uses (`earner-rating.service.ts`, board task
  // #1665): the mean of all their approved review rows. The /providers card and /experts read it too.
  const { averageRating: earnerAverageRating, reviewCount: expertReviewCount } =
    summarizeApprovedRatings(approvedReviewRows.map((review) => review.rating));
  const serviceReviewCount = serviceReviewRows.length;

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
  const [verified, location, gemsSharedRows, acceptsPlanShares] = await Promise.all([
    isOwnerIdentityVerified(owner.id),
    resolveEarnerLocation(owner.id),
    // "{N} gems shared" (2026-08-29-replit-gem-audit ruling 7): gems ATTRIBUTED
    // to this earner — curated_by_expert_id, the same column the byline and the
    // promotion rail write (rulings 1+4), so every counted gem is one that is
    // live and carries this earner's attribution. A real count or nothing: the
    // client renders the tile only when > 0 (§13 — never a padded zero).
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(travelPulseHiddenGems)
      .where(eq(travelPulseHiddenGems.curatedByExpertId, owner.id)),
    // Whether the booking panel may offer "Share my plan": the SAME predicate the advisors rail
    // answers with (`isExpertHireable` — an approved expert profile, not the platform's reserved
    // concierge account). A panel that offered a share the server refuses would be a dead button.
    isExpertRole(owner.role) ? isExpertHireable(owner.id) : Promise.resolve(false),
  ]);
  const gemsSharedCount = gemsSharedRows[0]?.count ?? 0;
  const coverImageUrl = ((owner.preferences as any)?.storefront?.coverImageUrl as string | undefined) ?? null;
  const memberSince = owner.createdAt ? owner.createdAt.toISOString() : null;

  // Vacation mode (§ above): non-null vacationUntil AND in the future = away. Business-level
  // flag only — the services/readyMade arrays below are UNCHANGED by this; away
  // listings stay visible-not-bookable, enforcement happens at the booking path (checkout
  // claim), not by removing anything from this payload.
  const away =
    owner.vacationUntil && owner.vacationUntil.getTime() > Date.now()
      ? { until: owner.vacationUntil.toISOString(), message: owner.vacationMessage ?? null }
      : null;

  // Locked Decision 54: the same live status the /experts list shows (one loader, §18 rule 1).
  const live = (await loadLiveStatus([owner.id])).get(owner.id);

  return {
    earner: {
      // NO `id`. CLAUDE.md Locked Decision 40 (ledger `2026-09-05-user-id-is-internal`), lane 2:
      // `users.id` is INTERNAL and an earner's PUBLIC identity is `handle` (below) — what
      // `/s/:handle` serves and what a person can be told out loud. A published id is a durable
      // cross-surface identifier for a person that they never chose and cannot rotate.
      //
      // The comment that stood here before lane 1 claimed the id was not sensitive BECAUSE other
      // surfaces published it too. That reasoning is circular, it is how the field spread, and it
      // is retracted — lane 1 rewrote it, lane 3 switched every consumer, and this lane removed
      // the field. `owner.id` is still read INSIDE this function
      // (the inventory queries, `resolveEarnerLocation`, `isOwnerIdentityVerified`) — internal use
      // is the point of an internal key. It just never leaves.
      //
      // To open a thread with this earner: `POST /api/conversations/start` with `{ handle }`,
      // which resolves the recipient server-side and returns no user id at all. Do not re-add an
      // id here — `scripts/check-public-user-id.cjs` fails if you do.
      name: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "Traveloure earner",
      bio: owner.bio ?? expertProfile?.formBio ?? null,
      profileImageUrl: owner.profileImageUrl ?? null,
      role: owner.role,
      handle: owner.handle,
      averageRating: earnerAverageRating,
      reviewCount: expertReviewCount,
      expertReviewCount,
      serviceReviewCount,
      verified,
      location,
      memberSince,
      coverImageUrl,
      offeringsCount: total,
      // Ruling 7: attributed gems only; the client renders "{N} gems shared"
      // solely when > 0.
      gemsSharedCount,
      // Storefront booking panel (ledger `2026-09-23-storefront-booking-panel`). Both are the
      // earner's OWN declarations, verbatim; NULL = not stated, and the page says nothing.
      // `hasInsurance` is a provider form's self-declared flag — rendered as "Insured" only when
      // `true`, never as "Not insured" (§13: absence of a declaration is not a denial).
      responseTime: expertProfile?.responseTime ?? null,
      // Locked Decision 54: the earner's own "Available now" switch (vacation wins) and the
      // MEASURED reply bucket — null when too few conversations or too slow to advertise (§13).
      availableNow: live?.availableNow ?? false,
      replyTime: live?.replyTime ?? null,
      hasInsurance: isProviderRole(owner.role) ? ownerForm?.hasInsurance ?? null : null,
      // The BUSINESS behind a provider storefront (ledger `2026-09-23-storefront-business-identity`),
      // the same three facts the /providers card shows so the card and the page it opens agree.
      // The provider's own form declarations, trimmed; NULL = not stated, and the page falls back
      // to the person's name and shows no type (§13). An expert storefront carries none of them.
      businessName: isProviderRole(owner.role) ? ownerForm?.businessName?.trim() || null : null,
      businessType: isProviderRole(owner.role) ? ownerForm?.businessType?.trim() || null : null,
      businessVerified: isProviderRole(owner.role)
        ? isBusinessVerificationStatus(ownerForm?.businessVerificationStatus)
        : false,
      acceptsPlanShares,
      specialties: Array.isArray(expertProfile?.specialties) ? expertProfile.specialties : [],
      destinations: Array.isArray(expertProfile?.destinations) ? expertProfile.destinations : [],
      languages: Array.isArray(expertProfile?.languages) ? expertProfile.languages : [],
      neighborhoods: Array.isArray(expertProfile?.neighborhoods) ? expertProfile.neighborhoods : [],
      localSpecialties: Array.isArray(expertProfile?.localSpecialties) ? expertProfile.localSpecialties : [],
      headline: expertProfile?.headline ?? null,
    },
    services: resolvedServices,
    readyMade,
    reviews,
    away,
  };
}

export async function loadStorefront(handle: string, activeLocale?: string, buyer?: BuyActionBuyer) {
  const owner = await findStorefrontOwnerByHandle(handle);
  return owner ? loadStorefrontFromOwner(owner, activeLocale, buyer) : null;
}

export async function loadStorefrontById(id: string, activeLocale?: string, buyer?: BuyActionBuyer) {
  const owner = await findStorefrontOwnerById(id);
  if (!owner) return null;
  // The waived gates exist for ONE case: the legacy no-handle EXPERT profile, which renders without
  // inventory and is gated instead by an approved expert form (checked inside the loader). Nothing
  // else earns the waiver — a handle-less PROVIDER with no approved inventory is exactly the
  // "unvetted earner" the inventory gate keeps off the public web (ledger
  // `2026-09-23-storefront-price-cents`), so it keeps the gate and answers 404.
  const waiveInventoryGates = !owner.handle && isExpertRole(owner.role);
  return loadStorefrontFromOwner(owner, activeLocale, buyer, !waiveInventoryGates);
}

// Deprecated compatibility loader for callers of /api/provider-storefront/:handle. The canonical
// loader is role-agnostic; this wrapper keeps the old API's narrow { earner, services, away }
// response shape without maintaining a second, drift-prone implementation.
async function loadProviderStorefront(handle: string, activeLocale?: string) {
  const data = await loadStorefront(handle, activeLocale);
  if (!data || !isProviderRole(data.earner.role)) return null;
  return {
    earner: data.earner,
    services: data.services,
    away: data.away,
  };
}

// Public provider directory (/providers). Each row describes a BUSINESS: who runs it, what it
// sells and whether anyone has booked it (ledger `2026-09-23-provider-directory-card`). Everything
// on a row is already public on that provider's storefront — listing names and prices under the
// same approved + active gate, the business name and type from the provider's own form, the
// Stripe-derived business-verification flag the service page's badge already shows. What stays
// server-side: `users.id` (LD 40), every booking COUNT (the card shows an order and at most one
// "Most booked" tag, never a number) and the per-listing rating used only to break ties.
function allInstant(modes: readonly string[]): boolean {
  const bookable = modes.filter((mode) => mode !== "hidden");
  return bookable.length > 0 && bookable.every((mode) => mode === "instant");
}

async function loadProviderStorefrontDirectory() {
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      handle: users.handle,
      bio: users.bio,
      profileImageUrl: users.profileImageUrl,
      serviceCount: sql<number>`count(distinct ${providerServices.id})::int`,
    })
    .from(users)
    .innerJoin(
      providerServices,
      and(
        eq(providerServices.userId, users.id),
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "active"),
      ),
    )
    .where(
      and(
        eq(users.role, "service_provider"),
        eq(users.isDeleted, false),
        eq(users.isSuspended, false),
        isNotNull(users.handle),
        // No test-account filter here, deliberately: in production the boot purge
        // (`purgeE2EAccountsFromProd`, server/index.ts) already demotes every `@traveloure.test`
        // account to role `user` — which this role gate drops — and deletes it where it can. Dev,
        // staging and CI keep them on purpose. A second copy of that decision here would be the
        // drift §18 rule 1 names.
      ),
    )
    .groupBy(
      users.id,
      users.firstName,
      users.lastName,
      users.handle,
      users.bio,
      users.profileImageUrl,
    );

  const ownerIds = rows.map((row) => row.id);
  // The card's Rating is the ONE earner-rating rule (`earner-rating.service.ts`, board task #1665),
  // the same figure the storefront it links to shows — not a second aggregate computed here.
  const ratings = await loadEarnerRatings(ownerIds);
  const [forms, listingRows] = ownerIds.length === 0
    ? [[], []]
    : await Promise.all([
        db
          .select({
            userId: serviceProviderForms.userId,
            businessName: serviceProviderForms.businessName,
            businessType: serviceProviderForms.businessType,
            instantBooking: serviceProviderForms.instantBooking,
            businessVerificationStatus: serviceProviderForms.businessVerificationStatus,
          })
          .from(serviceProviderForms)
          .where(inArray(serviceProviderForms.userId, ownerIds)),
        // The SAME approved + active gate as the storefront's own inventory read. Booking counts
        // use `RECORD_BOOKING_STATUSES` — "what may be listed as a real booking" — so an unpaid
        // claim, a cancellation or a refund never makes a listing look popular.
        db
          .select({
            id: providerServices.id,
            userId: providerServices.userId,
            name: providerServices.serviceName,
            price: providerServices.price,
            showPrice: providerServices.showPrice,
            priceType: providerServices.priceType,
            pricingUnit: providerServices.pricingUnit,
            bookingMode: providerServices.bookingMode,
            createdAt: providerServices.createdAt,
            // Correlated subqueries with EXPLICITLY qualified columns: drizzle renders a bare
            // column reference inside a select-list `sql` fragment unqualified, and an unqualified
            // `"id"` inside the subquery binds to the booking's own id — every count reads zero.
            bookingCount: sql<number>`(
              select count(*)::int from service_bookings sb
              where sb.service_id = "provider_services"."id"
                and sb.status in (${sql.join(RECORD_BOOKING_STATUSES.map((status) => sql`${status}`), sql`, `)})
            )`,
            averageRating: sql<number | null>`(
              select avg(sr.rating)::float8 from service_reviews sr
              where sr.service_id = "provider_services"."id"
                and sr.status = 'approved'
            )`,
          })
          .from(providerServices)
          .where(
            and(
              inArray(providerServices.userId, ownerIds),
              eq(providerServices.approvalStatus, "approved"),
              eq(providerServices.status, "active"),
            ),
          ),
      ]);

  const formByOwner = new Map(forms.map((form) => [form.userId, form]));
  const listingsByOwner = new Map<string, DirectoryListingFacts[]>();
  const modesByOwner = new Map<string, string[]>();
  for (const listing of listingRows) {
    if (!listing.userId) continue;
    // `resolveBookingMode` is THE one derivation of a listing's mode (C3), the same call the
    // storefront card makes; a NULL listing inherits the account's instant-booking flag.
    const modes = modesByOwner.get(listing.userId) ?? [];
    modes.push(resolveBookingMode(listing.bookingMode, formByOwner.get(listing.userId)?.instantBooking ?? false));
    modesByOwner.set(listing.userId, modes);
    const bucket = listingsByOwner.get(listing.userId) ?? [];
    bucket.push({
      id: listing.id,
      name: listing.name,
      price: listing.price,
      showPrice: listing.showPrice,
      priceType: listing.priceType,
      pricingUnit: listing.pricingUnit,
      bookingCount: Number(listing.bookingCount ?? 0),
      averageRating: listing.averageRating == null ? null : Number(listing.averageRating),
      createdAt: listing.createdAt,
    });
    listingsByOwner.set(listing.userId, bucket);
  }

  // NO `id` on a directory row (LD 40 lane 2). Every row here is a provider WITH a claimed handle
  // — the query's `isNotNull(users.handle)` makes that true by construction — so `handle` is the
  // row's public identity AND its stable client key. `row.id` stays a local join key for
  // `resolveEarnerLocation` below; it just never reaches the wire.
  return Promise.all(rows.map(async (row) => {
    const form = formByOwner.get(row.id);
    const listings = listingsByOwner.get(row.id) ?? [];
    const businessName = form?.businessName?.trim() || null;
    const category = form?.businessType?.trim() || null;
    return {
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || "Traveloure provider",
      handle: row.handle,
      bio: row.bio ?? null,
      profileImageUrl: row.profileImageUrl ?? null,
      serviceCount: Number(row.serviceCount),
      averageRating: ratings.get(row.id)?.averageRating ?? null,
      reviewCount: ratings.get(row.id)?.reviewCount ?? 0,
      location: await resolveEarnerLocation(row.id),
      // The provider's own declarations; NULL = not stated and the card says nothing (§13).
      businessName,
      category,
      // "Instant booking" is a claim about the BUSINESS, so it is made only when every bookable
      // listing confirms instantly; enquiry-only (`hidden`) listings say nothing either way, and a
      // provider with no bookable listing makes no claim (§13).
      instantBooking: allInstant(modesByOwner.get(row.id) ?? []),
      // The ONE business-verification predicate (`server/utils/earner-verification.ts`) the service
      // page's badge and the storefront header read too: Stripe-derived, never self-reported.
      businessVerified: isBusinessVerificationStatus(form?.businessVerificationStatus),
      // Over EVERY listing, not only the three named below (`@shared/listing-price`, one rule).
      fromPrice: lowestListedPrice(listings),
      listings: directoryCardListings(listings),
    };
  }));
}

router.get(["/experts/:id", "/local-experts/:id"], async (req, res, next) => {
  try {
    const owner = await findStorefrontOwnerById(req.params.id);
    if (owner?.handle) {
      const query = req.originalUrl.includes("?")
        ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
        : "";
      return res.redirect(308, `/s/${owner.handle}${query}`);
    }
    return next();
  } catch (error) {
    console.error("[storefront/legacy-redirect] lookup failed:", error);
    return next();
  }
});

// public-user-id-ok: legacy compatibility lookup only; the response omits users.id.
router.get("/api/storefront/by-id/:id", async (req, res) => {
  try {
    const rawLocale = typeof req.query.locale === "string" ? req.query.locale : undefined;
    const data = await loadStorefrontById(req.params.id, rawLocale, await resolveBuyerState(req));
    if (!data) return res.status(404).json({ message: "Storefront not found" });
    return res.json(data);
  } catch (error: any) {
    console.error("[storefront/by-id] load failed:", error);
    return res.status(500).json({ message: "Failed to load storefront" });
  }
});

router.get("/api/storefront/:handle", async (req, res) => {
  try {
    const rawLocale = typeof req.query.locale === "string" ? req.query.locale : undefined;
    // L23: the SPA's own read is the one caller with a real buyer, so it is the one that gets a
    // buy action on each card. The buyer is the SESSION (§14) — no session is an honest `guest`.
    const data = await loadStorefront(req.params.handle, rawLocale, await resolveBuyerState(req));
    if (!data) return res.status(404).json({ message: "Storefront not found" });
    return res.json(data);
  } catch (error: any) {
    console.error("[storefront] load failed:", error);
    return res.status(500).json({ message: "Failed to load storefront" });
  }
});

router.get("/api/provider-storefront/:handle", async (req, res) => {
  try {
    const rawLocale = typeof req.query.locale === "string" ? req.query.locale : undefined;
    const data = await loadProviderStorefront(req.params.handle, rawLocale);
    if (!data) return res.status(404).json({ message: "Provider storefront not found" });
    // Deprecated compatibility response. New consumers must use /api/storefront/:handle,
    // which returns all public inventory lanes for either earner role.
    return res.json(data);
  } catch (error: any) {
    console.error("[provider-storefront] load failed:", error);
    return res.status(500).json({ message: "Failed to load provider storefront" });
  }
});

// Register the collection route separately from the singular `/:handle` route above: the
// plural path keeps `/api/provider-storefront/:handle` unambiguous.
router.get("/api/provider-storefronts", async (_req, res) => {
  try {
    return res.json(await loadProviderStorefrontDirectory());
  } catch (error: any) {
    console.error("[provider-storefronts] directory load failed:", error);
    return res.status(500).json({ message: "Failed to load provider storefronts" });
  }
});

// Server-side OG injection for canonical role-agnostic /s/:handle. Crawlers (WhatsApp/FB/X)
// never run the SPA's JS, so the share preview must be in the initial HTML.
router.get("/s/:handle", async (req, res, next) => {
  try {
    const data = await loadStorefront(req.params.handle);
    if (!data) return next(); // SPA renders its own not-found

    const count = data.services.length + data.readyMade.length;
    const isProvider = isProviderRole(data.earner.role);
    const providerServiceCount = data.services.length;
    // A provider storefront is titled by its business when the business is named — the same
    // heading the page itself draws.
    const displayName = data.earner.businessName ?? data.earner.name;
    const title = isProvider
      ? `${displayName} — Book local services | Traveloure`
      : `${data.earner.name} — Book local experiences | Traveloure`;
    const description = isProvider
      ? `${data.earner.bio ? `${data.earner.bio} ` : ""}${providerServiceCount} bookable service${providerServiceCount === 1 ? "" : "s"} from ${displayName} on Traveloure. Secure checkout, verified reviews.`
      : data.earner.bio ??
        `${count} bookable experience${count === 1 ? "" : "s"} from ${data.earner.name} on Traveloure. Secure checkout, verified reviews.`;
    const shareUrl = `https://traveloure.com/s/${data.earner.handle}`;
    const ogImage =
      data.earner.coverImageUrl ??
      data.readyMade[0]?.heroImageUrl ??
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
    template = injectIntoHead(template, ogTags);
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

// Legacy provider URL. Keep the handler so old links resolve, but all public storefronts now have
// one canonical path and one role-aware OG shell at /s/:handle.
router.get("/providers/:handle", async (req, res, next) => {
  try {
    const data = await loadStorefront(req.params.handle);
    if (!data) return next();
    return res.redirect(301, `/s/${data.earner.handle}`);
  } catch (err) {
    console.error("[provider-storefront] legacy redirect resolution failed:", err);
    return next();
  }
});

// /p/:handle is retained only as a legacy redirect. Resolve via the canonical public loader so a
// missing, suspended, invalid, or unpublished handle is never turned into a fabricated URL.
router.get("/p/:handle", async (req, res, next) => {
  try {
    const data = await loadStorefront(req.params.handle);
    if (data) return res.redirect(301, `/s/${data.earner.handle}`);
    return next();
  } catch (err) {
    console.error("[storefront] legacy alias resolution failed:", err);
    return next();
  }
});

// Server-side OG injection for /services/:id — same pattern as /s/:handle.
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
    template = injectIntoHead(template, ogTags);
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
    template = injectIntoHead(template, ogTags);
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
    // Earner gate = authorization ⇒ DB role (CLAUDE.md §2; audit finding 14 class — the
    // OIDC session shape carries no role at all, so the session read failed closed there).
    const userRole = await getDbRole(req);
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
    // Earner gate = authorization ⇒ DB role (CLAUDE.md §2; audit finding 14 class — the
    // OIDC session shape carries no role at all, so the session read failed closed there).
    const userRole = await getDbRole(req);
    if (!isEarnerRole(userRole)) {
      return res.status(403).json({ message: "Only experts and providers can set a notification email" });
    }
    const userId = getUserId(req)!;
    const parsed = notificationEmailSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(zodErrorBody(parsed.error, "Invalid input"));
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
