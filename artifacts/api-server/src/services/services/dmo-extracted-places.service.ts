// Places extracted from a DMO guide, as first-class child rows of dmo_raw_content
// (CLAUDE.md §20a, migration 185; decision-maker ratified Aug 9, 2026). THIS is the source of
// truth for the Research Reader's harvest panel. The parent's extracted_data.places JSON blob is
// a dual-write kept for rollback safety and, in exactly one case (see isConcludedEmptyMarker),
// the only place a "ran via live fetch, found nothing" conclusion survives — an empty child-row
// set is otherwise indistinguishable from "extraction never ran". The blob is never read for
// places outside that one case.

import { db } from "../db";
import { dmoExtractedPlaces, dmoRawContent } from "@workspace/db";
import { and, asc, count, eq, ilike, inArray, isNotNull } from "drizzle-orm";
import type { PlaceEnrichment } from "./place-enrichment.service";

export type ExtractedPlaceRow = typeof dmoExtractedPlaces.$inferSelect;

// The response shape every rail serves — unchanged from the pre-child-row JSON blob contract so
// clients stay byte-compatible. Optional keys are OMITTED (not null), matching the original
// extract-places response, which never set a key it had no value for.
// `officialUrl` (migration 188) is surfaced here ONLY — the row's full `enrichment` envelope is
// never sent as-is; today's Reader only ever renders the official-site link.
export type ExtractedPlaceResponse = {
  n: number;
  name: string;
  latitude?: string;
  longitude?: string;
  inLibraryId?: string;
  ticketingUrl?: string | null;
  officialUrl?: string;
};

// A freshly-extracted candidate, pre-merge — the same shape the extract-places route already
// builds (geocode + library-dedupe applied, ticketingUrl never set here — only PATCH sets it).
// `enrichment` (migration 188) is optional open-data output from place-enrichment.service.ts —
// fresh on every extraction, never carried over from a prior run (see replaceExtractedPlaces).
export type CandidatePlace = {
  n: number;
  name: string;
  latitude?: string;
  longitude?: string;
  inLibraryId?: string;
  enrichment?: PlaceEnrichment | null;
};

export async function getExtractedPlaceRows(dmoContentId: string): Promise<ExtractedPlaceRow[]> {
  return db
    .select()
    .from(dmoExtractedPlaces)
    .where(eq(dmoExtractedPlaces.dmoContentId, dmoContentId))
    .orderBy(asc(dmoExtractedPlaces.position));
}

/**
 * Item 2 Phase 1 (ledger 2026-08-23-item2-grounding): DMO extracted places for a MARKET (city),
 * for the slip-grounding resolver. Extracted places are keyed by guide (dmoContentId); market scope
 * lives on the parent dmo_raw_content (city + discover_page_visible), so this joins the two. Only
 * DISCOVER-VISIBLE guides contribute — the same gate the public Discover feed uses, so a traveler's
 * AI slip never grounds against a guide that isn't publicly surfaced. Returns the raw rows (id +
 * name + coords) the resolver matches against; empty when no visible guide covers the market (§13).
 */
export async function getExtractedPlacesForMarket(
  destination: string | null | undefined,
): Promise<ExtractedPlaceRow[]> {
  const city = destination?.split(",")[0]?.trim() ?? "";
  if (!city) return [];
  return db
    .select({
      id: dmoExtractedPlaces.id,
      dmoContentId: dmoExtractedPlaces.dmoContentId,
      position: dmoExtractedPlaces.position,
      name: dmoExtractedPlaces.name,
      normalizedName: dmoExtractedPlaces.normalizedName,
      latitude: dmoExtractedPlaces.latitude,
      longitude: dmoExtractedPlaces.longitude,
      inLibraryId: dmoExtractedPlaces.inLibraryId,
      ticketingUrl: dmoExtractedPlaces.ticketingUrl,
      enrichment: dmoExtractedPlaces.enrichment,
      source: dmoExtractedPlaces.source,
      extractedAt: dmoExtractedPlaces.extractedAt,
    })
    .from(dmoExtractedPlaces)
    .innerJoin(dmoRawContent, eq(dmoRawContent.id, dmoExtractedPlaces.dmoContentId))
    .where(and(ilike(dmoRawContent.city, `%${city}%`), eq(dmoRawContent.discoverPageVisible, true)))
    .limit(500) as unknown as Promise<ExtractedPlaceRow[]>;
}

export function mapRowsToPlaces(rows: ExtractedPlaceRow[]): ExtractedPlaceResponse[] {
  return rows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => {
      const place: ExtractedPlaceResponse = { n: row.position, name: row.name };
      if (row.latitude != null) place.latitude = row.latitude;
      if (row.longitude != null) place.longitude = row.longitude;
      if (row.inLibraryId != null) place.inLibraryId = row.inLibraryId;
      if (row.ticketingUrl != null) place.ticketingUrl = row.ticketingUrl;
      // Migration 188: surface only officialUrl from the enrichment envelope — omit the key
      // entirely when there's no real value (matches this function's existing omit convention).
      const officialUrl = row.enrichment && typeof row.enrichment === "object"
        ? (row.enrichment as Record<string, unknown>).officialUrl
        : undefined;
      if (typeof officialUrl === "string" && officialUrl) place.officialUrl = officialUrl;
      return place;
    });
}

// Replace-by-position (§20a): delete the guide's existing child rows and insert the freshly
// extracted set, but re-stamp any expert-added ticketing_url whose normalized_name matches a new
// row — an expert's curation is never clobbered by a refresh. Returns the inserted rows
// (position order) so the caller can build its response from the SAME rows just persisted,
// which is what makes the merge visible in that response too. `places.length === 0` still
// deletes-and-stops (an intentional "found nothing" replacement, not a no-op).
export async function replaceExtractedPlaces(
  dmoContentId: string,
  places: CandidatePlace[],
  extractedAt: Date,
  source: "stored_text" | "live_fetch",
): Promise<ExtractedPlaceRow[]> {
  return db.transaction(async (tx) => {
    const oldUrls = await tx
      .select({ normalizedName: dmoExtractedPlaces.normalizedName, ticketingUrl: dmoExtractedPlaces.ticketingUrl })
      .from(dmoExtractedPlaces)
      .where(and(eq(dmoExtractedPlaces.dmoContentId, dmoContentId), isNotNull(dmoExtractedPlaces.ticketingUrl)));
    const preservedUrls = new Map<string, string>();
    for (const row of oldUrls) {
      if (row.ticketingUrl) preservedUrls.set(row.normalizedName, row.ticketingUrl);
    }

    await tx.delete(dmoExtractedPlaces).where(eq(dmoExtractedPlaces.dmoContentId, dmoContentId));

    if (places.length === 0) return [];

    const inserted = await tx
      .insert(dmoExtractedPlaces)
      .values(
        places.map((p) => {
          const normalizedName = p.name.toLowerCase().trim();
          return {
            dmoContentId,
            position: p.n,
            name: p.name,
            normalizedName,
            latitude: p.latitude ?? null,
            longitude: p.longitude ?? null,
            inLibraryId: p.inLibraryId ?? null,
            ticketingUrl: preservedUrls.get(normalizedName) ?? null,
            // Migration 188: fresh enrichment wins on every re-extraction — deliberately NOT
            // merged forward from the old row the way ticketingUrl is above. ticketingUrl is
            // expert curation (must survive a refresh); enrichment is derived open-data output
            // that a fresh pipeline run has just recomputed, so stale enrichment from a prior
            // run would be strictly worse than either the new value or an honest NULL.
            enrichment: p.enrichment ?? null,
            source,
            extractedAt,
          };
        }),
      )
      .returning();

    return inserted.slice().sort((a, b) => a.position - b.position);
  });
}

// Point update for PATCH .../extracted-places/:index. `position` IS `index + 1` — extraction
// always writes contiguous 1-based positions in article order, so array-index and position
// coincide (preserves the original blob-array-index semantics exactly). Returns null on no
// match — caller maps that to its existing 404 (guide never extracted, or index out of range).
export async function updateTicketingUrlByPosition(
  dmoContentId: string,
  position: number,
  ticketingUrl: string | null,
): Promise<ExtractedPlaceRow | null> {
  const [row] = await db
    .update(dmoExtractedPlaces)
    .set({ ticketingUrl, updatedAt: new Date() })
    .where(and(eq(dmoExtractedPlaces.dmoContentId, dmoContentId), eq(dmoExtractedPlaces.position, position)))
    .returning();
  return row ?? null;
}

// Batch COUNT for the library list — one grouped query for the whole page instead of N+1. A
// contentId absent from the result has zero child rows; pair with isConcludedEmptyMarker to tell
// "zero because concluded empty" from "zero because extraction never ran".
export async function getExtractedPlacesCounts(dmoContentIds: string[]): Promise<Map<string, number>> {
  if (dmoContentIds.length === 0) return new Map();
  const rows = await db
    .select({ dmoContentId: dmoExtractedPlaces.dmoContentId, cnt: count() })
    .from(dmoExtractedPlaces)
    .where(inArray(dmoExtractedPlaces.dmoContentId, dmoContentIds))
    .groupBy(dmoExtractedPlaces.dmoContentId);
  return new Map(rows.map((r) => [r.dmoContentId, Number(r.cnt)]));
}

// The one state an empty child-row set cannot encode on its own: "a live fetch ran — the
// strongest attempt this system makes — and legitimately found nothing", vs. "extraction never
// ran". Recorded nowhere but the extracted_data blob (§20a) — the blob is otherwise historical.
export function isConcludedEmptyMarker(extractedData: unknown): boolean {
  if (!extractedData || typeof extractedData !== "object") return false;
  const data = extractedData as { places?: unknown; source?: string };
  return Array.isArray(data.places) && data.places.length === 0 && data.source === "live_fetch";
}
