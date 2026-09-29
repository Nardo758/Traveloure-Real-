/**
 * The ONE adapter interface (content sourcing brief §6; ledger `2026-09-29-a5-draft-open-set`).
 * Crawl today, API tomorrow: the engine asks `sourcesForNeed(need, market)` and never knows whether
 * a fact came from a crawl or an API. Every adapter returns FactDrafts that the ONE writer
 * (`recordFacts`) stores with cost and provenance.
 *
 * Built in A5: `PlacesAdapter` (the structured spine). A6 builds `TavilyExtractAdapter`, the
 * registry surface and the coverage report; nothing here stands in for them.
 */
import type { ContentNeed, FactOrigin, FactType, LicenseClass, PlaceRefKind } from "@shared/content-facts";

export interface PlaceRef {
  kind: PlaceRefKind;
  ref: string;
  lat?: number | null;
  lng?: number | null;
}

export interface FactDraft {
  placeRefKind: PlaceRefKind;
  placeRef: string;
  placeLat: number | null;
  placeLng: number | null;
  market: string | null;
  need: ContentNeed;
  factType: FactType;
  value: Record<string, unknown>;
  origin: FactOrigin;
  sourceId: string | null;
  sourceUrl: string | null;
  license: LicenseClass | null;
  fetchedAt: Date;
  expiresAt: Date | null;
  /** The fetch's cost, recorded on ONE draft per call so a sum over rows is the real spend. */
  costCents: number;
}

export interface FetchRequest {
  need: ContentNeed;
  market: string | null;
  /** What to look up — a free-text place ("Kinkaku-ji") plus the city it is in. */
  query: { text: string; city: string | null };
  placeRef?: PlaceRef;
  dates?: { start: string; end: string };
  /** Brief §7: > 0 only inside a paid run or an expert action. The free path passes 0. */
  budgetCents: number;
}

export interface SourceAdapter {
  readonly id: string;
  covers(need: ContentNeed, market: string | null): boolean;
  fetch(req: FetchRequest): Promise<FactDraft[]>;
  attribution(fact: FactDraft): { sourceName: string; sourceUrl: string | null; license: LicenseClass | null };
}
