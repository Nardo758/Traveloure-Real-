/**
 * Gem TEASER projection — the ruled public shape of a hidden gem on discover
 * surfaces (2026-08-29 Replit-audit ruling 3, ledger 2026-08-29-replit-gem-audit).
 *
 * The thin gem detail (feed tile + details sheet) carries the teaser set ONLY.
 * The ruling REMOVES from the public payload:
 *   - `address`                              (the exact-location reveal)
 *   - `touristMentions` / `localMentions` / `localRating`  (the popularity ratios)
 *   - `daysUntilMainstream`                  (the mainstream forecast)
 *   - `discoveryStatus`                      (the discovery status)
 * plus the internal bookkeeping columns (`aiGenerated`, `aiGeneratedAt`,
 * `detectedAt`, `lastUpdated`, `latitude`, `longitude`) and the RAW
 * `curatedByExpertId` — attribution ships only as the server-RESOLVED
 * `curatedBy` object (ruling 1; a real user row or null, never a bare id).
 *
 * This is an ALLOWLIST, deliberately (the §19 posture): a new gem column is
 * unreachable from the public teaser until someone names it here. The spec
 * (`server/services/__tests__/gem-teaser.test.ts`) asserts the exact key set —
 * widen it only with a ruling.
 */

import type { GemCuratedBy } from "./gem-curated-by";

/** The exact keys a teaser row may carry (before derived fields like `bookability`). */
export const GEM_TEASER_KEYS = [
  "id",
  "city",
  "country",
  "placeName",
  "placeType",
  "description",
  "whyLocalsLoveIt",
  "bestFor",
  "priceRange",
  "imageUrl",
  "gemScore",
  "neighborhood",
  "curatedBy",
] as const;

export type GemTeaserKey = (typeof GEM_TEASER_KEYS)[number];

export interface GemTeaser {
  /** Structural compatibility with record-shaped consumers (e.g. BookabilityInput).
   *  The RUNTIME key set stays exactly GEM_TEASER_KEYS — pinned by the spec. */
  [key: string]: unknown;
  id: string;
  city: string;
  country: string | null;
  placeName: string;
  placeType: string | null;
  description: string | null;
  whyLocalsLoveIt: string | null;
  bestFor: unknown;
  priceRange: string | null;
  imageUrl: string | null;
  gemScore: number | null;
  neighborhood: string | null;
  curatedBy: GemCuratedBy | null;
}

/**
 * Project a full gem row (+ resolved `curatedBy`) down to the ruled teaser set.
 * Pick-based: keys are copied by NAME from GEM_TEASER_KEYS, so anything not
 * ruled in — including a column added later — never reaches the payload.
 */
export function toGemTeaser(row: Record<string, unknown> & { curatedBy?: GemCuratedBy | null }): GemTeaser {
  const out: Record<string, unknown> = {};
  for (const key of GEM_TEASER_KEYS) {
    out[key] = key in row ? (row as Record<string, unknown>)[key] : null;
  }
  out.curatedBy = row.curatedBy ?? null;
  return out as unknown as GemTeaser;
}
