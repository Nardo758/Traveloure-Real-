/**
 * ready-made.routes.ts — Ready-Made Trips authoring, Phase 1 (brief v1.1 §1–2, spec v3).
 *
 * Two endpoints:
 *  • POST /api/expert/ready-made — create a BUILD: a trip with userId=NULL + authorId=caller
 *    (traveler-surface exclusion by construction, §2a). W-1 (§17 build-first/distribute-later):
 *    the build is unlabeled at birth — NO listing row is created here anymore; a store listing
 *    is created FROM the build via POST /api/expert/ready-made/from-trip/:tripId ("ship to
 *    store", idempotent per trip). Role-gated per D3: local_expert | travel_expert (+ admin),
 *    resolved by DB lookup (§2-style — never the session's possibly-stale role string).
 *  • GET /api/expert/workspace-context/:tripId — server-side mode resolution for the dual-mode
 *    workspace: assignment row exists → 'assignment'; else trip.authorId === caller → 'authoring';
 *    else 403/404. The client is TOLD the mode; it never infers it.
 *
 * Auth rules (brief §2, hard): the authoring check is isTripAuthor (explicit, present-value
 * comparison). NEVER routed through getTripRole/canMutateTrip.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { trips, readyMadeTrips, readyMadePurchases, tripExpertAdvisors, itineraryItems, transportLegs, users, adminNotifications } from "@shared/schema";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { renderReadyMadeTeaserMapSvg } from "../services/ready-made-teaser-map.service";
import { READY_MADE_PLAN_TYPE_KEYS, isCustomPlanType, type ReadyMadePlanTypeKey } from "@shared/ready-made-plan-types";
import { LAUNCH_MARKETS, isLaunchMarket, STORE_GATE_MESSAGE } from "@shared/launch-markets";
import { getAuthoredTrip } from "../utils/trip-authorship";
import { parsePagination } from "../utils/pagination";
import { holdWindowDays } from "../config/earnings-hold.config";
import { getBand } from "../services/commission";
import { unsplashService } from "../services/unsplash.service";
import { getStripeSecretKey } from "../utils/stripe-key";

const router = Router();

const AUTHOR_ROLES = new Set(["local_expert", "travel_expert", "admin"]); // D3 (Leon, 2026-07-25)

function sessionUserId(req: any): string | null {
  return getUserId(req)!;
}

function isAuthenticated(req: any, res: any, next: any) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

const createReadyMadeSchema = z.object({
  title: z.string().trim().min(1).max(200).default("Untitled build"),
  // Location-aware builds (W-4): a BUILD can be for any destination — the location the expert
  // sets here drives what data loads (neighborhood grouping, platform-services search, format
  // resolution). The §12 launch gate does NOT belong at build creation; it is enforced where it
  // means something — ship-to-store (/from-trip, isLaunchMarket) + the migration-149 DB CHECK on
  // the LISTING's market. Default stays the launch market for a blank create.
  destination: z.string().trim().min(1).max(100).default(LAUNCH_MARKETS[0]),
  durationDays: z.number().int().min(1).max(30).default(3),
});

// ─── Create a build (trip only — the listing comes later via ship-to-store) ──
router.post("/api/expert/ready-made", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    // D3 role gate — DB lookup, not the session role string.
    const user = await storage.getUser(userId);
    if (!user || !AUTHOR_ROLES.has(user.role ?? "")) {
      return res.status(403).json({ message: STORE_GATE_MESSAGE });
    }

    const parsed = createReadyMadeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }
    const { title, destination, durationDays } = parsed.data;

    // Placeholder dates: authoring trips are templates-in-the-making, not scheduled travel; the
    // buyer's CLONE gets real dates. trips.start/end are NOT NULL so we anchor a synthetic window.
    const start = new Date();
    const end = new Date(start.getTime() + (durationDays - 1) * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // W-1 (§17 build-first): the build is born WITHOUT a listing — "decide where it ships later."
    // The store listing is created from this trip via /from-trip/:tripId (ship to store).
    // Lane S ruling 17: authoring builds mint identity at birth too (they become Ready Mades).
    const trackingNumber = await storage.generateTrackingNumber("TRV");
    // trip-mint-owner-ok: authoring-mode build — userId NULL by design, no owner principal
    // exists; access rides authorId via isTripAuthor, not a trip_collaborators row.
    const [trip] = await db
      .insert(trips)
      .values({
        userId: null,          // §2a: NULL owner = excluded from every traveler surface
        authorId: userId,      // authoring-mode scope key
        title,
        destination,
        trackingNumber,
        startDate: fmt(start),
        endDate: fmt(end),
        status: "draft",
        numberOfTravelers: 2,
        adults: 2,
        kids: 0,
      } as any)
      .returning();

    res.status(201).json({
      tripId: trip.id,
      mode: "authoring",
      redirect: `/expert/workspace/${trip.id}`,
    });
  } catch (err: any) {
    console.error("[ready-made] create error:", err);
    res.status(500).json({ message: "Failed to create build", error: err.message });
  }
});

// ─── W-1: Ship to store (§17 build-first/distribute-later) ───────────────────
// Creates the ready_made_trips listing FROM an existing authored build — the only way a
// listing is born. Idempotent per trip (§15 posture): the INSERT itself is conditional on
// no listing existing for this sourceTripId, so a double-click/retry returns the existing
// listing instead of creating a second. Client-ASSIGNED trips are not shippable here —
// they are the traveler's trip; turning one into a product is a clone-to-build decision
// deferred to W-2+ (privacy: a listing snapshot would expose the client's itinerary).
const shipToStoreSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  market: z.string().trim().min(1).max(100).optional(),
});

router.post("/api/expert/ready-made/from-trip/:tripId", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    // D3 role gate — DB lookup, not the session role string.
    const user = await storage.getUser(userId);
    if (!user || !AUTHOR_ROLES.has(user.role ?? "")) {
      return res.status(403).json({ message: STORE_GATE_MESSAGE });
    }

    const tripId = req.params.tripId;
    // Owner gate: explicit present-value author check (never getTripRole).
    const trip = await getAuthoredTrip(tripId, userId);
    if (!trip) return res.status(403).json({ message: "Not this build's author" });

    const parsed = shipToStoreSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }

    // §12/F8 launch scope — enforced here (the store lane), backstopped by the migration-149 CHECK.
    const market = parsed.data.market ?? trip.destination ?? "";
    if (!isLaunchMarket(market)) {
      return res.status(400).json({ message: STORE_GATE_MESSAGE });
    }
    const title = (parsed.data.title ?? trip.title ?? "Untitled build").slice(0, 200);

    // Duration from the build's own date window, clamped to the listing contract (1–30).
    const spanMs =
      new Date(trip.endDate as any).getTime() - new Date(trip.startDate as any).getTime();
    const durationDays = Math.min(
      30,
      Math.max(1, Number.isFinite(spanMs) ? Math.round(spanMs / 86_400_000) + 1 : 1),
    );

    const newId = crypto.randomUUID();
    const inserted = await db.execute(sql`
      INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, status)
      SELECT ${newId}, ${userId}, ${tripId}, ${market}, ${title}, ${durationDays}, 'draft'
      WHERE NOT EXISTS (SELECT 1 FROM ready_made_trips WHERE source_trip_id = ${tripId})
      RETURNING id
    `);
    const row = (inserted as any).rows?.[0];
    if (!row) {
      const [existing] = await db
        .select()
        .from(readyMadeTrips)
        .where(eq(readyMadeTrips.sourceTripId, tripId))
        .limit(1);
      return res.status(200).json({ listingId: existing?.id ?? null, tripId, alreadyExists: true });
    }
    return res.status(201).json({ listingId: row.id, tripId, alreadyExists: false });
  } catch (err: any) {
    console.error("[ready-made] ship-to-store error:", err);
    res.status(500).json({ message: "Failed to ship build to store", error: err.message });
  }
});

// ─── W-3: the author's builds (Workstation home "Your builds" lane) ──────────
// Every trip the caller AUTHORED — including unshipped builds that have no listing yet —
// LEFT-JOINed with the store listing when one exists (one row per trip; source_trip_id is
// unique per the ship-to-store idempotency, so the join can never fan out). ROUTE ORDER:
// registered BEFORE any GET /api/expert/ready-made/:id-style route so the literal "builds"
// segment can never be captured by an :id param (Express matches in registration order).
router.get("/api/expert/ready-made/builds", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    // D3 role gate — DB lookup, not the session role string (same posture as create).
    const user = await storage.getUser(userId);
    if (!user || !AUTHOR_ROLES.has(user.role ?? "")) {
      return res.status(403).json({ message: STORE_GATE_MESSAGE });
    }

    const { limit, offset } = parsePagination(req.query);

    const [agg] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(trips)
      .where(eq(trips.authorId, userId));
    const total = agg?.total ?? 0;

    const rows = await db
      .select({
        id: trips.id,
        title: trips.title,
        destination: trips.destination,
        startDate: trips.startDate,
        endDate: trips.endDate,
        status: trips.status,
        createdAt: trips.createdAt,
        listingId: readyMadeTrips.id,
        listingStatus: readyMadeTrips.status,
      })
      .from(trips)
      .leftJoin(readyMadeTrips, eq(readyMadeTrips.sourceTripId, trips.id))
      .where(eq(trips.authorId, userId))
      .orderBy(desc(trips.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ builds: rows, total, hasMore: offset + rows.length < total, limit, offset });
  } catch (err: any) {
    console.error("[ready-made] builds error:", err);
    res.status(500).json({ message: "Failed to load builds", error: err.message });
  }
});

// ─── W-3/W-4: authored-build edit (title + destination) ──────────────────────
// An authored build has no direct trips-PATCH surface (that path is traveler-owner-gated).
// This edits the trip directly. W-4 (location-aware builds): `destination` joins `title` in the
// allow-list — the location the expert sets drives what data loads (neighborhood grouping,
// platform-services search, format resolution). Allow-list body — these two fields ONLY, never
// raw req.body (the Gap-2 mass-assignment lesson, §10); at least one must be present. Owner
// gate = getAuthoredTrip (explicit present-value author check, never getTripRole). The §12
// launch gate does NOT apply here — it lives on ship-to-store; a listing's market is its own
// field and is unaffected by a later build-destination edit. ROUTE ORDER: registered BEFORE
// PATCH /api/expert/ready-made/:id so the literal "build" segment can't be captured by :id.
const editBuildSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  destination: z.string().trim().min(1).max(100).optional(),
}).strict().refine((d) => d.title !== undefined || d.destination !== undefined, {
  message: "Provide title and/or destination",
});

router.patch("/api/expert/ready-made/build/:tripId", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Owner gate: explicit present-value author check (never getTripRole).
    const trip = await getAuthoredTrip(req.params.tripId, userId);
    if (!trip) return res.status(403).json({ message: "Not this build's author" });

    const parsed = editBuildSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    }

    const [updated] = await db
      .update(trips)
      .set({
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.destination !== undefined ? { destination: parsed.data.destination } : {}),
      } as any)
      .where(eq(trips.id, trip.id))
      .returning({ id: trips.id, title: trips.title, destination: trips.destination });

    res.json({ trip: updated });
  } catch (err: any) {
    console.error("[ready-made] build edit error:", err);
    res.status(500).json({ message: "Failed to edit build", error: err.message });
  }
});

// ─── W-5/W2-B: delete a build (v1: never-shipped drafts; W2-B: also a shipped build whose
// listing has been WITHDRAWN and never sold — see refusal (c)/(c2) below). Id from the path,
// user from the session — no req.body is ever read here (§14 posture; this isn't a money
// endpoint either way). ROUTE ORDER: registered after PATCH .../build/:tripId, both under the
// literal "build" segment, so :id here can't be shadowed by (nor shadow) any :id-style route
// above it.
router.delete("/api/expert/ready-made/build/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const tripId = req.params.id;

    // (a) Load + (b) AUTHOR GATE — mirrors the PATCH build handler's exact predicate/session-id
    // extraction: getAuthoredTrip (explicit present-value author check, never getTripRole), a
    // single 403 for both "no such trip" and "not the author" so existence is never leaked.
    const trip = await getAuthoredTrip(tripId, userId);
    if (!trip) return res.status(403).json({ message: "Not this build's author" });

    // (c) REFUSE if this build has a listing that hasn't been withdrawn — a live/pending listing
    // (draft/submitted/approved/rejected) can't have its source trip pulled out from under it.
    // W2-B: a WITHDRAWN listing no longer blocks deletion by itself — withdrawing already hid it
    // from every public surface (see the /withdraw handler above), so nothing further is exposed
    // by removing the trip too, UNLESS it carries sold history (c2 below).
    const [listing] = await db
      .select({ id: readyMadeTrips.id, status: readyMadeTrips.status })
      .from(readyMadeTrips)
      .where(eq(readyMadeTrips.sourceTripId, tripId))
      .limit(1);
    if (listing && listing.status !== "withdrawn") {
      return res.status(409).json({
        message: "Shipped builds can't be deleted — withdraw the listing from the store first.",
      });
    }

    // (c2) Sold history is never deleted. `ready_made_purchases` has NO pre-payment state by
    // design (migration 133 — a row is created only AFTER Stripe verifies `succeeded`), so
    // existence of ANY purchase row for this listing — 'paid', 'cloned', or even 'refunded' —
    // means a real completed transaction happened against it; an abandoned checkout leaves no
    // row at all. So a bare existence check is the correct "was this ever sold?" test.
    if (listing) {
      const [sold] = await db
        .select({ id: readyMadePurchases.id })
        .from(readyMadePurchases)
        .where(eq(readyMadePurchases.readyMadeTripId, listing.id))
        .limit(1);
      if (sold) {
        return res.status(409).json({
          message: "This build was sold — its history can't be deleted.",
        });
      }
    }

    // (d) REFUSE if a client assignment exists on this trip. Defensive: an authored build
    // (userId=NULL, authorId=caller) shouldn't ever carry an advisor row, but check anyway.
    const [advisor] = await db
      .select({ id: tripExpertAdvisors.id })
      .from(tripExpertAdvisors)
      .where(eq(tripExpertAdvisors.tripId, tripId))
      .limit(1);
    if (advisor) {
      return res.status(409).json({
        message: "This build has a client assignment and can't be deleted.",
      });
    }

    // (e) DEFENSIVE INVARIANT: never delete paid history. Refuse if any itinerary item on this
    // trip is already routed to checkout (purchased) or carries a real booking.
    const [paidItem] = await db
      .select({ id: itineraryItems.id })
      .from(itineraryItems)
      .where(
        and(
          eq(itineraryItems.tripId, tripId),
          sql`(${itineraryItems.routingStatus} = 'purchased' OR ${itineraryItems.bookingId} IS NOT NULL)`,
        ),
      )
      .limit(1);
    if (paidItem) {
      return res.status(409).json({
        message: "This build has paid itinerary history and can't be deleted.",
      });
    }

    // (f) Delete. A withdrawn zero-purchase listing (if any — refusal (c)/(c2) above already
    // guarantee it's withdrawn and unsold) is deleted FIRST: `ready_made_trips.source_trip_id`
    // has no ON DELETE action, so deleting the trip while the listing row still references it
    // would FK-violate. itinerary_items (and every other trip-scoped child table) cascade at the
    // DB level (ON DELETE CASCADE on trip_id) once the trip delete runs.
    if (listing) {
      await db.delete(readyMadeTrips).where(eq(readyMadeTrips.id, listing.id));
    }
    await storage.deleteTrip(tripId);
    res.status(204).send();
  } catch (err: any) {
    console.error("[ready-made] build delete error:", err);
    res.status(500).json({ message: "Failed to delete build", error: err.message });
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
    market: z.string().trim().min(1).max(100)
      .refine(isLaunchMarket, { message: STORE_GATE_MESSAGE }), // §12/F8 launch scope
    durationDays: z.number().int().min(1).max(30),
    // Closed vocabulary — the "Type of Plan" line of the store's quality structure.
    planType: z.enum(READY_MADE_PLAN_TYPE_KEYS as [ReadyMadePlanTypeKey, ...ReadyMadePlanTypeKey[]]).nullable(),
    // Free-text theme label, ONLY meaningful when planType === "custom" (migration 184). Length
    // (3..80 trimmed) and the "accompanies custom" rule are enforced below, after safeParse —
    // never at the zod layer alone, since validity here depends on the (possibly-unpatched)
    // planType value.
    planTypeCustom: z.string().trim().max(80).nullable(),
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

    // "custom" plan type (migration 184): valid ONLY with an accompanying 3..80 trimmed
    // planTypeCustom; any non-custom key clears/nulls the custom text on save. Effective planType
    // = the patched value if present, else the listing's current stored value — so a save that
    // only touches planTypeCustom is validated against the listing's existing plan type.
    const effectivePlanType = patch.planType !== undefined ? patch.planType : (existing.planType as string | null);
    if (isCustomPlanType(effectivePlanType)) {
      const rawCustom = patch.planTypeCustom !== undefined ? patch.planTypeCustom : (existing.planTypeCustom as string | null);
      const trimmedCustom = typeof rawCustom === "string" ? rawCustom.trim() : "";
      if (trimmedCustom.length < 3 || trimmedCustom.length > 80) {
        return res.status(400).json({
          message: "Custom plan type requires a 3–80 character theme label",
        });
      }
      patch.planTypeCustom = trimmedCustom;
    } else {
      patch.planTypeCustom = null;
    }

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
 * §15: the transition is an atomic conditional UPDATE (draft|rejected|withdrawn → submitted); a
 * double-click or a race with an admin decision matches 0 rows and returns 409 instead of
 * silently re-submitting. Approval itself stays admin-only (D1a) — this endpoint can never
 * set 'approved'. W2-B: 'withdrawn' is not terminal — the author can re-list, and a
 * withdrawn-then-resubmitted listing re-enters the admin queue exactly like a rejected one
 * (D1a: never straight back to 'approved').
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
    // §12/F8: a grandfathered non-launch-market listing can't enter the store queue.
    if (!isLaunchMarket(listing.market)) {
      missing.push({ requirement: "market", message: STORE_GATE_MESSAGE });
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
        inArray(readyMadeTrips.status, ["draft", "rejected", "withdrawn"]),
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
 * W2-B: Withdraw from the store — the author's counterpart to /submit. Hides a listing from
 * every public surface immediately, regardless of its current status (submitted OR approved):
 * every public read (the store feed, the public detail page, the storefront lane, the share-image
 * renderer) gates on `status === 'approved'`, so flipping to 'withdrawn' alone satisfies all of
 * them — no `active` flag needed (leaving `active` untouched also avoids corrupting a future
 * resubmit-then-approve cycle, since nothing else in this file ever flips `active` back to true).
 *
 * Existing purchases are UNAFFECTED: a ready-made purchase snapshots the source trip into the
 * buyer's own clone at fulfillment time (`ready-made-purchase.service.ts`) and the buyer's
 * purchased-trips read (`GET /api/ready-made/purchases/mine`) never filters on listing status —
 * there is no live reference back to the listing's approval state once a purchase exists.
 *
 * Author gate FIRST, via the same `loadAuthorListing` every sibling endpoint uses (scoped to
 * `author_id = caller` in the SELECT itself) — a non-author and a nonexistent id both get the
 * identical 404 "Listing not found", so a non-author can never learn whether the listing exists,
 * let alone its status (matches every sibling in this file: PATCH /:id, /submit, /build-review,
 * /earnings-preview all use this same loader + 404).
 *
 * §15: the transition is an atomic conditional UPDATE (status <> 'withdrawn' -> 'withdrawn'); a
 * double-click/retry matches 0 rows and returns 409 alreadyWithdrawn instead of a silent no-op.
 */
router.post("/api/expert/ready-made/:id/withdraw", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const listing = await loadAuthorListing(req.params.id, userId);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const [updated] = await db
      .update(readyMadeTrips)
      .set({ status: "withdrawn", updatedAt: new Date() } as any)
      .where(and(eq(readyMadeTrips.id, listing.id), ne(readyMadeTrips.status, "withdrawn")))
      .returning();
    if (!updated) {
      return res.status(409).json({ message: "Listing is already withdrawn", status: "withdrawn" });
    }

    res.json({ listing: updated });
  } catch (err: any) {
    console.error("[ready-made] withdraw error:", err);
    res.status(500).json({ message: "Failed to withdraw listing" });
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
        revisionStatus: readyMadePurchases.revisionStatus,
        disputeStatus: readyMadePurchases.disputeStatus,
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

    // Ledger 2026-08-22-concierge-p3: `refundEligible` is RETIRED with the self-serve refund —
    // the row now carries the concierge facts instead (revisionStatus / disputeStatus), and the
    // client renders the revision + "something wrong" affordances from them.
    res.json({ purchases: rows });
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
      return res.status(403).json({ message: STORE_GATE_MESSAGE });
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
router.get("/api/ready-made", async (req, res) => {
  try {
    // Optional author filter (lane nav-storefront D2 — the expert-profile Ready-Made lane).
    // Mirrors GET /api/expert-templates' ?expertId= posture (destructure off req.query),
    // hardened to a plain-id shape: users.id is a UUID or a numeric auth id, so anything
    // outside [A-Za-z0-9_-] is rejected outright rather than passed into the query.
    // No param ⇒ the full approved feed, unchanged.
    const rawAuthorId = req.query.authorId;
    let authorId: string | undefined;
    if (rawAuthorId !== undefined) {
      if (typeof rawAuthorId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(rawAuthorId)) {
        return res.status(400).json({ message: "Invalid authorId" });
      }
      authorId = rawAuthorId;
    }

    // Optional theme filter (ledger 2026-08-22-ready-made-themes: the shelf reorganizes around
    // the experience). Validated against the closed vocabulary the submit gate already enforces —
    // an unknown key is a 400, never a silently-empty shelf. No param ⇒ full feed, unchanged.
    const rawPlanType = req.query.planType;
    let planType: ReadyMadePlanTypeKey | undefined;
    if (rawPlanType !== undefined) {
      if (
        typeof rawPlanType !== "string" ||
        !(READY_MADE_PLAN_TYPE_KEYS as readonly string[]).includes(rawPlanType)
      ) {
        return res.status(400).json({ message: "Invalid planType" });
      }
      planType = rawPlanType as ReadyMadePlanTypeKey;
    }

    // Expert-minted theme filter (ledger 2026-08-22-expert-minted-themes, decision-maker
    // directed: "give the experts the ability to add new categories — we shouldn't stifle
    // creativity"). A `custom` listing's free-text label IS its category on the browse surface,
    // so it needs a filter of its own. The label matches STORED author-typed data
    // (case/whitespace-insensitive) under the same custom-key discipline — free text still
    // never enters the validated plan_type column. Shape-validated only (a label that matches
    // nothing returns an honestly-empty list, not a 400 — the UI offers only labels with
    // stock, so empty here means the listing was since unpublished).
    const rawCustomLabel = req.query.customLabel;
    let customLabel: string | undefined;
    if (rawCustomLabel !== undefined) {
      if (
        typeof rawCustomLabel !== "string" ||
        rawCustomLabel.trim().length === 0 ||
        rawCustomLabel.length > 120
      ) {
        return res.status(400).json({ message: "Invalid customLabel" });
      }
      if (planType !== undefined && planType !== "custom") {
        return res.status(400).json({ message: "customLabel only applies to planType=custom" });
      }
      customLabel = rawCustomLabel.trim().toLowerCase();
    }

    const rows = await db
      .select({
        id: readyMadeTrips.id,
        title: readyMadeTrips.title,
        planType: readyMadeTrips.planType,
        planTypeCustom: readyMadeTrips.planTypeCustom,
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
        // MP-2: the storefront return path. Nullable (migration 136) — an author who
        // has not claimed a handle has no /p/ page, and the client renders no link.
        authorHandle: users.handle,
      })
      .from(readyMadeTrips)
      .innerJoin(users, eq(users.id, readyMadeTrips.authorId))
      .where(and(
        eq(readyMadeTrips.status, "approved"),
        eq(readyMadeTrips.active, true),
        // Same approved+active gate with or without the filters — author/theme scope narrows
        // the feed, never widens what an unapproved listing can leak (F2/§10 read-gate).
        ...(authorId ? [eq(readyMadeTrips.authorId, authorId)] : []),
        ...(planType ? [eq(readyMadeTrips.planType, planType)] : []),
        ...(customLabel
          ? [
              eq(readyMadeTrips.planType, "custom" as ReadyMadePlanTypeKey),
              sql`LOWER(TRIM(${readyMadeTrips.planTypeCustom})) = ${customLabel}`,
            ]
          : []),
      ))
      // CURATION ORDER (MP-3): badged listings lead, then most-recently-approved.
      //
      // Note this lane does NOT use the featured-sort bounded-boost primitive that the
      // services feed uses. That guardrail exists to stop editorial featuring from burying
      // a better-QUALITY native result — and `ready_made_trips` has no quality axis at all
      // (no rating column, no review table, no salesCount). With nothing measured there is
      // nothing to bury, so a straight badge tier is honest here. If a real quality signal
      // is ever added to this lane, move it onto featuredAdjustedScore rather than deepening
      // this ORDER BY.
      .orderBy(
        sql`CASE WHEN ${readyMadeTrips.badge} IS NULL THEN 1 ELSE 0 END`,
        desc(readyMadeTrips.reviewedAt),
      );

    res.json({
      listings: rows.map((r) => ({
        id: r.id,
        title: r.title,
        planType: r.planType,
        planTypeCustom: r.planTypeCustom,
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
        authorHandle: r.authorHandle ?? null,
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
        planTypeCustom: readyMadeTrips.planTypeCustom,
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
        authorHandle: users.handle, // MP-2 storefront return path (nullable)
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
        planTypeCustom: row.planTypeCustom,
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
        authorHandle: row.authorHandle ?? null,
        section: row.authorRole === "local_expert" ? "trips_by_locals" : "advisor",
      },
      preview: isAuthorPreview,
    });
  } catch (err: any) {
    console.error("[ready-made] detail error:", err);
    res.status(500).json({ message: "Failed to load trip" });
  }
});

// ─── Public teaser map (pre-purchase store page) ──────────────────────────────
//
// Public, NO auth — serves the store detail page's map preview. Gate mirrors the public detail
// endpoint above (approved + active only; a non-public listing gets the same 404 as "doesn't
// exist" — no draft-listing oracle). CRITICAL REDACTION RULE: raw item coordinates never reach
// an unpurchased client — every stop is rendered server-side with its position jittered by
// ready-made-teaser-map.service.ts before it ever becomes a pixel. See that module's header for
// the full doctrine.
router.get("/api/ready-made/:id/teaser-map.svg", async (req, res) => {
  try {
    const [listing] = await db
      .select({
        id: readyMadeTrips.id,
        status: readyMadeTrips.status,
        active: readyMadeTrips.active,
        sourceTripId: readyMadeTrips.sourceTripId,
      })
      .from(readyMadeTrips)
      .where(eq(readyMadeTrips.id, req.params.id))
      .limit(1);
    // Same public-visibility predicate as GET /api/ready-made/:id — no draft-listing oracle.
    if (!listing || listing.status !== "approved" || !listing.active) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const [trip] = await db
      .select({ destination: trips.destination })
      .from(trips)
      .where(eq(trips.id, listing.sourceTripId))
      .limit(1);

    // Itinerary order = dayNumber, then sortOrder (the same ordering the workspace itinerary
    // itself renders in) — the teaser service groups by day and connects each day's located
    // stops in this order.
    const items = await db
      .select({
        id: itineraryItems.id,
        dayNumber: itineraryItems.dayNumber,
        latitude: itineraryItems.latitude,
        longitude: itineraryItems.longitude,
      })
      .from(itineraryItems)
      .where(eq(itineraryItems.tripId, listing.sourceTripId))
      .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder));

    // Per-day distance legend — ONLY real transport_legs rows, trip-scoped (variantId IS NULL
    // per the migration-154 scope rule). No legs → the service omits the legend entirely; never
    // estimated here (§13).
    const legRows = await db
      .select({
        dayNumber: transportLegs.dayNumber,
        totalMeters: sql<number>`sum(${transportLegs.distanceMeters})::int`,
      })
      .from(transportLegs)
      .where(and(eq(transportLegs.tripId, listing.sourceTripId), isNull(transportLegs.variantId)))
      .groupBy(transportLegs.dayNumber)
      .orderBy(asc(transportLegs.dayNumber));

    const svg = renderReadyMadeTeaserMapSvg({
      listingId: listing.id,
      destination: trip?.destination ?? null,
      items,
      dayDistances: legRows.map((r) => ({ dayNumber: r.dayNumber, totalMeters: Number(r.totalMeters) })),
    });

    res.set({
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    });
    return res.status(200).send(svg);
  } catch (err: any) {
    console.error("[ready-made] teaser-map error:", err);
    res.status(500).json({ message: "Failed to render teaser map" });
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
    const stripeClient = new Stripe(getStripeSecretKey() || "", {
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
    const stripeClient = new Stripe(getStripeSecretKey() || "", {
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
      // The buyer's next stop: their own editable copy, delivered to the canonical Trip Slip
      // (/plans/:id, the SlipView) — the ONE plan surface the rest of the app funnels to, where
      // "Optimize this plan", "Add all to cart" (book the plan's services), and the expert note
      // live. Landing a purchase on the older /trip/ detail page was an inconsistency (ledger
      // 2026-08-22-readymade-slip-delivery).
      redirect: result.cloneTripId ? `/plans/${result.cloneTripId}` : null,
    });
  } catch (err: any) {
    console.error("[ready-made] purchase confirm error:", err);
    res.status(500).json({ message: "Failed to confirm purchase" });
  }
});

// ─── Concierge concern — the buyer's recourse after the self-serve refund removal ───────────
//
// Ledger 2026-08-22-concierge-p3: the D7 self-serve refund route that lived here is RETIRED —
// ratified model: no self-serve refunds; every purchase includes 1 consult + 1 revision, and a
// buyer who is still unhappy opens a CONCERN for admin review (refund = the admin escape hatch,
// /api/admin/ready-made/disputes). The buyer-actor branch of refundReadyMadePurchaseLedger is
// intentionally kept (proven by verify-ready-made-phase2) — it simply has no route anymore.
//
// Shape: §14 actor from session; allowlist body ({reason} only); §15 atomic conditional claim —
// `WHERE buyer_id=? AND status IN ('paid','cloned') AND dispute_status IS NULL` kills double-open
// and concerns on refunded/revoked rows in one predicate. On the winning claim: the author's
// escrowed earning is FROZEN (dispute_state='open', the same mechanism the release job and the
// payable-balance summary already honor) so it cannot release/pay out while the dispute is
// pending — the ratified Q1 "prevent" rule's first half — and admins are notified.
router.post("/api/ready-made/purchases/:id/concern", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 2000) : "";
    if (!reason) return res.status(400).json({ message: "Tell us what went wrong so we can review it" });

    const [claimed] = await db
      .update(readyMadePurchases)
      .set({ disputeStatus: "open", disputeReason: reason, disputedAt: new Date() } as any)
      .where(and(
        eq(readyMadePurchases.id, req.params.id),
        eq(readyMadePurchases.buyerId, userId),
        inArray(readyMadePurchases.status, ["paid", "cloned"]),
        isNull(readyMadePurchases.disputeStatus),
      ))
      .returning();
    if (!claimed) {
      // Lost claim: not yours (404-shape kept vague — no purchase-id oracle), already
      // disputed, or refunded/revoked. One honest 409 covers the reachable owner cases.
      const [current] = await db.select().from(readyMadePurchases)
        .where(and(eq(readyMadePurchases.id, req.params.id), eq(readyMadePurchases.buyerId, userId)))
        .limit(1);
      if (!current) return res.status(404).json({ message: "Purchase not found" });
      return res.status(409).json({
        message: current.disputeStatus
          ? "A concern is already on file for this purchase"
          : "This purchase is not eligible for a concern",
        disputeStatus: current.disputeStatus ?? null,
      });
    }

    // Freeze the author's escrowed earning while the dispute is open (Q1 "prevent", half 1).
    // reference_id IS the purchase id on this surface — setBookingEarningsDispute reuses as-is (L6).
    await storage.setBookingEarningsDispute(claimed.id, true).catch((err: any) => {
      console.error("[ready-made] concern earnings-freeze failed (dispute still open):", err?.message);
    });

    // Surface to admins: notification row + the queue reads open disputes directly.
    try {
      const [listing] = await db.select({ title: readyMadeTrips.title })
        .from(readyMadeTrips).where(eq(readyMadeTrips.id, claimed.readyMadeTripId)).limit(1);
      await db.insert(adminNotifications).values({
        type: "concierge_dispute_created",
        message: `Ready-Made concern opened on "${listing?.title ?? claimed.readyMadeTripId}"`,
        reason: reason.slice(0, 500),
        metadata: { purchaseId: claimed.id, readyMadeTripId: claimed.readyMadeTripId },
      } as any);
    } catch (err: any) {
      console.error("[ready-made] concern admin-notification failed:", err?.message);
    }

    return res.json({ success: true, disputeStatus: "open" });
  } catch (err: any) {
    console.error("[ready-made] concern error:", err);
    res.status(500).json({ message: "Failed to submit concern" });
  }
});

// ─── Concierge revision (ledger 2026-08-22-concierge-revision) ──────────────────────────────
//
// Every ready-made purchase includes ONE consultation + ONE revision from the selling expert.
// P1 = the entitlement spine: the buyer's slip reads the entitlement by clone trip, and the
// buyer requests the revision — which grants the selling expert WRITE access to the buyer's own
// clone (§12 advisor write-status) so they can make the changes (P2 wires the Suggest→approve
// delivery + the consult chat + the escrow SLA).

// GET the entitlement for the buyer's cloned trip — the Concierge card's data source. Owner-scoped
// (the purchase's buyerId must be the session). Returns null when this trip is not a ready-made
// clone the caller owns, so the card renders nothing (never a card on a non-purchased trip).
router.get("/api/ready-made/purchases/by-clone/:tripId", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // P2: the effective revision status is DERIVED from the selling expert's advisor
    // workspaceStatus on the clone — the SAME deliver state machine (draft→in_review→delivered)
    // the expert already drives — so the buyer's card reflects real progress with no second
    // source of truth to drift (§18 derivation discipline). The `revision_status` column stays
    // the "requested" marker (NULL=available). LEFT JOIN so a purchase with no advisor row yet
    // still resolves.
    const [row] = await db
      .select({
        purchaseId: readyMadePurchases.id,
        status: readyMadePurchases.status,
        revisionStatus: readyMadePurchases.revisionStatus,
        revisionRequestedAt: readyMadePurchases.revisionRequestedAt,
        expertUserId: readyMadeTrips.authorId,
        expertFirstName: users.firstName,
        expertHandle: users.handle,
        advisorWorkspaceStatus: tripExpertAdvisors.workspaceStatus,
      })
      .from(readyMadePurchases)
      .innerJoin(readyMadeTrips, eq(readyMadeTrips.id, readyMadePurchases.readyMadeTripId))
      .innerJoin(users, eq(users.id, readyMadeTrips.authorId))
      .leftJoin(
        tripExpertAdvisors,
        and(
          eq(tripExpertAdvisors.tripId, readyMadePurchases.cloneTripId),
          eq(tripExpertAdvisors.localExpertId, readyMadeTrips.authorId),
        ),
      )
      .where(and(
        eq(readyMadePurchases.cloneTripId, req.params.tripId),
        eq(readyMadePurchases.buyerId, userId),
        // P3: a refunded (soft-revoked) purchase keeps the clone but loses the entitlement —
        // the card renders nothing rather than offering a revision that would 409.
        inArray(readyMadePurchases.status, ["paid", "cloned"]),
      ))
      .limit(1);

    if (!row) return res.json({ purchase: null });

    // NULL revision_status ⇒ available; otherwise derive from the expert's workspace state.
    let effectiveRevisionStatus: "available" | "requested" | "in_progress" | "delivered";
    if (!row.revisionStatus) {
      effectiveRevisionStatus = "available";
    } else if (row.advisorWorkspaceStatus === "delivered") {
      effectiveRevisionStatus = "delivered";
    } else if (row.advisorWorkspaceStatus === "in_review") {
      effectiveRevisionStatus = "in_progress";
    } else {
      effectiveRevisionStatus = "requested";
    }

    res.json({
      purchase: {
        purchaseId: row.purchaseId,
        status: row.status,
        revisionStatus: effectiveRevisionStatus,
        revisionRequestedAt: row.revisionRequestedAt,
        expertUserId: row.expertUserId,
        expertName: row.expertFirstName ?? "your expert",
        expertHandle: row.expertHandle ?? null,
      },
    });
  } catch (err: any) {
    console.error("[ready-made] entitlement lookup error:", err);
    res.status(500).json({ message: "Failed to load concierge entitlement" });
  }
});

// Buyer requests their included revision. Idempotent by construction: the status transition is an
// atomic conditional (WHERE revision_status IS NULL), so a double-click can only claim once. On the
// winning claim it grants the SELLING EXPERT write access to the buyer's clone (§12 advisor
// write-status 'accepted'), carrying the buyer's note. §14: the acting user is the session, never
// the body; the body is a strict allowlist (note only).
const requestRevisionSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
router.post("/api/ready-made/purchases/:id/request-revision", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const parsed = requestRevisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    const note = parsed.data.note ?? null;

    // Load + ownership check (404 for not-yours too — don't leak other buyers' purchase ids).
    const [purchase] = await db
      .select()
      .from(readyMadePurchases)
      .where(eq(readyMadePurchases.id, req.params.id))
      .limit(1);
    if (!purchase || purchase.buyerId !== userId) {
      return res.status(404).json({ message: "Purchase not found" });
    }
    if (purchase.status !== "cloned" || !purchase.cloneTripId) {
      return res.status(409).json({ message: "This trip isn't ready for a revision yet." });
    }

    // Atomic claim: only an unused entitlement (revision_status IS NULL) transitions to 'requested'.
    const [claimed] = await db
      .update(readyMadePurchases)
      .set({ revisionStatus: "requested", revisionRequestNote: note, revisionRequestedAt: new Date() } as any)
      .where(and(
        eq(readyMadePurchases.id, purchase.id),
        eq(readyMadePurchases.buyerId, userId),
        isNull(readyMadePurchases.revisionStatus),
      ))
      .returning();
    if (!claimed) {
      return res.status(409).json({ message: "Your included revision has already been requested." });
    }

    // Grant the selling expert WRITE access to the buyer's clone so they can make the changes.
    // status='accepted' is a §12 write-access status; the note rides as the assignment message.
    // Upsert: if a row already exists (e.g. re-grant), (re)assert write access.
    const [listing] = await db
      .select({ authorId: readyMadeTrips.authorId })
      .from(readyMadeTrips)
      .where(eq(readyMadeTrips.id, purchase.readyMadeTripId))
      .limit(1);
    if (listing?.authorId) {
      await db
        .insert(tripExpertAdvisors)
        .values({
          tripId: purchase.cloneTripId,
          localExpertId: listing.authorId,
          status: "accepted",
          message: note ?? "Concierge revision requested by the buyer.",
        } as any)
        .onConflictDoUpdate({
          target: [tripExpertAdvisors.tripId, tripExpertAdvisors.localExpertId],
          set: { status: "accepted" },
        });
    }

    res.json({ purchase: { purchaseId: claimed.id, revisionStatus: claimed.revisionStatus, revisionRequestedAt: claimed.revisionRequestedAt } });
  } catch (err: any) {
    console.error("[ready-made] request-revision error:", err);
    res.status(500).json({ message: "Failed to request revision" });
  }
});

export default router;
