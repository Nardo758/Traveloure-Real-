import { Router, type Request, type Response } from "express";
import { getUserId } from "../utils/auth";
import { z } from "zod/v4";
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
} from "@workspace/db";
import { eq, ne, and, or, ilike, desc, asc, sql, count, gte, lte, isNull, not, inArray } from "drizzle-orm";
import { asyncHandler, ForbiddenError, ValidationError, NotFoundError } from "../infrastructure";
import { isExpertRole } from "@shared/roles";
import { LAUNCH_MARKETS, isLaunchMarket, STORE_GATE_MESSAGE } from "@shared/launch-markets";
import { createDMOCrawler } from "../content/scrapers/DMOCrawler";
import {
  ALL_DMO_SOURCES,
  getSourcesByMarket,
  getMarketGapSummary,
} from "../content/providers/DMOSourceRegistry";
import { searchWorkstationPlatformContent } from "../services/content-query.service";
import {
  getExtractedPlaceRows,
  mapRowsToPlaces,
  updateTicketingUrlByPosition,
  getExtractedPlacesCounts,
  isConcludedEmptyMarker,
} from "../services/dmo-extracted-places.service";
import { classifyDmoShape, runPlaceExtraction } from "../services/dmo-place-extraction.service";

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

// ─── Shape classification: place vs. guide ──────────────────────────────────
// Moved to server/services/dmo-place-extraction.service.ts (the extraction pipeline's shape gate
// needs it too, and needed it without a route→service circular import) — `classifyDmoShape` is
// imported above. The DMO library holds two content shapes under one table: `place` content
// describes ONE venue (has real coordinates/an address), `guide` content is a listicle article
// about MANY venues ("Top 10 Temples in Kyoto"). This classifies each row so the Research Reader
// can pick the right UI (single-venue card vs. article + extracted-places list).

// Number of venues an earlier extract-places run found for this row, sourced from the
// dmo_extracted_places child rows (§20a) — the source of truth, not extracted_data. Returns
// null if extraction has never run (distinct from 0, which means "ran and found nothing"). A
// present, non-zero row count answers it outright; an absent one falls back to the
// extracted_data "concluded empty via live fetch" marker (the one state a zero-row count can't
// distinguish from "never ran" on its own — see the extract-places cache rule below).
function extractedPlacesCountFromRows(
  contentId: string,
  countsByContentId: Map<string, number>,
  extractedData: unknown,
): number | null {
  const rowCount = countsByContentId.get(contentId);
  if (rowCount) return rowCount;
  return isConcludedEmptyMarker(extractedData) ? 0 : null;
}

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

// W5-C: overlay an expert's OWN latest DMO edit onto a raw content row so "Refine" writes
// (expert_dmo_edits) are actually visible in the library/picker/add-to-trip flow instead of
// dead-ending (QA_PUNCH_LIST item 6). Only fields the edit row actually set are overlaid —
// a NULL/empty edit field falls through to the raw value (§13: never blank out real content
// with an untouched edit column). Returns the merged fields plus a `raw` snapshot so a caller
// can honestly render "refined" vs the original.
function nonEmptyArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}

function mergeDmoEdit(raw: typeof dmoRawContent.$inferSelect, edit?: typeof expertDmoEdits.$inferSelect) {
  const rawSnapshot = {
    name: raw.name,
    description: raw.description,
    shortDescription: raw.shortDescription,
    tags: raw.tags,
    categories: raw.categories,
    eventTypes: raw.eventTypes,
    images: raw.images,
    address: raw.address,
    latitude: raw.latitude,
    longitude: raw.longitude,
  };
  if (!edit) {
    return { overlay: {} as Record<string, unknown>, raw: rawSnapshot };
  }
  const overlay: Record<string, unknown> = {};
  if (edit.editedName != null && edit.editedName !== "") overlay.name = edit.editedName;
  if (edit.editedDescription != null && edit.editedDescription !== "") overlay.description = edit.editedDescription;
  if (edit.editedShortDescription != null && edit.editedShortDescription !== "") overlay.shortDescription = edit.editedShortDescription;
  if (nonEmptyArray(edit.editedTags)) overlay.tags = edit.editedTags;
  if (nonEmptyArray(edit.editedCategories)) overlay.categories = edit.editedCategories;
  if (nonEmptyArray(edit.editedEventTypes)) overlay.eventTypes = edit.editedEventTypes;
  if (nonEmptyArray(edit.editedImages)) overlay.images = edit.editedImages;
  if (edit.editedAddress != null && edit.editedAddress !== "") overlay.address = edit.editedAddress;
  if (edit.editedLatitude != null) overlay.latitude = edit.editedLatitude;
  if (edit.editedLongitude != null) overlay.longitude = edit.editedLongitude;
  return { overlay, raw: rawSnapshot };
}

router.get(
  "/library",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const params = libraryQuerySchema.parse(req.query);
    const page = Math.max(1, parseInt(params.page, 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10)));
    const offset = (page - 1) * limit;
    const expertId = getUserId(req)!;

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

    // Overlay the requesting expert's OWN latest edit per raw content row. Scoping decision
    // (deliberate): expert_dmo_edits.expertId scopes an edit to the expert who wrote it — this
    // JOIN filters on the SESSION expert's id, so each expert sees only their own refinements,
    // never another expert's edits to the same shared raw content (the edit store was built
    // per-expert, not collaborative — leaking cross-expert overlays would silently attribute
    // one expert's wording/tags to another's library view).
    const ids = items.map((i) => i.id);

    // Batched (avoids N+1): one grouped COUNT over dmo_extracted_places for the whole page,
    // rather than a per-row read (§20a — child rows are the source of truth for the count).
    const extractedPlacesCounts = await getExtractedPlacesCounts(ids);

    const editsByContentId = new Map<string, typeof expertDmoEdits.$inferSelect>();
    if (ids.length > 0 && expertId) {
      const edits = await db
        .select()
        .from(expertDmoEdits)
        .where(and(inArray(expertDmoEdits.rawContentId, ids), eq(expertDmoEdits.expertId, expertId)))
        .orderBy(
          desc(sql`case when ${expertDmoEdits.editStatus} = 'submitted' then 1 else 0 end`),
          desc(expertDmoEdits.updatedAt),
          desc(expertDmoEdits.createdAt),
        );
      // Rows arrive newest-preferred-first (submitted > updatedAt > createdAt) — keep only the
      // first (i.e. latest/preferred) edit seen per raw content id.
      for (const edit of edits) {
        if (!editsByContentId.has(edit.rawContentId)) {
          editsByContentId.set(edit.rawContentId, edit);
        }
      }
    }

    res.json({
      page,
      limit,
      total: totalResult[0]?.count || 0,
      items: items.map((item) => {
        const edit = editsByContentId.get(item.id);
        const { overlay, raw } = mergeDmoEdit(item, edit);
        return {
          ...item,
          rawData: undefined, // Don't send raw payload to client — too large
          extractedData: undefined,
          normalizedData: undefined,
          embeddingVector: undefined,
          ...overlay,
          isRefined: Boolean(edit),
          raw,
          // Reader-list additions (shape classification never overridden by an expert edit —
          // it describes the underlying content, not the refined wording).
          shape: classifyDmoShape(item),
          extractedPlacesCount: extractedPlacesCountFromRows(item.id, extractedPlacesCounts, item.extractedData),
        };
      }),
    });
  }),
);

router.get(
  "/library/:id",
  requireExpert,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const item = await storage.getDmoRawContentById(id);

    // Audit A-3 sibling: the detail read carries the same §12 intake gate as the library
    // list — content the admin hasn't approved into the library (or has rejected) is not
    // retrievable by raw id.
    if (!item || item.expertWorkspaceVisible !== true || item.status === "rejected") {
      throw new NotFoundError("Content not found");
    }

    // extractedData served to the reader is now sourced from the dmo_extracted_places child
    // rows (§20a), not the extracted_data blob — same {places, extractedAt, source} shape so
    // the client is byte-compatible. A zero-row guide falls back to the blob ONLY for the
    // "concluded empty via live fetch" marker (mirrors the extract-places cache rule); otherwise
    // there is honestly nothing to serve, matching "extraction never ran".
    const extractedRows = await getExtractedPlaceRows(id);
    let extractedDataResponse: { places: ReturnType<typeof mapRowsToPlaces>; extractedAt: Date | string | null; source: string } | null;
    if (extractedRows.length > 0) {
      extractedDataResponse = {
        places: mapRowsToPlaces(extractedRows),
        extractedAt: extractedRows[0].extractedAt,
        source: extractedRows[0].source,
      };
    } else if (isConcludedEmptyMarker(item.extractedData)) {
      const blob = item.extractedData as { extractedAt?: string; source?: string };
      extractedDataResponse = { places: [], extractedAt: blob.extractedAt ?? null, source: blob.source ?? "live_fetch" };
    } else {
      extractedDataResponse = null;
    }

    // DMO Research Reader drawer: the field set the reader actually renders, plus the
    // computed `shape` and the derived `extractedData` (place-extraction results, if any run).
    // Deliberately narrower than the raw row — no rawData/normalizedData/embeddingVector.
    res.json({
      id: item.id,
      name: item.name,
      description: item.description,
      shortDescription: item.shortDescription,
      contentType: item.contentType,
      neighborhood: item.neighborhood,
      city: item.city,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      sourceUrl: item.sourceUrl,
      sourcePageTitle: item.sourcePageTitle,
      scrapedAt: item.scrapedAt,
      license: item.license,
      tags: item.tags,
      primaryImageUrl: item.primaryImageUrl,
      shape: classifyDmoShape(item),
      extractedData: extractedDataResponse,
    });
  }),
);

// ============================================================
// EXTRACT PLACES — AI-assisted venue extraction from guide-shaped content
// ============================================================
//
// Run-once by design: a `guide` row's article text is expensive to re-parse, so a prior
// successful run is served straight from `extracted_data.places` with no AI call at all
// (hard cost invariant — do not relax the cache check below "just to refresh one row").
//
// Thin caller (pre-extraction refactor, Aug 9 2026, decision-maker ratified §15c pattern): the
// actual pipeline — stored-text assembly, the AI call, the thin/zero-result live-fetch fallback,
// per-name geocode + library dedupe, and the replaceExtractedPlaces + extracted_data dual-write —
// now lives in `runPlaceExtraction` (dmo-place-extraction.service.ts), shared with the
// admin-approve hook and the boot-time backlog sweep. This route keeps its own auth + intake gate
// (so a 404 stays a 404 here, not inside the service) and translates the service's tagged outcome
// back into the EXACT response shapes this endpoint returned before the refactor.
router.post(
  "/library/:id/extract-places",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const id = req.params.id;
    const expertId = getUserId(req)!;
    const item = await storage.getDmoRawContentById(id);

    // Same intake gate as the detail read (§12 audit A-3 pattern) — extraction is not a
    // side door around content the admin hasn't approved into the library.
    if (!item || item.expertWorkspaceVisible !== true || item.status === "rejected") {
      throw new NotFoundError("Content not found");
    }

    const outcome = await runPlaceExtraction(id, { source: "on_open", actorId: expertId });

    switch (outcome.status) {
      case "not_found":
        // Race: the gate check above passed, but the row changed under us before the service's
        // own (re-)fetch. Same 404 the pre-refactor gate produced.
        throw new NotFoundError("Content not found");
      case "cached":
        return res.json({ places: outcome.places, cached: true });
      case "no_api_key":
        return res.status(502).json({ message: "Extraction failed — read the source instead" });
      case "thin_text":
        return res.json({ thinText: true, places: null });
      case "ai_error":
        return res.status(502).json({ message: "Extraction failed — read the source instead" });
      case "extracted":
        return res.json({ places: outcome.places, cached: false });
    }
  }),
);

// ============================================================
// EXTRACTED-PLACE TICKETING LINK — expert-console-only metadata
// ============================================================
//
// §16: this is NOT a traveler-facing "Book" CTA and must never be rendered as one — any
// traveler-facing booking action routes through the booking-agent rail
// (POST /api/affiliate-booking-requests), which keeps the affiliate URL server-side and logs
// the booking onto the trip. This field is a reference link an expert stores for their own use
// while advising a traveler (e.g. "here's where I'd buy tickets"), scoped to one extracted
// place inside one DMO content row.

router.patch(
  "/library/:id/extracted-places/:index",
  requireExpert,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const item = await storage.getDmoRawContentById(id);

    if (!item || item.expertWorkspaceVisible !== true || item.status === "rejected") {
      throw new NotFoundError("Content not found");
    }

    // §14 note: ticketingUrl is reference metadata, not a money field — no amount/rate/id from
    // this body reaches any charge, payout, or ownership decision.
    const schema = z.object({
      ticketingUrl: z
        .string()
        .max(500)
        .refine((u) => u.startsWith("https://"), { message: "ticketingUrl must be an https:// URL" })
        .refine((u) => {
          try {
            new URL(u);
            return true;
          } catch {
            return false;
          }
        }, { message: "ticketingUrl must be a valid URL" })
        .nullable(),
    });
    // safeParse → the file's ValidationError (400): a bare .parse throw falls through the
    // error middleware as a 500, which mislabels a client mistake as a server fault.
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "Invalid ticketingUrl");
    }
    const { ticketingUrl } = parsed.data;

    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0) {
      throw new NotFoundError("Extracted place not found");
    }

    // position === index + 1: extraction always writes contiguous 1-based positions in article
    // order, so array-index and position coincide — the same semantics the old blob-array index
    // had (§20a). A missing row (bad index, or the guide was never extracted) is the 404.
    const updatedRow = await updateTicketingUrlByPosition(id, index + 1, ticketingUrl);
    if (!updatedRow) {
      throw new NotFoundError("Extracted place not found");
    }

    // Mirror into the extracted_data blob (dual-write, §20a) so the historical blob never holds
    // a stale ticketing_url.
    const placesRaw = (item.extractedData as { places?: unknown } | null)?.places;
    if (Array.isArray(placesRaw) && index < placesRaw.length) {
      const places = placesRaw.slice();
      places[index] = { ...(places[index] as Record<string, unknown>), ticketingUrl };
      await db
        .update(dmoRawContent)
        .set({
          extractedData: { ...(item.extractedData as Record<string, unknown>), places },
        })
        .where(eq(dmoRawContent.id, id));
    }

    // Same response contract as before: the full place object with ticketingUrl always present
    // (string or null) — optional fields omitted only when genuinely absent.
    const updatedPlace: Record<string, unknown> = { n: updatedRow.position, name: updatedRow.name };
    if (updatedRow.latitude != null) updatedPlace.latitude = updatedRow.latitude;
    if (updatedRow.longitude != null) updatedPlace.longitude = updatedRow.longitude;
    if (updatedRow.inLibraryId != null) updatedPlace.inLibraryId = updatedRow.inLibraryId;
    updatedPlace.ticketingUrl = updatedRow.ticketingUrl;

    res.json(updatedPlace);
  }),
);

// ============================================================
// PLATFORM CONTENT — W1-A: the Workstation Add panel's "Platform content" pill.
// Read-only search over the central content_registry, scoped to destination + free-text.
// ============================================================

router.get(
  "/platform-content",
  requireExpert,
  asyncHandler(async (req: Request, res: Response) => {
    const city = (req.query.city as string) || undefined;
    const q = (req.query.q as string) || undefined;
    const items = await searchWorkstationPlatformContent({ city, query: q, limit: 30 });
    res.json({ items });
  }),
);

// ============================================================
// EXPERT COLLECTIONS — Curated subsets of DMO Library
// ============================================================

router.get(
  "/collections",
  requireExpert,
  asyncHandler(async (req: any, res: Response) => {
    const expertId = getUserId(req)!;
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
    const expertId = getUserId(req)!;

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
    const expertId = getUserId(req)!;

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

    // Load the selected DMO rows. Audit A-3: gate on the §12 admin INTAKE decision — only
    // content approved into the expert library (expert_workspace_visible) and not rejected can
    // seed a store draft; a raw UUID must not bypass the gate the library list enforces.
    const rows = await db
      .select()
      .from(dmoRawContent)
      .where(and(
        inArray(dmoRawContent.id, contentIds),
        eq(dmoRawContent.expertWorkspaceVisible, true),
        ne(dmoRawContent.status, "rejected"),
      ));
    if (rows.length === 0) {
      throw new ValidationError("None of the selected content could be found.");
    }

    // Preserve the caller's selection order, then group ~3 places per day.
    const order = new Map(contentIds.map((id, i) => [id, i]));
    const ordered = [...rows].sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
    const PER_DAY = 3;
    const durationDays = Math.max(1, Math.ceil(ordered.length / PER_DAY));

    const city = ordered[0]?.city || LAUNCH_MARKETS[0];
    // §12/F8: the store lane is launch-market-scoped (migration-149 DB CHECK on
    // ready_made_trips.market) — refuse honestly rather than mislabel a non-launch build.
    if (!isLaunchMarket(city)) {
      throw new ValidationError(STORE_GATE_MESSAGE);
    }
    const draftTitle = title || `${city} itinerary (draft)`;

    // Same creation mechanism as POST /api/expert/ready-made: authoring trip (userId=NULL,
    // authorId=caller — traveler-surface exclusion by construction) + born-'draft' listing.
    // Placeholder dates: authoring trips are templates-in-the-making, not scheduled travel;
    // trips.start/end are NOT NULL so we anchor a synthetic window.
    const start = new Date();
    const end = new Date(start.getTime() + (durationDays - 1) * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // Lane S ruling 17: authoring builds mint identity at birth too (they become Ready Mades).
    // Generated OUTSIDE the transaction — the sequence bump is its own statement and a rollback
    // only skips a number, never reuses one.
    const trackingNumber = await storage.generateTrackingNumber("TRV");
    const result = await db.transaction(async (tx) => {
      // trip-mint-owner-ok: authoring-mode build — userId NULL by design, no owner principal
      // exists; access rides authorId via isTripAuthor, not a trip_collaborators row.
      const [trip] = await tx
        .insert(trips)
        .values({
          userId: null,          // NULL owner = excluded from every traveler surface
          authorId: expertId,    // authoring-mode scope key
          title: draftTitle,
          destination: city,
          trackingNumber,
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
        // R26 coords cheap-fix: the DMO content row (dmo_raw_content) carries a best-effort
        // geocode; copy it so neighborhood history can accrue. NULL stays NULL — no city-center
        // invention (§13). (Source is dmo_raw_content, read at the select above — NOT
        // dmo_extracted_places; an earlier note mislabeled the table.)
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        suggestedBy: "expert",
        origin: "expert",
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
    const expertId = getUserId(req)!;

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
    const expertId = getUserId(req)!;

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
    const expertId = getUserId(req)!;

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
    const expertId = getUserId(req)!;

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
