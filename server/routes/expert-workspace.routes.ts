import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import {
  dmoSources,
  dmoRawContent,
  expertDmoCollections,
  expertDmoCollectionItems,
  expertDmoEdits,
  contentGapAlerts,
  dmoScrapeJobs,
  trips,
  readyMadeTrips,
} from "@shared/schema";
import { eq, and, or, ilike, desc, asc, sql, count, gte, lte, isNull, not, inArray } from "drizzle-orm";
import { asyncHandler, ForbiddenError, ValidationError, NotFoundError } from "../infrastructure";
import { isExpertRole } from "@shared/roles";
import { createDMOCrawler } from "../content/scrapers/DMOCrawler";
import {
  ALL_DMO_SOURCES,
  getSourcesByMarket,
  getMarketGapSummary,
} from "../content/providers/DMOSourceRegistry";

const router = Router();

// ============================================================
// MIDDLEWARE
// ============================================================

function requireExpert(req: any, res: any, next: any) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = req.user;
  const role = user?.role || user?.claims?.role;
  // Canonical expert family (shared/roles.ts, role-vocabulary audit): the previous local
  // list omitted bare "expert" (locking those users out of the DMO workspace) and included
  // executive_assistant (EA has its own /ea console and no client path to /expert/*).
  if (!isExpertRole(role) && role !== "admin") {
    return res.status(403).json({ message: "Expert access required" });
  }
  next();
}

// ============================================================
// DMO SOURCES — Browse the global source registry
// ============================================================

router.get(
  "/sources",
  asyncHandler(async (req: Request, res: Response) => {
    const market = (req.query.market as string) || undefined;
    const sourceType = (req.query.sourceType as string) || undefined;
    const region = (req.query.region as string) || undefined;

    let sources = ALL_DMO_SOURCES;
    if (market) sources = sources.filter((s) => s.market === market || s.market === "global");
    if (sourceType) sources = sources.filter((s) => s.sourceType === sourceType);
    if (region) sources = sources.filter((s) => s.marketRegion === region || s.marketRegion === "global");

    res.json({
      count: sources.length,
      markets: [...new Set(sources.map((s) => s.market))],
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        sourceType: s.sourceType,
        market: s.market,
        marketRegion: s.marketRegion,
        confidence: s.confidence,
        isActive: s.isActive,
        apiEndpoint: s.apiEndpoint,
        partnerPortalUrl: s.partnerPortalUrl,
        attributionRequired: s.attributionRequired,
        notes: s.notes,
      })),
    });
  }),
);

router.get(
  "/sources/gap-summary",
  asyncHandler(async (_req: Request, res: Response) => {
    const summary = getMarketGapSummary();
    res.json(summary);
  }),
);

// ============================================================
// DMO LIBRARY — Browse raw ingested content
// ============================================================

const libraryQuerySchema = z.object({
  market: z.string().optional(),
  city: z.string().optional(),
  contentType: z.string().optional(),
  status: z.string().optional().default("pending_expert_review"),
  search: z.string().optional(),
  confidenceMin: z.string().optional(),
  confidenceMax: z.string().optional(),
  page: z.string().optional().default("1"),
  limit: z.string().optional().default("20"),
  sortBy: z.string().optional().default("scraped_at"),
  sortOrder: z.string().optional().default("desc"),
});

router.get(
  "/library",
  requireExpert,
  asyncHandler(async (req: Request, res: Response) => {
    const params = libraryQuerySchema.parse(req.query);
    const page = Math.max(1, parseInt(params.page, 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10)));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (params.market) {
      conditions.push(eq(dmoRawContent.country, params.market));
    }
    if (params.city) {
      conditions.push(eq(dmoRawContent.city, params.city));
    }
    if (params.contentType) {
      conditions.push(eq(dmoRawContent.contentType, params.contentType));
    }
    if (params.status) {
      conditions.push(eq(dmoRawContent.status, params.status));
    }
    if (params.confidenceMin) {
      conditions.push(gte(dmoRawContent.confidenceScore, params.confidenceMin));
    }
    if (params.confidenceMax) {
      conditions.push(lte(dmoRawContent.confidenceScore, params.confidenceMax));
    }
    if (params.search) {
      const searchTerm = `%${params.search}%`;
      conditions.push(
        or(
          ilike(dmoRawContent.name, searchTerm),
          ilike(dmoRawContent.description, searchTerm),
          ilike(dmoRawContent.searchVector, searchTerm),
        ),
      );
    }

    // Only show expert-workspace-visible content
    conditions.push(eq(dmoRawContent.expertWorkspaceVisible, true));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, totalResult] = await Promise.all([
      db
        .select()
        .from(dmoRawContent)
        .where(whereClause)
        .orderBy(params.sortOrder === "asc" ? asc(dmoRawContent.scrapedAt) : desc(dmoRawContent.scrapedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(dmoRawContent).where(whereClause),
    ]);

    res.json({
      page,
      limit,
      total: totalResult[0]?.count || 0,
      items: items.map((item) => ({
        ...item,
        rawData: undefined, // Don't send raw payload to client — too large
        extractedData: undefined,
        normalizedData: undefined,
        embeddingVector: undefined,
      })),
    });
  }),
);

router.get(
  "/library/:id",
  requireExpert,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const item = await storage.getDmoRawContentById(id);

    if (!item) {
      throw new NotFoundError("Content not found");
    }

    res.json(item);
  }),
);

// ============================================================
// EXPERT COLLECTIONS — Curated subsets of DMO Library
// ============================================================

router.get(
  "/collections",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const expertId = req.user?.claims?.sub || req.user?.id;
    const market = req.query.market as string | undefined;

    const conditions = [eq(expertDmoCollections.expertId, expertId)];
    if (market) conditions.push(eq(expertDmoCollections.market, market));

    const collections = await db
      .select()
      .from(expertDmoCollections)
      .where(and(...conditions))
      .orderBy(desc(expertDmoCollections.updatedAt));

    res.json(collections);
  }),
);

router.post(
  "/collections",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const expertId = req.user?.claims?.sub || req.user?.id;

    const schema = z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      market: z.string().min(1).max(100),
      contentTypeFilter: z.string().optional(),
      tagFilter: z.array(z.string()).optional(),
      isPublic: z.boolean().optional().default(false),
    });

    const data = schema.parse(req.body);

    const [collection] = await db
      .insert(expertDmoCollections)
      .values({
        expertId,
        ...data,
      })
      .returning();

    res.status(201).json(collection);
  }),
);

// ============================================================
// DMO → ITINERARY BRIDGE — turn curated DMO content into a sellable store-trip draft
// ============================================================
//
// The point of the DMO library is to let experts build unique, sellable itineraries from real
// local content. This seeds the REAL ready_made_trips store lane (the expert_templates seller
// surface is sunset — §10/§17): it creates the same authoring pair `POST /api/expert/ready-made`
// creates (a trip with userId=NULL + authorId=caller, and a ready_made_trips listing row born
// 'draft' — D1a), then drops each selected DMO place onto that trip as an itinerary item
// (storage.createItineraryItem — the same storage call the live POST /api/trips/:tripId/
// itinerary-items path uses), grouped ~3 places per day in the caller's selection order. The
// expert then edits/prices it in the Workstation and submits it through the EXISTING store
// admin-approval queue before it can ever sell — this endpoint never publishes or approves
// anything; the draft is born unapproved, ownership is the session expert.
router.post(
  "/build-itinerary",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const expertId = req.user?.claims?.sub || req.user?.id;

    // Same gate as POST /api/expert/ready-made (D3, ready-made.routes.ts AUTHOR_ROLES):
    // this endpoint creates the identical authoring pair, so it must not be a looser side
    // door — requireExpert alone admits bare "expert"/event_planner off the session role,
    // while store authoring is DB-role-gated to local/travel experts during the Kyoto launch.
    const dbUser = await storage.getUser(expertId);
    if (!dbUser || !["local_expert", "travel_expert", "admin"].includes(dbUser.role ?? "")) {
      throw new ForbiddenError("Ready-made authoring requires a local expert or trip advisor role");
    }

    const schema = z.object({
      contentIds: z.array(z.string().min(1)).min(1).max(60),
      title: z.string().min(1).max(255).optional(),
    });
    const { contentIds, title } = schema.parse(req.body);

    // Load the selected DMO rows (any expert may build from the shared library).
    const rows = await db
      .select()
      .from(dmoRawContent)
      .where(inArray(dmoRawContent.id, contentIds));
    if (rows.length === 0) {
      throw new ValidationError("None of the selected content could be found.");
    }

    // Preserve the caller's selection order, then group ~3 places per day.
    const order = new Map(contentIds.map((id, i) => [id, i]));
    const ordered = [...rows].sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
    const PER_DAY = 3;
    const durationDays = Math.max(1, Math.ceil(ordered.length / PER_DAY));

    const city = ordered[0]?.city || "Kyoto";
    const draftTitle = title || `${city} itinerary (draft)`;

    // Same creation mechanism as POST /api/expert/ready-made: authoring trip (userId=NULL,
    // authorId=caller — traveler-surface exclusion by construction) + born-'draft' listing.
    // Placeholder dates: authoring trips are templates-in-the-making, not scheduled travel;
    // trips.start/end are NOT NULL so we anchor a synthetic window.
    const start = new Date();
    const end = new Date(start.getTime() + (durationDays - 1) * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const result = await db.transaction(async (tx) => {
      const [trip] = await tx
        .insert(trips)
        .values({
          userId: null,          // NULL owner = excluded from every traveler surface
          authorId: expertId,    // authoring-mode scope key
          title: draftTitle,
          destination: city,
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
          authorId: expertId,
          sourceTripId: trip.id,
          market: city,
          title: draftTitle,
          durationDays,
          status: "draft",       // born-draft (D1a) — approval only via the admin action
        } as any)
        .returning();

      return { trip, listing };
    });

    // Add the selected DMO places onto the trip as itinerary items (same storage call as the
    // live POST /api/trips/:tripId/itinerary-items path).
    for (let idx = 0; idx < ordered.length; idx++) {
      const row = ordered[idx];
      await storage.createItineraryItem({
        tripId: result.trip.id,
        title: row.name,
        description: row.shortDescription || row.description || "",
        itemType: "activity",
        dayNumber: Math.floor(idx / PER_DAY) + 1,
        locationName: row.city || null,
        suggestedBy: "expert",
        status: "planned",
        isFlexible: true,
      } as any);
    }

    res.status(201).json({
      tripId: result.trip.id,
      redirect: "/expert/workspace/" + result.trip.id,
      message: "Draft store trip created",
    });
  }),
);

router.get(
  "/collections/:id/items",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const collectionId = req.params.id;

    const items = await db
      .select({
        collectionItem: expertDmoCollectionItems,
        rawContent: dmoRawContent,
      })
      .from(expertDmoCollectionItems)
      .innerJoin(dmoRawContent, eq(expertDmoCollectionItems.rawContentId, dmoRawContent.id))
      .where(eq(expertDmoCollectionItems.collectionId, collectionId))
      .orderBy(desc(expertDmoCollectionItems.addedAt));

    res.json(
      items.map(({ collectionItem, rawContent }) => ({
        ...collectionItem,
        rawContent: {
          ...rawContent,
          rawData: undefined,
          extractedData: undefined,
          normalizedData: undefined,
          embeddingVector: undefined,
        },
      })),
    );
  }),
);

router.post(
  "/collections/:id/items",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const collectionId = req.params.id;
    const schema = z.object({
      rawContentId: z.string().uuid(),
      expertNotes: z.string().optional(),
      expertRating: z.number().min(1).max(5).optional(),
      customTags: z.array(z.string()).optional(),
    });

    const data = schema.parse(req.body);

    const [item] = await db
      .insert(expertDmoCollectionItems)
      .values({
        collectionId,
        ...data,
      })
      .returning();

    res.status(201).json(item);
  }),
);

router.delete(
  "/collections/:id/items/:itemId",
  requireExpert,
  asyncHandler(async (req: Request, res: Response) => {
    await db
      .delete(expertDmoCollectionItems)
      .where(eq(expertDmoCollectionItems.id, req.params.itemId));
    res.json({ success: true });
  }),
);

// ============================================================
// EXPERT EDITS — Enrich / override raw DMO content
// ============================================================

router.post(
  "/content/:id/edit",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const rawContentId = req.params.id;
    const expertId = req.user?.claims?.sub || req.user?.id;

    const schema = z.object({
      editedName: z.string().optional(),
      editedDescription: z.string().optional(),
      editedShortDescription: z.string().optional(),
      editedImages: z.array(z.string().url()).optional(),
      addedImages: z.array(z.string().url()).optional(),
      editedTags: z.array(z.string()).optional(),
      editedCategories: z.array(z.string()).optional(),
      editedEventTypes: z.array(z.string()).optional(),
      editedPricing: z.object({
        currency: z.string().optional(),
        range_min: z.number().optional(),
        range_max: z.number().optional(),
        basis: z.string().optional(),
        notes: z.string().optional(),
      }).optional(),
      editedCapacity: z.object({
        min: z.number().optional(),
        max: z.number().optional(),
        unit: z.string().optional(),
      }).optional(),
      editedHours: z.record(z.string()).optional(),
      editedAddress: z.string().optional(),
      editedLatitude: z.number().optional(),
      editedLongitude: z.number().optional(),
      vendorLinks: z.array(z.object({
        vendorId: z.string().optional(),
        serviceType: z.string(),
        notes: z.string().optional(),
      })).optional(),
    });

    const data = schema.parse(req.body);

    const [edit] = await db
      .insert(expertDmoEdits)
      .values({
        rawContentId,
        expertId,
        ...data,
        editStatus: "draft",
      })
      .returning();

    res.status(201).json(edit);
  }),
);

router.patch(
  "/edits/:editId/submit",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const editId = req.params.editId;
    const expertId = req.user?.claims?.sub || req.user?.id;

    const [edit] = await db
      .select()
      .from(expertDmoEdits)
      .where(and(eq(expertDmoEdits.id, editId), eq(expertDmoEdits.expertId, expertId)))
      .limit(1);

    if (!edit) throw new NotFoundError("Edit not found");

    const [updated] = await db
      .update(expertDmoEdits)
      .set({ editStatus: "submitted" })
      .where(eq(expertDmoEdits.id, editId))
      .returning();

    res.json(updated);
  }),
);

// ============================================================
// CONTENT GAP ALERTS — AI-generated missing content alerts
// ============================================================

router.get(
  "/gaps",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const market = req.query.market as string | undefined;
    const severity = req.query.severity as string | undefined;
    const assignedToMe = req.query.assignedToMe === "true";
    const expertId = req.user?.claims?.sub || req.user?.id;

    const conditions = [];
    if (market) conditions.push(eq(contentGapAlerts.market, market));
    if (severity) conditions.push(eq(contentGapAlerts.severity, severity));
    if (assignedToMe) conditions.push(eq(contentGapAlerts.assignedExpertId, expertId));
    else conditions.push(isNull(contentGapAlerts.resolvedAt));

    const alerts = await db
      .select()
      .from(contentGapAlerts)
      .where(and(...conditions))
      .orderBy(desc(contentGapAlerts.createdAt));

    res.json(alerts);
  }),
);

router.patch(
  "/gaps/:id/assign",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const alertId = req.params.id;
    const expertId = req.user?.claims?.sub || req.user?.id;

    const [updated] = await db
      .update(contentGapAlerts)
      .set({ assignedExpertId: expertId, updatedAt: new Date() })
      .where(eq(contentGapAlerts.id, alertId))
      .returning();

    res.json(updated);
  }),
);

router.patch(
  "/gaps/:id/resolve",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const alertId = req.params.id;
    const schema = z.object({
      resolutionNotes: z.string().optional(),
    });
    const { resolutionNotes } = schema.parse(req.body);

    const [updated] = await db
      .update(contentGapAlerts)
      .set({
        resolvedAt: new Date(),
        resolutionNotes,
        updatedAt: new Date(),
      })
      .where(eq(contentGapAlerts.id, alertId))
      .returning();

    res.json(updated);
  }),
);

// ============================================================
// SCRAPE JOBS — Trigger and monitor AI scraping
// ============================================================

router.post(
  "/scrape-jobs",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const schema = z.object({
      sourceId: z.string().optional(),
      jobType: z.enum(["search_extract", "crawl", "batch_scrape", "manual_import"]).default("search_extract"),
      market: z.string().min(1),
      query: z.string().optional(),
      targetUrls: z.array(z.string().url()).optional(),
      startUrl: z.string().url().optional(),
      includePaths: z.array(z.string()).optional(),
      excludePaths: z.array(z.string()).optional(),
      maxDepth: z.number().min(1).max(5).optional().default(2),
    });

    const data = schema.parse(req.body);

    const [job] = await db
      .insert(dmoScrapeJobs)
      .values({
        ...data,
        status: "queued",
      })
      .returning();

    // Fire-and-forget the actual scrape (do not await — response returns immediately)
    executeScrapeJob(job.id).catch((err) => {
      console.error(`[ScrapeJob] Background execution failed for job ${job.id}:`, err);
    });

    res.status(202).json(job);
  }),
);

router.get(
  "/scrape-jobs",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const market = req.query.market as string | undefined;
    const status = req.query.status as string | undefined;

    const conditions = [];
    if (market) conditions.push(eq(dmoScrapeJobs.market, market));
    if (status) conditions.push(eq(dmoScrapeJobs.status, status));

    const jobs = await db
      .select()
      .from(dmoScrapeJobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dmoScrapeJobs.createdAt))
      .limit(50);

    res.json(jobs);
  }),
);

router.get(
  "/scrape-jobs/:id",
  requireExpert,
  asyncHandler(async (req: Request, res: Response) => {
    const job = await storage.getDmoScrapeJobById(req.params.id);
    if (!job) throw new NotFoundError("Job not found");
    res.json(job);
  }),
);

// ============================================================
// BACKGROUND SCRAPE JOB EXECUTOR
// ============================================================

async function executeScrapeJob(jobId: string) {
  const job = await storage.getDmoScrapeJobById(jobId);
  if (!job) return;

  await db
    .update(dmoScrapeJobs)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(dmoScrapeJobs.id, jobId));

  try {
    const crawler = createDMOCrawler();
    let results: any[] = [];
    let recordsCreated = 0;

    const defaultPrompt = `
      Extract wedding/event venue information as JSON with these fields:
      venue_name (string), location.city (string), location.country (string), 
      location.lat (number), location.lng (number), venue_type (string: temple|church|hotel|quinta|palace|beach|garden|heritage|other),
      capacity.min (number), capacity.max (number), capacity.unit (string: guests|seated|standing),
      ceremony_types (string array), pricing.currency (string), pricing.range_min (number), pricing.range_max (number),
      pricing.basis (string: per_guest|flat|package), pricing.notes (string),
      description (string), images (string array of URLs), hours (object with day keys), address (string),
      phone (string), email (string), website (string), inquiry_required (boolean).
      If pricing is not listed, set inquiry_required to true.
    `;

    if (job.jobType === "search_extract" && job.query) {
      const urls = await crawler.discoverUrls(job.query, job.market);
      const batchResults = await crawler.batchScrape(urls, { prompt: defaultPrompt });
      results = batchResults;
    } else if (job.jobType === "crawl" && job.startUrl) {
      const crawlResults = await crawler.crawlSite(job.startUrl, {
        includePaths: (job.includePaths as string[]) || undefined,
        excludePaths: (job.excludePaths as string[]) || undefined,
        maxDepth: job.maxDepth || 2,
      });
      results = crawlResults;
    } else if (job.jobType === "batch_scrape" && job.targetUrls) {
      const batchResults = await crawler.batchScrape(job.targetUrls as string[], { prompt: defaultPrompt });
      results = batchResults;
    }

    // Store results as dmo_raw_content records
    for (const result of results) {
      if (!result.url) continue;

      const normalized = crawler.normalizeToSchema(
        result.json || {},
        result.url,
        job.sourceId || "manual",
        jobId,
      );

      await db
        .insert(dmoRawContent)
        .values(normalized)
        .onConflictDoNothing({ target: [dmoRawContent.sourceUrl, dmoRawContent.sourceId] });

      recordsCreated++;
    }

    await db
      .update(dmoScrapeJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        recordsCreated,
        totalUrls: results.length,
        processedUrls: results.length,
        updatedAt: new Date(),
      })
      .where(eq(dmoScrapeJobs.id, jobId));
  } catch (err: any) {
    await db
      .update(dmoScrapeJobs)
      .set({
        status: "failed",
        errorMessage: err.message,
        errorDetails: { stack: err.stack },
        updatedAt: new Date(),
      })
      .where(eq(dmoScrapeJobs.id, jobId));
  }
}

export default router;
