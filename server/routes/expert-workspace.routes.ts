import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getUserId } from "../utils/auth";
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
import { geocodeAddress } from "../utils/geocode";
import { trackAICost, calculateAnthropicCost } from "../services/ai-cost-tracker";
import {
  getExtractedPlaceRows,
  mapRowsToPlaces,
  replaceExtractedPlaces,
  updateTicketingUrlByPosition,
  getExtractedPlacesCounts,
  isConcludedEmptyMarker,
} from "../services/dmo-extracted-places.service";

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
// The DMO library holds two content shapes under one table: `place` content describes
// ONE venue (has real coordinates/an address), `guide` content is a listicle article about
// MANY venues ("Top 10 Temples in Kyoto"). The library previously treated every row as a
// place; this classifies each row so the Research Reader can pick the right UI (single-venue
// card vs. article + extracted-places list). Title pattern wins outright (an explicit
// "Top 10 ..." headline is a guide even if the scraper happened to attach coordinates to the
// page); otherwise a row with no real location AND a long body reads as prose, not a venue card.
const GUIDE_TITLE_RE = /\b(top\s*\d+|best|guide|favou?rite|must[- ]?see|things\s+to\s+do)\b/i;

function hasRealCoords(lat: unknown, lng: unknown): boolean {
  const latNum = typeof lat === "string" ? parseFloat(lat) : (lat as number | null | undefined);
  const lngNum = typeof lng === "string" ? parseFloat(lng) : (lng as number | null | undefined);
  if (latNum == null || lngNum == null || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return false;
  if (latNum === 0 && lngNum === 0) return false; // (0,0) is the classic "no real coord" sentinel
  return true;
}

export function classifyDmoShape(row: {
  name?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  address?: string | null;
  description?: string | null;
}): "place" | "guide" {
  if (row.name && GUIDE_TITLE_RE.test(row.name)) return "guide";
  const noCoords = !hasRealCoords(row.latitude, row.longitude);
  const noAddress = !row.address || !row.address.trim();
  const longDescription = (row.description?.length ?? 0) > 300;
  if (noCoords && noAddress && longDescription) return "guide";
  return "place";
}

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

const EXTRACT_PLACES_SYSTEM_PROMPT = `You read a travel/DMO article and extract the distinct real-world venue or place names it mentions — the specific attractions, temples, restaurants, museums, parks, etc. a traveler could visit. Not neighborhoods, not cities, not generic categories.

Rules:
- Only extract names the text actually states. Never invent, guess, or infer a place that is not named.
- List each distinct venue once, in the order it first appears in the text.
- List at most 15 venues.
- Respond with ONLY a JSON array of strings, no other text, e.g. ["Fushimi Inari Shrine", "Kiyomizu-dera Temple"]. If no venues are named, respond with [].`;

// Defensive parse: the model may wrap its answer in prose or a code fence despite instructions.
function parsePlaceNamesJson(raw: string): string[] | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return null;
    const names = parsed
      .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
      .map((n) => n.trim());
    return names;
  } catch {
    return null;
  }
}

// Walks rawData collecting string values long enough / prose-shaped enough to be article body
// text — skips short id/code-shaped strings and bare URLs. Depth-capped: rawData is an
// arbitrary source payload, not a schema we control.
function collectTextualStrings(value: unknown, depth = 0, acc: string[] = []): string[] {
  if (depth > 3) return acc;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length >= 20 && !/^https?:\/\//i.test(trimmed)) acc.push(trimmed);
  } else if (Array.isArray(value)) {
    for (const v of value) collectTextualStrings(v, depth + 1, acc);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectTextualStrings(v, depth + 1, acc);
  }
  return acc;
}

// Transient source fetch (decision-maker ruling, Aug 9 2026): when the STORED excerpt is thin
// or names no venues (scrapers often capture only the page top — title + disclosure + intro —
// while the venue list lives further down), the extractor may fetch the article once, extract
// venue NAMES from the live text, and store ONLY the derived facts. The fetched body is never
// persisted anywhere. `sourceUrl` is admin-ingested registry provenance (NOT NULL, written by
// the ingestion pipeline), never a client-supplied URL — no SSRF surface from req.body.
async function fetchSourceArticleText(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "TraveloureBot/1.0 (+https://traveloure.com; content research)" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(contentType)) return null;
    let html = await res.text();
    if (html.length > 2_000_000) html = html.slice(0, 2_000_000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return text || null;
  } catch (err) {
    console.error("[dmo-extract-places] source fetch failed:", err);
    return null;
  }
}

// The one AI extraction call (shared by the stored-text and live-fetch passes) — throws on
// any failure so the route can map it to its 502. Cost-tracked per CLAUDE.md (the
// ai_cost_tracking table is load-bearing for the admin cost breakdown).
async function extractPlaceNamesWithAI(text: string, expertId: string): Promise<string[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 500,
    system: EXTRACT_PLACES_SYSTEM_PROMPT,
    messages: [{ role: "user", content: text.slice(0, 12_000) }],
  });
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  if (inputTokens > 0 || outputTokens > 0) {
    trackAICost({
      sourceType: "dmo_extract_places",
      modelUsed: "claude-sonnet-4-5",
      userId: expertId,
      costUsd: calculateAnthropicCost(inputTokens, outputTokens),
      tokensIn: inputTokens,
      tokensOut: outputTokens,
    }).catch((err) => console.error("[cost-tracker] dmo_extract_places:", err));
  }
  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "";
  const parsed = raw ? parsePlaceNamesJson(raw) : null;
  if (parsed === null) throw new Error("Unparseable extraction response");
  return parsed.slice(0, 15);
}

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

    // Run-once cache — served from the dmo_extracted_places child rows (§20a), the source of
    // truth. A non-empty row set is always served as-is. Rows are indistinguishable from
    // "extraction never ran" when EMPTY, so the "ran via live fetch, found nothing" conclusion —
    // the strongest attempt this endpoint can make — is the one state still read from the
    // extracted_data blob marker: it keeps an empty live_fetch result from re-fetching on every
    // open, while an empty stored_text run (no live fetch yet) stays retryable.
    const existingRows = await getExtractedPlaceRows(id);
    if (existingRows.length > 0) {
      return res.json({ places: mapRowsToPlaces(existingRows), cached: true });
    }
    if (isConcludedEmptyMarker(item.extractedData)) {
      return res.json({ places: [], cached: true });
    }

    // Assemble stored text: the row's description plus obviously-textual string fields of the
    // scraper's rawData payload.
    const rawDataText = collectTextualStrings(item.rawData).join("\n\n");
    const storedText = [item.description, rawDataText].filter(Boolean).join("\n\n").trim();

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(502).json({ message: "Extraction failed — read the source instead" });
    }

    // Two-pass extraction (ruling, Aug 9 2026): stored text first; when it is thin (<300 —
    // §13: a teaser must never be extrapolated into fabricated places, no AI call below the
    // bar) OR the AI finds no venue names in it (the bontraveler case: the scrape captured
    // title + affiliate disclosure, the venue list lives further down the article), fall back
    // to a TRANSIENT fetch of the source article. The fetched body is used for this one call
    // and discarded — only derived facts persist.
    let candidateNames: string[] | null = null;
    let extractionSource: "stored_text" | "live_fetch" = "stored_text";
    try {
      if (storedText.length >= 300) {
        candidateNames = await extractPlaceNamesWithAI(storedText, expertId);
      }
      if (candidateNames === null || candidateNames.length === 0) {
        const fetchedText = await fetchSourceArticleText(item.sourceUrl);
        if (fetchedText && fetchedText.length >= 300) {
          candidateNames = await extractPlaceNamesWithAI(fetchedText, expertId);
          extractionSource = "live_fetch";
        } else if (candidateNames === null) {
          // Stored text was thin AND the source is unreachable — nothing honest to extract from.
          return res.json({ thinText: true, places: null });
        }
        // else: stored text yielded nothing and the fetch failed — fall through with the
        // empty result, UNPERSISTED (see below), so a later open can retry the fetch.
      }
    } catch (err) {
      console.error("[dmo-extract-places] AI call failed:", err);
      return res.status(502).json({ message: "Extraction failed — read the source instead" });
    }

    // Every exit above either returned or left an array (possibly empty) here.
    const finalNames: string[] = candidateNames ?? [];

    // Per candidate, in article order: best-effort geocode + dedupe against the library.
    // Neither failure aborts the batch — one bad name must not sink the other 14.
    const places: Array<{
      n: number;
      name: string;
      latitude?: string;
      longitude?: string;
      inLibraryId?: string;
      ticketingUrl?: string | null;
    }> = [];

    for (let i = 0; i < finalNames.length; i++) {
      const name = finalNames[i];
      const place: (typeof places)[number] = { n: i + 1, name };

      try {
        // The ONE server geocode path (server/utils/geocode.ts) — city-qualified so a bare
        // venue name has a fighting chance; a miss omits coords entirely rather than falling
        // back to the city centre (§13 — a city-centre pin would be a fabricated location).
        const geo = await geocodeAddress(`${name}, ${item.city}`);
        if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
          place.latitude = String(geo.lat);
          place.longitude = String(geo.lng);
        }
      } catch (err) {
        console.error(`[dmo-extract-places] geocode failed for "${name}":`, err);
      }

      try {
        // Dedupe against the visible library, same city, contains-either-direction match —
        // catches both "Fushimi Inari Shrine" ⊂ "Fushimi Inari Taisha Shrine" and the reverse.
        const pattern = `%${name}%`;
        const [match] = await db
          .select({ id: dmoRawContent.id })
          .from(dmoRawContent)
          .where(
            and(
              eq(dmoRawContent.city, item.city),
              eq(dmoRawContent.expertWorkspaceVisible, true),
              ne(dmoRawContent.status, "rejected"),
              ne(dmoRawContent.id, item.id),
              or(ilike(dmoRawContent.name, pattern), sql`${name} ILIKE '%' || ${dmoRawContent.name} || '%'`),
            ),
          )
          .limit(1);
        if (match) place.inLibraryId = match.id;
      } catch (err) {
        console.error(`[dmo-extract-places] dedupe lookup failed for "${name}":`, err);
      }

      places.push(place);
    }

    // Persist when there is a real result, or when the live fetch ran and legitimately found
    // nothing (that empty IS the answer — cache it, see the cache rule above). An empty result
    // whose fetch FAILED stays unpersisted so the next open retries the fetch.
    if (places.length > 0 || extractionSource === "live_fetch") {
      const extractedAt = new Date();
      // Child rows are the source of truth (§20a) — replace-by-position, preserving any
      // expert-added ticketing_url across the refresh by normalized_name match. The response is
      // built from the SAME rows just persisted so a preserved URL is visible to the caller too.
      const insertedRows = await replaceExtractedPlaces(id, places, extractedAt, extractionSource);
      // Dual-write to extracted_data for rollback safety (§20a) — this is also the ONLY place
      // the empty-live_fetch "concluded" marker survives (see the cache rule above); the blob is
      // otherwise never read for places again.
      await db
        .update(dmoRawContent)
        .set({
          extractedData: { places, extractedAt: extractedAt.toISOString(), source: extractionSource },
        })
        .where(eq(dmoRawContent.id, id));
      return res.json({ places: mapRowsToPlaces(insertedRows), cached: false });
    }

    res.json({ places, cached: false });
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
