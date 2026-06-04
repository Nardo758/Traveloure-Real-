/**
 * Content → Supply Matching Service
 *
 * For any piece of content (gem, neighborhood, experience), find the best-matching
 * supply (providers/experts/services) using geographic proximity, demand-type
 * expansion, and quality signals.
 *
 * Wires together:
 *   - contentRegistry        — central content table (v2 spec)
 *   - travelPulseHiddenGems  — gem catalog
 *   - providerServices       — supply inventory
 *   - DEMAND_SERVICE_SYNONYMS — demand-type → service-type expansion
 *   - featured-sort          — bounded boost ranking
 *   - contentPlacementRules  — admin overrides + auto-tagging
 *
 * Scoring (0-100):
 *   geo_match  (50pts) — same neighborhood = 50, same city = 25, same country = 5
 *   type_match (30pts) — demand-type expansion matches provider serviceType
 *   quality    (15pts) — averageRating × 3 + log(reviewCount + 1)
 *   featured   ( 5pts) — bounded by featured-sort rules (requires quality ≥ 30)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { eq, and, or, ilike, inArray } from "drizzle-orm";
import {
  contentRegistry,
  contentPlacementRules,
  providerServices,
  travelPulseHiddenGems,
  cityNeighborhoods,
  users,
} from "@shared/schema";
import { expandDemandType } from "./demand-service-synonyms";
import { featuredAdjustedScore } from "./featured-sort";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MatchSource {
  type: "gem" | "neighborhood" | "experience" | "content";
  city?: string | null;
  country?: string | null;
  neighborhood?: string | null;
  placeType?: string | null;
  bestFor?: string[];
  title?: string;
  trackingNumber?: string;
}

export interface MatchedSupply {
  providerId: string;
  providerName: string;
  serviceId: string;
  serviceName: string;
  serviceType: string | null;
  neighborhood: string | null;
  city: string | null;
  price: string | null;
  isFeatured: boolean;
  averageRating: number;
  reviewCount: number;
  imageUrl: string | null;
  matchScore: number;
  matchReasons: string[];
  trackingNumber: string | null;
}

export interface MatchResult {
  source: MatchSource;
  matches: MatchedSupply[];
  totalCandidates: number;
  expansionTerms: string[];
}

// ─── Scoring constants ─────────────────────────────────────────────────────

const GEO_NEIGHBORHOOD_PTS = 50;
const GEO_CITY_PTS = 25;
const GEO_COUNTRY_PTS = 5;
const TYPE_EXACT_PTS = 30;
const TYPE_SYNONYM_PTS = 20;
const TYPE_BESTFOR_PTS = 10;

// ─── Core matcher ──────────────────────────────────────────────────────────

/**
 * Match supply for any content source. Generic dispatcher.
 */
export async function matchSupplyForContent(
  source: MatchSource,
  options: { limit?: number; minScore?: number; autoTag?: boolean } = {}
): Promise<MatchResult> {
  const { limit = 10, minScore = 20, autoTag = false } = options;

  // 1. Build the demand-type expansion (from placeType + bestFor)
  const expansionTerms = buildExpansionTerms(source);

  // 2. Pull candidate provider services (filter by city/country to keep it cheap)
  const candidates = await getCandidates(source);

  // 3. Score each candidate
  const scored = candidates.map((c) => scoreCandidate(c, source, expansionTerms));

  // 4. Filter by min score, sort by featured-adjusted score, limit
  const matches = scored
    .filter((s) => s.matchScore >= minScore)
    .sort((a, b) => {
      const aAdj = featuredAdjustedScore({ isFeatured: a.isFeatured }, a.matchScore);
      const bAdj = featuredAdjustedScore({ isFeatured: b.isFeatured }, b.matchScore);
      return bAdj - aAdj;
    })
    .slice(0, limit);

  // 5. Optionally auto-tag results into contentPlacementRules (fire & forget)
  if (autoTag && source.trackingNumber && matches.length > 0) {
    autoTagPlacement(source, matches).catch((err) =>
      console.error("[content-supply-matching] auto-tag failed:", err)
    );
  }

  return {
    source,
    matches,
    totalCandidates: candidates.length,
    expansionTerms,
  };
}

/**
 * Convenience: match supply for a hidden gem.
 */
export async function matchSupplyForGem(
  gemId: string,
  options: { limit?: number; minScore?: number; autoTag?: boolean } = {}
): Promise<MatchResult | null> {
  const [gem] = await db.select().from(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.id, gemId));
  if (!gem) return null;

  return matchSupplyForContent(
    {
      type: "gem",
      city: gem.city,
      country: gem.country,
      neighborhood: (gem as any).neighborhood ?? null,
      placeType: gem.placeType,
      bestFor: Array.isArray(gem.bestFor) ? (gem.bestFor as string[]) : [],
      title: gem.placeName,
    },
    options
  );
}

/**
 * Convenience: match supply for a neighborhood.
 */
export async function matchSupplyForNeighborhood(
  neighborhoodSlug: string,
  options: { limit?: number; minScore?: number; autoTag?: boolean } = {}
): Promise<MatchResult | null> {
  const [n] = await db.select().from(cityNeighborhoods).where(eq(cityNeighborhoods.slug, neighborhoodSlug));
  if (!n) return null;

  return matchSupplyForContent(
    {
      type: "neighborhood",
      city: n.city,
      country: n.country,
      neighborhood: n.slug,
      title: n.name,
    },
    options
  );
}

/**
 * Convenience: match supply for a content_registry row by tracking number.
 */
export async function matchSupplyForTrackingNumber(
  trackingNumber: string,
  options: { limit?: number; minScore?: number; autoTag?: boolean } = {}
): Promise<MatchResult | null> {
  const [content] = await db.select().from(contentRegistry).where(eq(contentRegistry.trackingNumber, trackingNumber));
  if (!content) return null;

  // Dispatch to the right matcher based on contentType
  if (content.contentType === "gem" as any || content.contentType === "experience") {
    // Try gem lookup first
    const [gem] = await db.select().from(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.id, content.contentId));
    if (gem) {
      return matchSupplyForGem(gem.id, options);
    }
  }

  // Fallback: build source from registry metadata
  const metadata = (content.metadata as any) || {};
  return matchSupplyForContent(
    {
      type: "content",
      city: metadata.city || null,
      country: metadata.country || null,
      neighborhood: metadata.neighborhood || null,
      placeType: metadata.placeType || null,
      bestFor: Array.isArray(metadata.bestFor) ? metadata.bestFor : [],
      title: content.title || undefined,
      trackingNumber: content.trackingNumber,
    },
    options
  );
}

// ─── Internals ─────────────────────────────────────────────────────────────

function buildExpansionTerms(source: MatchSource): string[] {
  const terms = new Set<string>();

  if (source.placeType) {
    expandDemandType(source.placeType).forEach((t) => terms.add(t));
  }

  for (const tag of source.bestFor || []) {
    expandDemandType(tag).forEach((t) => terms.add(t));
  }

  return Array.from(terms);
}

async function getCandidates(source: MatchSource): Promise<any[]> {
  // Filter by location to keep the candidate set bounded.
  // If city given, restrict to that city; otherwise pull active services only.
  const cityFilter = source.city ? source.city.toLowerCase() : null;

  const conditions = [eq(providerServices.status, "active")];
  if (cityFilter) {
    conditions.push(ilike(providerServices.location, `%${source.city}%`));
  }

  const rows = await db.select({
    serviceId: providerServices.id,
    providerId: providerServices.userId,
    serviceName: providerServices.serviceName,
    serviceType: providerServices.serviceType,
    neighborhood: providerServices.neighborhood,
    location: providerServices.location,
    price: providerServices.price,
    isFeatured: providerServices.isFeatured,
    averageRating: providerServices.averageRating,
    reviewCount: providerServices.reviewCount,
    serviceImage: providerServices.serviceImage,
    trackingNumber: providerServices.trackingNumber,
    providerFirstName: users.firstName,
    providerLastName: users.lastName,
  })
    .from(providerServices)
    .leftJoin(users, eq(providerServices.userId, users.id))
    .where(and(...conditions))
    .limit(200);

  return rows;
}

function scoreCandidate(
  candidate: any,
  source: MatchSource,
  expansionTerms: string[]
): MatchedSupply {
  let score = 0;
  const reasons: string[] = [];

  // Geographic match
  if (source.neighborhood && candidate.neighborhood &&
      candidate.neighborhood.toLowerCase() === source.neighborhood.toLowerCase()) {
    score += GEO_NEIGHBORHOOD_PTS;
    reasons.push(`Same neighborhood (${source.neighborhood})`);
  } else if (source.city && candidate.location &&
             candidate.location.toLowerCase().includes(source.city.toLowerCase())) {
    score += GEO_CITY_PTS;
    reasons.push(`Same city (${source.city})`);
  } else if (source.country && candidate.location &&
             candidate.location.toLowerCase().includes(source.country.toLowerCase())) {
    score += GEO_COUNTRY_PTS;
    reasons.push(`Same country`);
  }

  // Type match (demand-type expansion)
  if (candidate.serviceType && expansionTerms.length > 0) {
    const candidateType = candidate.serviceType.toLowerCase();
    if (source.placeType && candidateType === source.placeType.toLowerCase()) {
      score += TYPE_EXACT_PTS;
      reasons.push(`Exact type match (${candidateType})`);
    } else if (expansionTerms.some((t) => candidateType.includes(t) || t.includes(candidateType))) {
      score += TYPE_SYNONYM_PTS;
      reasons.push(`Related service type (${candidateType})`);
    } else if (source.bestFor && source.bestFor.length > 0) {
      // Check bestFor against service name (looser match)
      const candidateName = (candidate.serviceName || "").toLowerCase();
      const matched = source.bestFor.find((tag) => candidateName.includes(tag.toLowerCase()));
      if (matched) {
        score += TYPE_BESTFOR_PTS;
        reasons.push(`Suits ${matched}`);
      }
    }
  }

  // Quality (rating × 3 + log of review count, capped at 15)
  const rating = parseFloat(candidate.averageRating || "0");
  const reviewCount = candidate.reviewCount || 0;
  const qualityPts = Math.min(15, rating * 3 + Math.log(reviewCount + 1) * 1.5);
  score += qualityPts;
  if (rating > 0) {
    reasons.push(`${rating.toFixed(1)}★ (${reviewCount} reviews)`);
  }

  const providerName = [candidate.providerFirstName, candidate.providerLastName].filter(Boolean).join(" ") || "Provider";

  return {
    providerId: candidate.providerId,
    providerName,
    serviceId: candidate.serviceId,
    serviceName: candidate.serviceName,
    serviceType: candidate.serviceType,
    neighborhood: candidate.neighborhood,
    city: source.city || null,
    price: candidate.price,
    isFeatured: !!candidate.isFeatured,
    averageRating: rating,
    reviewCount,
    imageUrl: candidate.serviceImage,
    matchScore: Math.round(score),
    matchReasons: reasons,
    trackingNumber: candidate.trackingNumber,
  };
}

/**
 * Persist top matches into contentPlacementRules with isAutoTagged=true
 * so the admin UI can review/override them. Idempotent per (source, serviceId).
 */
async function autoTagPlacement(source: MatchSource, matches: MatchedSupply[]): Promise<void> {
  if (!source.trackingNumber || !source.city) return;

  for (const m of matches.slice(0, 5)) {
    if (!m.trackingNumber) continue;

    try {
      const existing = await db.select().from(contentPlacementRules)
        .where(and(
          eq(contentPlacementRules.contentSource, "content_registry"),
          eq(contentPlacementRules.sourceId, m.trackingNumber),
          eq(contentPlacementRules.cityName, source.city)
        ))
        .limit(1);

      if (existing.length > 0) continue;

      await db.insert(contentPlacementRules).values({
        contentSource: "content_registry",
        sourceId: m.trackingNumber,
        contentLabel: m.serviceName,
        cityName: source.city,
        country: source.country || null,
        surfaces: ["travelpulse-discover", "experience-discovery"],
        minPulseScore: 0,
        isPinned: false,
        isAutoTagged: true,
        isActive: true,
        notes: `Auto-matched to ${source.type} "${source.title}" (score ${m.matchScore})`,
      });
    } catch (err) {
      console.error(`[content-supply-matching] auto-tag failed for ${m.serviceId}:`, err);
    }
  }
}
