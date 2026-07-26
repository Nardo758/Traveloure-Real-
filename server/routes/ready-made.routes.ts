/**
 * ready-made.routes.ts — Ready-Made Trips authoring, Phase 1 (brief v1.1 §1–2, spec v3).
 *
 * Two endpoints:
 *  • POST /api/expert/ready-made — create the authoring pair: a trip with userId=NULL +
 *    authorId=caller (traveler-surface exclusion by construction, §2a) and a ready_made_trips
 *    listing row born 'draft' (D1a). Role-gated per D3: local_expert | travel_expert (+ admin),
 *    resolved by DB lookup (§2-style — never the session's possibly-stale role string).
 *  • GET /api/expert/workspace-context/:tripId — server-side mode resolution for the dual-mode
 *    workspace: assignment row exists → 'assignment'; else trip.authorId === caller → 'authoring';
 *    else 403/404. The client is TOLD the mode; it never infers it.
 *
 * Auth rules (brief §2, hard): the authoring check is isTripAuthor (explicit, present-value
 * comparison). NEVER routed through getTripRole/canMutateTrip.
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { trips, readyMadeTrips, readyMadePurchases, tripExpertAdvisors, itineraryItems, users } from "@shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { READY_MADE_PLAN_TYPE_KEYS, type ReadyMadePlanTypeKey } from "@shared/ready-made-plan-types";
import { getAuthoredTrip } from "../utils/trip-authorship";
import { holdWindowDays } from "../config/earnings-hold.config";
import { getBand } from "../services/commission";
import { unsplashService } from "../services/unsplash.service";

const router = Router();

const AUTHOR_ROLES = new Set(["local_expert", "travel_expert", "admin"]); // D3 (Leon, 2026-07-25)

function sessionUserId(req: any): string | null {
  return (req.user as any)?.claims?.sub ?? (req.user as any)?.id ?? null;
}

function isAuthenticated(req: any, res: any, next: any) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

const createReadyMadeSchema = z.object({
  title: z.string().trim().min(1).max(200).default("Untitled ready-made trip"),
  market: z.string().trim().min(1).max(100).default("Kyoto"), // §12: Kyoto-only launch (server default, not client-trusted scope)
  durationDays: z.number().int().min(1).max(30).default(3),
});

// ─── Create the authoring pair ───────────────────────────────────────────────
router.post("/api/expert/ready-made", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    // D3 role gate — DB lookup, not the session role string.
    const user = await storage.getUser(userId);
    if (!user || !AUTHOR_ROLES.has(user.role ?? "")) {
      return res.status(403).json({ message: "Ready-made authoring requires a local expert or trip advisor role" });
    }

    const parsed = createReadyMadeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }
    const { title, market, durationDays } = parsed.data;

    // Placeholder dates: authoring trips are templates-in-the-making, not scheduled travel; the
    // buyer's CLONE gets real dates. trips.start/end are NOT NULL so we anchor a synthetic window.
    const start = new Date();
    const end = new Date(start.getTime() + (durationDays - 1) * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const result = await db.transaction(async (tx) => {
      const [trip] = await tx
        .insert(trips)
        .values({
          userId: null,          // §2a: NULL owner = excluded from every traveler surface
          authorId: userId,      // authoring-mode scope key
          title,
          destination: market,
          startDate: fmt(start),
          endDate: fmt(end),
          status: "draft",
          numberOfTravelers: 2,
          adults: 2,
          kids: 0,
        } as any)
        .returning();

      const [listing] = await tx
        .insert(readyMadeTrips)
        .values({
          authorId: userId,
          sourceTripId: trip.id,
          market,
          title,
          durationDays,
          status: "draft",       // born-draft (D1a) — approval only via the admin action
        } as any)
        .returning();

      return { trip, listing };
    });

    res.status(201).json({
      tripId: result.trip.id,
      listingId: result.listing.id,
      mode: "authoring",
      redirect: `/expert/workspace/${result.trip.id}`,
    });
  } catch (err: any) {
    console.error("[ready-made] create error:", err);
    res.status(500).json({ message: "Failed to create ready-made trip", error: err.message });
  }
});

// ─── Workspace mode resolution (dual-mode bootstrap) ─────────────────────────
router.get("/api/expert/workspace-context/:tripId", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    const tripId = req.params.tripId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Assignment mode first: an advisor row for this caller on this trip.
    const [assignment] = await db
      .select()
      .from(tripExpertAdvisors)
      .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
      .limit(1);
    if (assignment) {
      const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      return res.json({ mode: "assignment", trip, assignment });
    }

    // Authoring mode: explicit present-value author check (never getTripRole).
    const authored = await getAuthoredTrip(tripId, userId);
    if (authored) {
      const [listing] = await db
        .select()
        .from(readyMadeTrips)
        .where(eq(readyMadeTrips.sourceTripId, tripId))
        .limit(1);
      return res.json({ mode: "authoring", trip: authored, listing: listing ?? null });
    }

    return res.status(403).json({ message: "Not assigned to this trip and not its author" });
  } catch (err: any) {
    console.error("[ready-made] workspace-context error:", err);
    res.status(500).json({ message: "Failed to resolve workspace context", error: err.message });
  }
});

// ─── Phase 2: listing edit, hero picker, earnings preview ────────────────────

/**
 * Load a listing ONLY if the caller authored it. The listing's own `author_id` is the
 * gate (not the trip's) — they are written together in the create transaction, and using
 * the row you are about to mutate as its own gate leaves no room for them to disagree.
 */
async function loadAuthorListing(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(readyMadeTrips)
    .where(and(eq(readyMadeTrips.id, id), eq(readyMadeTrips.authorId, userId)))
    .limit(1);
  return row ?? null;
}

/** D2 (Leon, 2026-07-25): "Unsplash proves the photo" — enforced here, not just in the picker UI. */
const UNSPLASH_IMAGE_HOSTS = new Set(["images.unsplash.com", "plus.unsplash.com"]);

function isUnsplashImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && UNSPLASH_IMAGE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

const heroMetaSchema = z.object({
  unsplashId: z.string().trim().min(1).max(120),
  photographer: z.string().trim().min(1).max(200),
  profileUrl: z.string().trim().url().max(500),
  downloadLocation: z.string().trim().url().max(500).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

/**
 * The expert-editable allow-list. Deliberately EXCLUDES every column an author must not
 * self-set: `status` (approval is the gate they cannot satisfy — D1a), `authorId`,
 * `sourceTripId`, `feeBandKey` (the platform's economics — §8), `insideCounts` (snapshotted
 * at approval), `buildReview`, `badge` (a platform trust marker), `rejectionReason`,
 * every review/submission timestamp, and `active`. Never `req.body` spread — this is
 * the marketplace Gap-2 mass-assignment lesson (§10).
 */
const patchListingSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    market: z.string().trim().min(1).max(100),
    durationDays: z.number().int().min(1).max(30),
    // Closed vocabulary — the "Type of Plan" line of the store's quality structure.
    planType: z.enum(READY_MADE_PLAN_TYPE_KEYS as [ReadyMadePlanTypeKey, ...ReadyMadePlanTypeKey[]]).nullable(),
    bestSeason: z.string().trim().max(60).nullable(),
    pricingMode: z.enum(["fixed", "per_traveler"]), // mirrors the migration-133 CHECK
    priceCents: z.number().int().min(500).max(500_000).nullable(), // $5–$5,000, USD-only v1
    heroImageUrl: z.string().trim().url().max(1000).nullable(),
    heroImageMeta: heroMetaSchema.nullable(),
  })
  .partial()
  .strict();

/**
 * Material fields — a change to any of these on an APPROVED listing drops it back to
 * `submitted` for re-review (the §10 A3 rule, widened past price because a ready-made
 * trip's headline claims ARE the product: what it's called, how long it runs, what it
 * costs, and the photo that sells it).
 */
const MATERIAL_FIELDS = ["title", "durationDays", "planType", "pricingMode", "priceCents", "heroImageUrl"] as const;

router.patch("/api/expert/ready-made/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const existing = await loadAuthorListing(req.params.id, userId);
    if (!existing) return res.status(404).json({ message: "Listing not found" });

    const parsed = patchListingSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "No editable fields supplied" });
    }

    // Hero integrity (D2): a hero must be an Unsplash image URL carrying its attribution.
    // Both are required together — an image without its photographer credit is a rights
    // problem, and a credit without an Unsplash-hosted URL defeats the provenance rule.
    if (patch.heroImageUrl != null) {
      if (!isUnsplashImageUrl(patch.heroImageUrl)) {
        return res.status(400).json({
          message: "Hero image must be chosen from the Unsplash picker (images.unsplash.com)",
        });
      }
      const meta = patch.heroImageMeta ?? (existing.heroImageMeta as any);
      if (!meta?.unsplashId || !meta?.photographer || !meta?.profileUrl) {
        return res.status(400).json({ message: "Hero image requires Unsplash attribution metadata" });
      }
    }
    if (patch.heroImageUrl === null) patch.heroImageMeta = null; // clearing the hero clears its credit

    // A3 re-review: an approved listing whose headline claims change re-enters the queue.
    const materialChange =
      existing.status === "approved" &&
      MATERIAL_FIELDS.some((f) => {
        const next = (patch as any)[f];
        return next !== undefined && JSON.stringify(next) !== JSON.stringify((existing as any)[f]);
      });

    const [updated] = await db
      .update(readyMadeTrips)
      .set({
        ...patch,
        ...(materialChange
          ? { status: "submitted", reviewedAt: null, reviewedBy: null, rejectionReason: null }
          : {}),
        updatedAt: new Date(),
      } as any)
      .where(eq(readyMadeTrips.id, existing.id))
      .returning();

    // Keep the source trip's title in step with the listing's. They are born identical in the
    // create transaction, and the author edits ONE title in the UI — letting them drift leaves the
    // builder's own header/rail showing a stale name and no way to tell which one is real.
    if (patch.title !== undefined) {
      await db
        .update(trips)
        .set({ title: patch.title } as any)
        .where(eq(trips.id, existing.sourceTripId));
    }

    // Unsplash API compliance: a hotlinked photo that is displayed prominently must ping
    // its download_location. Fire-and-forget — never fail the author's save on it.
    const dl = (patch.heroImageMeta as any)?.downloadLocation;
    if (patch.heroImageUrl && dl) {
      unsplashService.trackDownload(dl).catch(() => {});
    }

    res.json({ listing: updated, reReviewRequired: materialChange });
  } catch (err: any) {
    console.error("[ready-made] patch error:", err);
    res.status(500).json({ message: "Failed to update listing", error: err.message });
  }
});

/**
 * Submit for review — the PUSH half of the workstation→store pipeline (decision-maker,
 * 2026-07-25: "what we need to fix is how the workstation pushes and saves these content").
 *
 * The gate enforces the store's QUALITY STRUCTURE before anything reaches the admin queue:
 * a declared plan type (the structure's headline), an Unsplash-proven hero, a price, and a
 * build with no empty days (every day 1..durationDays has at least one itinerary item). The
 * refusal names each missing requirement so the author knows exactly what to fix — never a
 * bare 400.
 *
 * §15: the transition is an atomic conditional UPDATE (draft|rejected → submitted); a
 * double-click or a race with an admin decision matches 0 rows and returns 409 instead of
 * silently re-submitting. Approval itself stays admin-only (D1a) — this endpoint can never
 * set 'approved'.
 */
router.post("/api/expert/ready-made/:id/submit", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const listing = await loadAuthorListing(req.params.id, userId);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const missing: Array<{ requirement: string; message: string }> = [];
    if (!listing.planType) {
      missing.push({ requirement: "planType", message: "Choose a plan type (Hiking Itinerary, Road Trip Itinerary, …)" });
    }
    if (!listing.heroImageUrl || !(listing.heroImageMeta as any)?.photographer) {
      missing.push({ requirement: "hero", message: "Pick a cover photo from the Unsplash picker" });
    }
    if (listing.priceCents === null || listing.priceCents === undefined) {
      missing.push({ requirement: "price", message: "Set a price" });
    }

    // No empty days: the buyer is purchasing a complete plan, not a scaffold.
    const dayRows = await db
      .select({ dayNumber: itineraryItems.dayNumber, count: sql<number>`count(*)::int` })
      .from(itineraryItems)
      .where(eq(itineraryItems.tripId, listing.sourceTripId))
      .groupBy(itineraryItems.dayNumber);
    const daysWithItems = new Set(dayRows.map((r) => r.dayNumber));
    const emptyDays = Array.from({ length: listing.durationDays }, (_, i) => i + 1)
      .filter((d) => !daysWithItems.has(d));
    if (emptyDays.length > 0) {
      missing.push({
        requirement: "itinerary",
        message: `Day${emptyDays.length > 1 ? "s" : ""} ${emptyDays.join(", ")} ${emptyDays.length > 1 ? "have" : "has"} no items yet — every day needs at least one`,
      });
    }

    if (missing.length > 0) {
      return res.status(400).json({ message: "Not ready to submit", missing });
    }

    const [updated] = await db
      .update(readyMadeTrips)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        updatedAt: new Date(),
      } as any)
      .where(and(
        eq(readyMadeTrips.id, listing.id),
        inArray(readyMadeTrips.status, ["draft", "rejected"]),
      ))
      .returning();
    if (!updated) {
      return res.status(409).json({ message: "Listing is already submitted or approved", status: listing.status });
    }

    res.json({ listing: updated });
  } catch (err: any) {
    console.error("[ready-made] submit error:", err);
    res.status(500).json({ message: "Failed to submit listing", error: err.message });
  }
});

/**
 * AI Build Review (decision-maker directive: "use the same code as the AI optimization but
 * applied differently") — runs the optimizer's OWN analysis engine
 * (itineraryIntelligenceService.analyzeItinerary: overloaded days, excessive travel, meal gaps,
 * energy profile, score) over the AUTHORING trip instead of a traveler's plan. ADVISORY ONLY —
 * it never gates submit (the Knowledge-Bar advisory precedent); the verdict persists to
 * ready_made_trips.build_review (migration 133) so the ADMIN QUEUE sees the same score the
 * author saw. This path is the engine's heuristic core, so it runs keyless — nothing fabricated,
 * nothing blocked (§13).
 */
router.post("/api/expert/ready-made/:id/build-review", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const listing = await loadAuthorListing(req.params.id, userId);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const { itineraryIntelligenceService } = await import("../services/itinerary-intelligence.service");
    const analysis = await itineraryIntelligenceService.analyzeItinerary(listing.sourceTripId);

    const buildReview = {
      score: analysis.score,
      issues: analysis.issues,
      suggestions: analysis.suggestions,
      engine: "itinerary-intelligence", // provenance: the optimizer's analyzer, applied to a build
      reviewedAt: new Date().toISOString(),
    };
    await db
      .update(readyMadeTrips)
      .set({ buildReview, updatedAt: new Date() } as any)
      .where(eq(readyMadeTrips.id, listing.id));

    res.json({ buildReview });
  } catch (err: any) {
    console.error("[ready-made] build-review error:", err);
    res.status(500).json({ message: "Failed to run build review" });
  }
});

/** The buyer's ready-made purchases (my-bookings surface) — session-scoped, with listing teaser. */
router.get("/api/ready-made/purchases/mine", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const rows = await db
      .select({
        id: readyMadePurchases.id,
        status: readyMadePurchases.status,
        pricePaidCents: readyMadePurchases.pricePaidCents,
        currency: readyMadePurchases.currency,
        purchasedAt: readyMadePurchases.purchasedAt,
        cloneTripId: readyMadePurchases.cloneTripId,
        listingId: readyMadeTrips.id,
        title: readyMadeTrips.title,
        planType: readyMadeTrips.planType,
        market: readyMadeTrips.market,
        heroImageUrl: readyMadeTrips.heroImageUrl,
      })
      .from(readyMadePurchases)
      .innerJoin(readyMadeTrips, eq(readyMadeTrips.id, readyMadePurchases.readyMadeTripId))
      .where(eq(readyMadePurchases.buyerId, userId))
      .orderBy(desc(readyMadePurchases.purchasedAt));

    const windowMs = holdWindowDays("ready_made_sale") * 24 * 60 * 60 * 1000;
    res.json({
      purchases: rows.map((r) => ({
        ...r,
        // Server-authoritative refund eligibility — the client renders it, never computes it.
        refundEligible:
          (r.status === "paid" || r.status === "cloned") &&
          !!r.purchasedAt &&
          Date.now() <= new Date(r.purchasedAt).getTime() + windowMs,
      })),
    });
  } catch (err: any) {
    console.error("[ready-made] purchases mine error:", err);
    res.status(500).json({ message: "Failed to load purchases" });
  }
});

/** The author's own listings (console list — ungated on approval, like every owner console). */
router.get("/api/expert/ready-made/mine", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const rows = await db
      .select()
      .from(readyMadeTrips)
      .where(eq(readyMadeTrips.authorId, userId))
      .orderBy(desc(readyMadeTrips.updatedAt));
    res.json({ listings: rows });
  } catch (err: any) {
    console.error("[ready-made] mine error:", err);
    res.status(500).json({ message: "Failed to load listings", error: err.message });
  }
});

/**
 * Earnings preview — the author's share, resolved from the `ready_made_trip` fee band.
 * §8: NO rate literal. If the band is missing or not a percent band we return
 * `available:false` rather than falling back to a made-up split — a preview that invents
 * the number the author will be paid is worse than no preview (§13).
 */
router.get("/api/expert/ready-made/:id/earnings-preview", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const listing = await loadAuthorListing(req.params.id, userId);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const band = await getBand(listing.feeBandKey);
    if (!band || band.rateType !== "percent") {
      return res.json({
        available: false,
        reason: band ? "fee_band_not_percent" : "fee_band_missing",
        bandKey: listing.feeBandKey,
      });
    }

    const platformFeeRate = band.rate;
    const expertShareRate = 1 - platformFeeRate;
    const priceCents = listing.priceCents ?? null;

    res.json({
      available: true,
      bandKey: listing.feeBandKey,
      pricingMode: listing.pricingMode,
      platformFeeRate,
      expertShareRate,
      priceCents,
      // Null until the author sets a price — never a placeholder amount.
      platformFeeCents: priceCents === null ? null : Math.round(priceCents * platformFeeRate),
      expertEarningsCents: priceCents === null ? null : priceCents - Math.round(priceCents * platformFeeRate),
    });
  } catch (err: any) {
    console.error("[ready-made] earnings-preview error:", err);
    res.status(500).json({ message: "Failed to resolve earnings preview", error: err.message });
  }
});

/**
 * Hero-image search (Unsplash proxy). Author-role-gated so the platform key can't be used
 * as an open image proxy. `ready:false` is the HONEST unconfigured answer — an empty
 * results array would read as "no photos match", which is a different claim (§13).
 */
router.get("/api/expert/ready-made/hero-search", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(userId);
    if (!user || !AUTHOR_ROLES.has(user.role ?? "")) {
      return res.status(403).json({ message: "Ready-made authoring requires a local expert or trip advisor role" });
    }

    if (!unsplashService.isReady()) {
      return res.json({ ready: false, reason: "unsplash_not_configured", results: [] });
    }

    const q = String(req.query.q ?? "").trim().slice(0, 120);
    if (!q) return res.status(400).json({ message: "Missing search query" });

    const photos = await unsplashService.searchPhotos(q, { perPage: 12, orientation: "landscape" });
    res.json({
      ready: true,
      results: photos.map((p) => ({
        // The picker hands these straight back to PATCH — same shape the hero validator expects.
        url: p.url,
        thumbnailUrl: p.thumbnailUrl,
        description: p.description,
        meta: {
          unsplashId: p.photoId,
          photographer: p.photographerName,
          profileUrl: p.photographerUrl,
          downloadLocation: p.downloadLocationUrl,
          description: p.description,
        },
      })),
    });
  } catch (err: any) {
    console.error("[ready-made] hero-search error:", err);
    res.status(500).json({ message: "Hero search failed", error: err.message });
  }
});

// ─── Public store feed (task #158 — the shelf's data source) ─────────────────
//
// Serves ONLY approved + active listings (the F2/§10 read-gate pattern: approval is enforced at
// the API, regardless of which client renders it), as a TEASER DTO: card fields + the
// approval-time insideCounts snapshot + author identity for the shelf's sections — "Trips by
// Locals" (local_expert authors) vs Advisor content (the ratified store model: sectioning is by
// author type). Deliberately OMITS sourceTripId — the itinerary is the paid product; a buyer
// reaches it only through the purchase→clone flow (not yet built).
//
// The consumer shelf UI stays un-surfaced until purchase→clone closes the buy loop end-to-end
// (the §10 B4 lesson: safety/delivery before surfacing) — this endpoint is the server-gated feed
// waiting for it, provable now.
//
// Ordering is honest recency of approval — no sales/rating signals exist for this product yet,
// so nothing is fabricated to rank by (§13).
router.get("/api/ready-made", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: readyMadeTrips.id,
        title: readyMadeTrips.title,
        planType: readyMadeTrips.planType,
        market: readyMadeTrips.market,
        durationDays: readyMadeTrips.durationDays,
        bestSeason: readyMadeTrips.bestSeason,
        pricingMode: readyMadeTrips.pricingMode,
        priceCents: readyMadeTrips.priceCents,
        heroImageUrl: readyMadeTrips.heroImageUrl,
        heroImageMeta: readyMadeTrips.heroImageMeta,
        badge: readyMadeTrips.badge,
        insideCounts: readyMadeTrips.insideCounts,
        reviewedAt: readyMadeTrips.reviewedAt,
        authorFirstName: users.firstName,
        authorRole: users.role,
      })
      .from(readyMadeTrips)
      .innerJoin(users, eq(users.id, readyMadeTrips.authorId))
      .where(and(eq(readyMadeTrips.status, "approved"), eq(readyMadeTrips.active, true)))
      .orderBy(desc(readyMadeTrips.reviewedAt));

    res.json({
      listings: rows.map((r) => ({
        id: r.id,
        title: r.title,
        planType: r.planType,
        market: r.market,
        durationDays: r.durationDays,
        bestSeason: r.bestSeason,
        pricingMode: r.pricingMode,
        priceCents: r.priceCents,
        heroImageUrl: r.heroImageUrl,
        heroImageMeta: r.heroImageMeta,
        badge: r.badge,
        insideCounts: r.insideCounts,
        authorName: r.authorFirstName ?? "Expert",
        // The consumer shelf section (ratified store model): by author TYPE.
        section: r.authorRole === "local_expert" ? "trips_by_locals" : "advisor",
      })),
    });
  } catch (err: any) {
    console.error("[ready-made] public feed error:", err);
    res.status(500).json({ message: "Failed to load store listings" });
  }
});

// ─── Public detail (Phase 4) — the SAME redacted DTO for buyers and the author's preview ─────
//
// Approved+active → public. Non-approved → ONLY the author (explicit session check), flagged
// preview:true so the page renders exactly what a buyer would see (preview-as-buyer: what the
// author ships is what they previewed). Never exposes sourceTripId — the itinerary is the paid
// product; a buyer reaches it only through their own clone.
router.get("/api/ready-made/:id", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: readyMadeTrips.id,
        title: readyMadeTrips.title,
        planType: readyMadeTrips.planType,
        market: readyMadeTrips.market,
        durationDays: readyMadeTrips.durationDays,
        bestSeason: readyMadeTrips.bestSeason,
        pricingMode: readyMadeTrips.pricingMode,
        priceCents: readyMadeTrips.priceCents,
        heroImageUrl: readyMadeTrips.heroImageUrl,
        heroImageMeta: readyMadeTrips.heroImageMeta,
        badge: readyMadeTrips.badge,
        insideCounts: readyMadeTrips.insideCounts,
        status: readyMadeTrips.status,
        active: readyMadeTrips.active,
        authorId: readyMadeTrips.authorId,
        authorFirstName: users.firstName,
        authorRole: users.role,
      })
      .from(readyMadeTrips)
      .innerJoin(users, eq(users.id, readyMadeTrips.authorId))
      .where(eq(readyMadeTrips.id, req.params.id))
      .limit(1);
    const row = rows[0];
    if (!row) return res.status(404).json({ message: "Trip not found" });

    const isPublic = row.status === "approved" && row.active;
    const sessionUser = (req as any).isAuthenticated?.() ? sessionUserId(req) : null;
    const isAuthorPreview = !isPublic && sessionUser !== null && sessionUser === row.authorId;
    if (!isPublic && !isAuthorPreview) {
      return res.status(404).json({ message: "Trip not found" }); // no draft-listing oracle
    }

    res.json({
      listing: {
        id: row.id,
        title: row.title,
        planType: row.planType,
        market: row.market,
        durationDays: row.durationDays,
        bestSeason: row.bestSeason,
        pricingMode: row.pricingMode,
        priceCents: row.priceCents,
        heroImageUrl: row.heroImageUrl,
        heroImageMeta: row.heroImageMeta,
        badge: row.badge,
        insideCounts: row.insideCounts,
        authorName: row.authorFirstName ?? "Expert",
        section: row.authorRole === "local_expert" ? "trips_by_locals" : "advisor",
      },
      preview: isAuthorPreview,
    });
  } catch (err: any) {
    console.error("[ready-made] detail error:", err);
    res.status(500).json({ message: "Failed to load trip" });
  }
});

// ─── Purchase → verify → clone (commerce lane; mirrors the template 2-step at routes.ts:3086) ──
//
// §14: the charge amount is the LISTING's priceCents — server-derived, never req.body. §15: the
// Stripe idempotencyKey is deterministic per (listing, buyer) so a retry reuses the same
// PaymentIntent, and ready_made_purchases' UNIQUE stripe_payment_intent_id makes /confirm
// replay-safe (one purchase row per payment, ever). ready_made_purchases has NO pre-payment
// state by design (migration 133): the row is created only AFTER Stripe verifies `succeeded`,
// so an abandoned checkout leaves nothing behind.

router.post("/api/ready-made/:id/purchase", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const [listing] = await db
      .select()
      .from(readyMadeTrips)
      .where(eq(readyMadeTrips.id, req.params.id))
      .limit(1);
    if (!listing) return res.status(404).json({ message: "Listing not found" });
    // The buy gate = the shelf gate (§10): admin approval + active.
    if (listing.status !== "approved" || !listing.active) {
      return res.status(400).json({ message: "This trip is not available for purchase" });
    }
    if (listing.authorId === userId) {
      return res.status(400).json({ message: "You cannot purchase your own listing" });
    }
    if (listing.priceCents === null || listing.priceCents <= 0) {
      return res.status(400).json({ message: "This listing has no price set" });
    }

    // One active purchase per buyer+listing (the migration-133 partial unique, checked up front
    // so the buyer gets a clear answer instead of a paid second PI failing at confirm).
    const [existing] = await db
      .select({ id: readyMadePurchases.id, status: readyMadePurchases.status, cloneTripId: readyMadePurchases.cloneTripId })
      .from(readyMadePurchases)
      .where(and(
        eq(readyMadePurchases.buyerId, userId),
        eq(readyMadePurchases.readyMadeTripId, listing.id),
        inArray(readyMadePurchases.status, ["paid", "cloned"]),
      ))
      .limit(1);
    if (existing) {
      return res.status(409).json({ message: "You already own this trip", purchase: existing });
    }

    const Stripe = (await import("stripe")).default;
    const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2024-12-18.acacia" as any,
    });
    const paymentIntent = await stripeClient.paymentIntents.create(
      {
        amount: listing.priceCents, // §14: server-derived from the listing, price locked at PI creation
        currency: "usd",
        metadata: {
          type: "ready_made_purchase",
          listingId: listing.id,
          buyerId: userId,
        },
        description: `Traveloure ready-made trip: ${listing.title}`,
        automatic_payment_methods: { enabled: true },
      },
      // §15: retrying the purchase re-uses the same PI instead of minting a second charge.
      { idempotencyKey: `rm-buy-${listing.id}-${userId}` },
    );

    return res.status(202).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      listing: {
        id: listing.id,
        title: listing.title,
        planType: listing.planType,
        market: listing.market,
        durationDays: listing.durationDays,
        priceCents: listing.priceCents,
        pricingMode: listing.pricingMode,
        heroImageUrl: listing.heroImageUrl,
      },
    });
  } catch (err: any) {
    console.error("[ready-made] purchase error:", err);
    res.status(500).json({ message: "Failed to initiate purchase" });
  }
});

router.post("/api/ready-made/:id/purchase/confirm", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { paymentIntentId } = req.body ?? {};
    if (!paymentIntentId) return res.status(400).json({ message: "paymentIntentId is required" });

    // Never trust client-reported payment state — retrieve from Stripe.
    const Stripe = (await import("stripe")).default;
    const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2024-12-18.acacia" as any,
    });
    const intent = await stripeClient.paymentIntents.retrieve(paymentIntentId);

    if (intent.status !== "succeeded") {
      return res.status(402).json({ message: `Payment not completed (status: ${intent.status})`, stripeStatus: intent.status });
    }
    // IDOR guard: the intent must be a ready-made purchase of THIS listing by THIS session user.
    if (
      intent.metadata?.type !== "ready_made_purchase" ||
      intent.metadata?.listingId !== req.params.id ||
      intent.metadata?.buyerId !== userId
    ) {
      return res.status(400).json({ message: "PaymentIntent does not match this purchase" });
    }

    // Record the purchase — the UNIQUE stripe_payment_intent_id is the replay guard (§15):
    // a duplicate confirm inserts nothing and falls through to fulfil idempotently.
    const inserted = await db
      .insert(readyMadePurchases)
      .values({
        buyerId: userId,
        readyMadeTripId: req.params.id,
        pricePaidCents: intent.amount, // what Stripe actually captured — never re-read the listing
        currency: (intent.currency ?? "usd").toUpperCase(),
        stripePaymentIntentId: intent.id,
        status: "paid",
      } as any)
      .onConflictDoNothing({ target: readyMadePurchases.stripePaymentIntentId })
      .returning({ id: readyMadePurchases.id });

    const purchaseId =
      inserted[0]?.id ??
      (await db
        .select({ id: readyMadePurchases.id })
        .from(readyMadePurchases)
        .where(eq(readyMadePurchases.stripePaymentIntentId, intent.id))
        .limit(1))[0]?.id;
    if (!purchaseId) return res.status(500).json({ message: "Failed to record purchase" });

    // Fulfil: clone into the buyer's editable trip + credit the author (idempotent, §15 claim).
    const result = await (await import("../services/ready-made-purchase.service")).fulfillReadyMadePurchase(purchaseId);

    res.json({
      purchase: result.purchase,
      cloneTripId: result.cloneTripId,
      alreadyFulfilled: result.alreadyFulfilled,
      // The buyer's next stop: their own editable copy.
      redirect: result.cloneTripId ? `/trip/${result.cloneTripId}?tab=itinerary` : null,
    });
  } catch (err: any) {
    console.error("[ready-made] purchase confirm error:", err);
    res.status(500).json({ message: "Failed to confirm purchase" });
  }
});

// ─── D7 refund — buyer-initiated, inside the escrow window only ──────────────
//
// Ledger-first, Stripe-second (the dispute-uphold posture): the atomic status claim + earning
// reversal + clone revocation run first; the Stripe refund uses a DETERMINISTIC idempotencyKey
// (`rm-refund-<purchaseId>`), so if Stripe fails the buyer can retry — the ledger half returns
// alreadyRefunded and the Stripe leg re-runs idempotently until it succeeds. §14: the refund
// amount is the full PaymentIntent (Stripe derives it from the PI — no client amount).
router.post("/api/ready-made/purchases/:id/refund", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { refundReadyMadePurchaseLedger } = await import("../services/ready-made-purchase.service");
    const ledger = await refundReadyMadePurchaseLedger(req.params.id, userId);
    if (!ledger.ok) return res.status(ledger.status).json({ message: ledger.message });

    const Stripe = (await import("stripe")).default;
    const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2024-12-18.acacia" as any,
    });
    try {
      const refund = await stripeClient.refunds.create(
        { payment_intent: ledger.purchase.stripePaymentIntentId },
        { idempotencyKey: `rm-refund-${ledger.purchase.id}` },
      );
      return res.json({ success: true, refundId: refund.id, purchase: ledger.purchase });
    } catch (stripeErr: any) {
      // Ledger is settled; the money leg failed. Say so honestly — a retry of this endpoint
      // re-runs ONLY the idempotent Stripe refund (ledger returns alreadyRefunded).
      console.error("[ready-made] refund Stripe leg failed:", stripeErr?.message);
      return res.status(502).json({
        message: "Refund recorded but the payment reversal failed — please retry",
        purchase: ledger.purchase,
      });
    }
  } catch (err: any) {
    console.error("[ready-made] refund error:", err);
    res.status(500).json({ message: "Failed to refund purchase" });
  }
});

export default router;
