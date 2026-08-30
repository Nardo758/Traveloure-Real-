// DMO place-extraction pipeline — ONE implementation, THREE callers (the §15c pattern applied to
// the AI-extraction path, decision-maker-ratified pre-extraction design, Aug 9 2026):
//   1. "on_open"      — POST /library/:id/extract-places (expert-workspace.routes.ts), lazy,
//                        first Research Reader open on a guide.
//   2. "admin_approve" — the DMO intake approve endpoint (admin.routes.ts), fire-and-forget the
//                        moment a guide-shaped row is flipped expert_workspace_visible=true.
//   3. "warmup_sweep"  — the boot-time backlog sweep (server/jobs/dmoExtractionWarmup.ts) that
//                        catches guides approved before this landed, or missed by #2.
//
// This file is the pipeline that used to live entirely inside the route handler. The route is
// now a thin caller: same auth, same intake gate, same response contract — it only delegates the
// "assemble text → AI call → geocode/dedupe → persist" work to `runPlaceExtraction` below.
//
// GUARDS (all live here, once, so every caller inherits them):
//   - Skip-if-done: child rows exist OR the concluded-empty marker is set → return the cached
//     result, ZERO AI calls. Same rule the route enforced before the refactor.
//   - Shape gate: only guide-shaped content gets an AI call (classifyDmoShape). The sweep and the
//     admin-approve hook both fire on rows this file has not yet judged the shape of — a
//     `place`-shaped row (a single venue, nothing to sub-extract) must not spend an AI call.
//   - In-flight dedupe: a per-PROCESS `Map<contentId, Promise>` — a concurrent on_open + warmup
//     hitting the same guide within one process await the SAME extraction and get the SAME
//     result. This is best-effort concurrency courtesy, not a correctness guarantee: it does
//     nothing across multiple server processes/instances. The hard backstop is the DB —
//     `dmo_extracted_places`'s UNIQUE (dmo_content_id, position) constraint plus
//     `replaceExtractedPlaces`'s delete-then-insert-in-a-transaction shape — so a genuine
//     cross-process race still lands on a consistent final row set, just possibly after two AI
//     calls instead of one.
//   - Never throws out of a hook/sweep context: every failure path (missing/gated content, no API
//     key, AI error) returns a tagged outcome instead of throwing. The one exception is a
//     synchronous programmer error (e.g. a DB connection outage) — those still reject the
//     returned promise, which is exactly why admin-approve and the sweep both wrap their call in
//     `.catch(...)` rather than relying on this file alone.

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { dmoRawContent } from "@shared/schema";
import { eq, ne, and, or, ilike, sql } from "drizzle-orm";
import { storage } from "../storage";
import { geocodeAddress } from "../utils/geocode";
import { trackAICost, calculateAnthropicCost } from "./ai-cost-tracker";
import { logger } from "../infrastructure";
import {
  getExtractedPlaceRows,
  mapRowsToPlaces,
  replaceExtractedPlaces,
  isConcludedEmptyMarker,
  type ExtractedPlaceResponse,
  type CandidatePlace,
} from "./dmo-extracted-places.service";
import { enrichPlace } from "./place-enrichment.service";

// Pacing between per-place enrichment calls in the sequential loop below — never parallel-fanned
// (be rate-kind to Wikidata/OSM's free public tiers; this pipeline can process up to 15 places per
// guide). Small enough not to meaningfully slow a single extraction, large enough to not hammer a
// shared public API back-to-back.
const ENRICHMENT_PACING_MS = 250;

// ============================================================
// SHAPE CLASSIFICATION — moved verbatim from expert-workspace.routes.ts so this file (and the
// sweep/hook callers that never touch the route) can apply the same "guide vs place" rule without
// a route→service circular import. expert-workspace.routes.ts now imports `classifyDmoShape` from
// here instead of defining it.
// ============================================================
//
// The DMO library holds two content shapes under one table: `place` content describes ONE venue
// (has real coordinates/an address), `guide` content is a listicle article about MANY venues
// ("Top 10 Temples in Kyoto"). Title pattern wins outright (an explicit "Top 10 ..." headline is a
// guide even if the scraper happened to attach coordinates to the page); otherwise a row with no
// real location AND a long body reads as prose, not a venue card.
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

// ============================================================
// EXTRACTION PIPELINE — moved verbatim (behavior-neutral) from
// expert-workspace.routes.ts POST /library/:id/extract-places.
// ============================================================

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
    // Malformed extraction output — no place names could be parsed; return null so the caller skips this source.
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
//
// Egress note: this fetch reaches the public internet. It works in production/Replit; this
// sandbox has no outbound egress, so here it always resolves to `null` (network error, caught
// below) — the pipeline's "fetch failed" path, not a code path unique to sandbox testing.
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

export type PlaceExtractionTrigger = "on_open" | "admin_approve" | "warmup_sweep";

export interface RunPlaceExtractionOptions {
  source: PlaceExtractionTrigger;
  /** Attributed user for the ai_cost_tracking row's user_id — the session expert for "on_open",
   *  the approving admin for "admin_approve", null for "warmup_sweep" (no acting user; boot job). */
  actorId?: string | null;
}

// The one AI extraction call (shared by the stored-text and live-fetch passes). Cost-tracked per
// CLAUDE.md (the ai_cost_tracking table is load-bearing for the admin cost breakdown). The
// trigger source is carried in `requestId` — the tracker's schema (server/migrations/
// 025b_ai_cost_tracking.sql) has no separate metadata/label column, and requestId is documented
// as "link to the request that triggered this cost", the closest existing fit — so admin can
// distinguish warmup-sweep cost from on-demand cost by filtering/grouping on it without a schema
// change.
async function extractPlaceNamesWithAI(
  text: string,
  actorId: string | null,
  trigger: PlaceExtractionTrigger,
): Promise<string[]> {
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
      userId: actorId,
      requestId: `trigger:${trigger}`,
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

// The full set of outcomes the pipeline can end in. Every route/hook/sweep caller maps these to
// its own contract — none of them are HTTP-shaped here, so this file has no Express dependency.
export type PlaceExtractionOutcome =
  // Content missing, not yet admin-approved into the library, or rejected — the same §12 intake
  // gate the route enforces as a 404. Returned (never thrown) so warmup/hook callers can log and
  // move on instead of crashing.
  | { status: "not_found" }
  // Run-once cache hit — child rows already existed, OR the row is a non-guide shape (nothing to
  // sub-extract), OR the concluded-empty live_fetch marker was already set. Zero AI calls.
  | { status: "cached"; places: ExtractedPlaceResponse[] }
  // ANTHROPIC_API_KEY is unset — nothing attempted.
  | { status: "no_api_key" }
  // Stored text was thin (<300 chars) AND the live-fetch fallback was unreachable/thin too —
  // nothing honest to extract from, and (§13) nothing persisted.
  | { status: "thin_text" }
  // The AI call itself failed (network/parse) — nothing persisted, safe to retry on next open.
  | { status: "ai_error" }
  // A real attempt ran to completion — `places` may legitimately be empty (a live_fetch guide
  // that named no venues; that empty result is itself persisted+cached, matching the route's
  // pre-refactor "concluded empty" behavior) or non-empty (persisted as child rows).
  | { status: "extracted"; places: ExtractedPlaceResponse[] };

// Per-process in-flight dedupe (see file header). Best-effort: cleared as soon as the promise
// settles (success OR failure) so a failed run doesn't wedge the content id.
const inFlightExtractions = new Map<string, Promise<PlaceExtractionOutcome>>();

/**
 * Run (or reuse an in-flight run of) the place-extraction pipeline for one dmo_raw_content row.
 * Never throws for the expected failure modes (missing content, no API key, AI error) — those are
 * tagged outcomes. Only an unexpected error (e.g. the DB itself unreachable) rejects the promise;
 * fire-and-forget callers (admin-approve hook, warmup sweep) must still `.catch(...)` this call.
 */
export function runPlaceExtraction(
  contentId: string,
  opts: RunPlaceExtractionOptions,
): Promise<PlaceExtractionOutcome> {
  const existing = inFlightExtractions.get(contentId);
  if (existing) {
    logger.info(
      { contentId, source: opts.source },
      "[dmo-place-extraction] joining in-flight extraction for this content id",
    );
    return existing;
  }
  const run = runPlaceExtractionInner(contentId, opts).finally(() => {
    inFlightExtractions.delete(contentId);
  });
  inFlightExtractions.set(contentId, run);
  return run;
}

async function runPlaceExtractionInner(
  contentId: string,
  opts: RunPlaceExtractionOptions,
): Promise<PlaceExtractionOutcome> {
  const item = await storage.getDmoRawContentById(contentId);

  // Same intake gate the route/detail-read enforce (§12 audit A-3 pattern): extraction is not a
  // side door around content the admin hasn't approved into the library.
  if (!item || item.expertWorkspaceVisible !== true || item.status === "rejected") {
    return { status: "not_found" };
  }

  // Skip-if-done — served from the dmo_extracted_places child rows (§20a), the source of truth.
  const existingRows = await getExtractedPlaceRows(contentId);
  if (existingRows.length > 0) {
    return { status: "cached", places: mapRowsToPlaces(existingRows) };
  }
  if (isConcludedEmptyMarker(item.extractedData)) {
    return { status: "cached", places: [] };
  }

  // Shape gate: only guide-shaped content gets an AI call. A `place` row is a single venue — it
  // has nothing to sub-extract, so this is a legitimate (not fabricated) empty result.
  if (classifyDmoShape(item) !== "guide") {
    return { status: "cached", places: [] };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: "no_api_key" };
  }

  // Assemble stored text: the row's description plus obviously-textual string fields of the
  // scraper's rawData payload.
  const rawDataText = collectTextualStrings(item.rawData).join("\n\n");
  const storedText = [item.description, rawDataText].filter(Boolean).join("\n\n").trim();

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
      candidateNames = await extractPlaceNamesWithAI(storedText, opts.actorId ?? null, opts.source);
    }
    if (candidateNames === null || candidateNames.length === 0) {
      const fetchedText = await fetchSourceArticleText(item.sourceUrl);
      if (fetchedText && fetchedText.length >= 300) {
        candidateNames = await extractPlaceNamesWithAI(fetchedText, opts.actorId ?? null, opts.source);
        extractionSource = "live_fetch";
      } else if (candidateNames === null) {
        // Stored text was thin AND the source is unreachable — nothing honest to extract from.
        return { status: "thin_text" };
      }
      // else: stored text yielded nothing and the fetch failed — fall through with the
      // empty result, UNPERSISTED (see below), so a later open can retry the fetch.
    }
  } catch (err) {
    logger.error({ err, contentId, source: opts.source }, "[dmo-place-extraction] AI call failed");
    return { status: "ai_error" };
  }

  // Every exit above either returned or left an array (possibly empty) here.
  const finalNames: string[] = candidateNames ?? [];

  // Per candidate, in article order: best-effort geocode + dedupe against the library.
  // Neither failure aborts the batch — one bad name must not sink the other 14.
  const places: CandidatePlace[] = [];

  for (let i = 0; i < finalNames.length; i++) {
    const name = finalNames[i];
    const place: CandidatePlace = { n: i + 1, name };

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

    // Best-effort open-data enrichment (CLAUDE.md §20a extension, migration 188) — Wikidata
    // (CC0) + OSM/Overpass (ODbL). Never throws (place-enrichment.service.ts's own contract);
    // a null result just means this place stays honestly unenriched.
    try {
      const inputLat = place.latitude != null ? Number(place.latitude) : null;
      const inputLng = place.longitude != null ? Number(place.longitude) : null;
      const enrichment = await enrichPlace({
        name,
        city: item.city,
        lat: inputLat != null && Number.isFinite(inputLat) ? inputLat : null,
        lng: inputLng != null && Number.isFinite(inputLng) ? inputLng : null,
      });
      if (enrichment) {
        // A coordinate this call filled in for a geocode miss carries its own provenance
        // (coordsFrom) — use it to complete the place's location, but only when the geocode
        // above genuinely missed (never overwrite a real geocode hit, §13).
        if (
          enrichment.coordsFrom === "wikidata" &&
          place.latitude == null &&
          place.longitude == null &&
          typeof enrichment.lat === "number" &&
          typeof enrichment.lng === "number"
        ) {
          place.latitude = String(enrichment.lat);
          place.longitude = String(enrichment.lng);
        }
        place.enrichment = enrichment;
      }
    } catch (err) {
      console.error(`[dmo-extract-places] enrichment failed for "${name}":`, err);
    }

    places.push(place);

    // Be rate-kind to Wikidata/OSM's free public tiers: this loop is sequential (never
    // parallel-fanned), and this small pacing gap sits between per-place enrichment calls —
    // skipped after the last name so the batch doesn't pay a trailing delay for nothing.
    if (i < finalNames.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, ENRICHMENT_PACING_MS));
    }
  }

  // Persist when there is a real result, or when the live fetch ran and legitimately found
  // nothing (that empty IS the answer — cache it, see the cache rule above). An empty result
  // whose fetch FAILED stays unpersisted so the next open retries the fetch.
  if (places.length > 0 || extractionSource === "live_fetch") {
    const extractedAt = new Date();
    // Child rows are the source of truth (§20a) — replace-by-position, preserving any
    // expert-added ticketing_url across the refresh by normalized_name match. The response is
    // built from the SAME rows just persisted so a preserved URL is visible to the caller too.
    const insertedRows = await replaceExtractedPlaces(contentId, places, extractedAt, extractionSource);
    // Dual-write to extracted_data for rollback safety (§20a) — this is also the ONLY place
    // the empty-live_fetch "concluded" marker survives (see the cache rule above); the blob is
    // otherwise never read for places again.
    await db
      .update(dmoRawContent)
      .set({
        extractedData: { places, extractedAt: extractedAt.toISOString(), source: extractionSource },
      })
      .where(eq(dmoRawContent.id, contentId));
    return { status: "extracted", places: mapRowsToPlaces(insertedRows) };
  }

  return { status: "extracted", places: [] };
}
