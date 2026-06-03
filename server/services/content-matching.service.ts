/**
 * Content-to-Supply Matching Service
 *
 * Given a piece of content (gem, hotel, restaurant, attraction, etc.), resolves
 * which provider services and which experts are relevant to surface alongside it.
 *
 * Architecture
 * ─────────────
 * • AFFINITY_RULES is the single config that drives all matching — extend it,
 *   never add per-endpoint logic.
 * • Provider path wraps provider-matching.service for availability/scheduling
 *   signals, then intersects with affinity + location filters.
 * • Expert path wraps lead-routing.service for destination + specialty scoring.
 * • Sparse markets degrade gracefully: empty arrays + affiliateFallback flag.
 */

import { db } from "../db";
import { eq, and, or, ilike, inArray, isNotNull } from "drizzle-orm";
import { providerServices, users } from "@shared/schema";
import { leadRoutingService, type ExpertScore } from "./lead-routing.service";
import {
  findMatchingProviders,
  type MatchedProvider,
} from "./provider-matching.service";

// ─── Affinity Rules Config ────────────────────────────────────────────────────
// Maps gem/content type → provider serviceType enum values + expert specialty topics.
//
// serviceTypes: values stored in providerServices.serviceType
//   allowed: consultation | planning | action | concierge | experience | specialty
// expertSpecialties: topic strings passed to lead-routing specialty scoring

export interface AffinityRule {
  /** providerServices.serviceType values eligible for this content type */
  serviceTypes: string[];
  /** Topic keywords passed to lead-routing specialist scoring */
  expertSpecialties: string[];
}

export const AFFINITY_RULES: Readonly<Record<string, AffinityRule>> = {
  // Photo spots → specialty/experience photography services
  photo_spot: {
    serviceTypes: ["experience", "specialty"],
    expertSpecialties: [],
  },
  // Hotels/lodging → concierge/action services (transfers, car hire, airport pickup)
  hotel: {
    serviceTypes: ["action", "concierge"],
    expertSpecialties: [],
  },
  lodging: {
    serviceTypes: ["action", "concierge"],
    expertSpecialties: [],
  },
  // Attractions, temples, museums → experience + specialty (tours, tickets, guides)
  attraction: {
    serviceTypes: ["experience", "specialty"],
    expertSpecialties: ["cultural", "history", "heritage"],
  },
  temple: {
    serviceTypes: ["experience", "specialty"],
    expertSpecialties: ["cultural", "history", "heritage"],
  },
  museum: {
    serviceTypes: ["experience", "specialty"],
    expertSpecialties: ["cultural", "art", "history"],
  },
  // Restaurants/cafés → action + concierge (reservation services, food tours)
  restaurant: {
    serviceTypes: ["action", "concierge", "experience"],
    expertSpecialties: ["foodie", "culinary", "food"],
  },
  cafe: {
    serviceTypes: ["action", "concierge"],
    expertSpecialties: ["foodie", "culinary", "food"],
  },
  food: {
    serviceTypes: ["action", "concierge", "experience"],
    expertSpecialties: ["foodie", "culinary"],
  },
  // Neighborhoods → local experience + specialty services
  neighborhood: {
    serviceTypes: ["experience", "specialty", "planning"],
    expertSpecialties: ["local"],
  },
  // Wellness → wellness experience + specialty services
  wellness: {
    serviceTypes: ["experience", "specialty"],
    expertSpecialties: [],
  },
  // Nightlife → action + experience (safe transport, bar tours)
  nightlife: {
    serviceTypes: ["action", "experience"],
    expertSpecialties: [],
  },
  // Trip-level → planning + consultation + concierge
  trip: {
    serviceTypes: ["planning", "consultation", "concierge"],
    expertSpecialties: ["itinerary", "planning"],
  },
  // Generic activity/adventure
  activity: {
    serviceTypes: ["experience", "specialty"],
    expertSpecialties: [],
  },
  // Shopping districts
  shopping: {
    serviceTypes: ["experience", "concierge"],
    expertSpecialties: [],
  },
  // Beach / water activities
  beach: {
    serviceTypes: ["experience", "specialty", "action"],
    expertSpecialties: [],
  },
};

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ProviderMatch {
  serviceId: string;
  serviceName: string;
  shortDescription: string | null;
  serviceType: string | null;
  price: string | null;
  priceType: string | null;
  neighborhood: string | null;
  location: string | null;
  serviceRadius: number | null;
  isFeatured: boolean;
  averageRating: string | null;
  bookingsCount: number;
  /** Combined relevance score: availability signals + quality tiebreakers */
  relevanceScore: number;
  providerId: string;
  providerName: string;
}

export interface ExpertMatch {
  expertId: string;
  expertName: string;
  totalScore: number;
  destinationScore: number;
  specialtyScore: number;
  availabilityScore: number;
  responseRateScore: number;
}

export interface ContentMatchResult {
  providers: ProviderMatch[];
  experts: ExpertMatch[];
  /** True when zero native providers matched; UI should show affiliate partner options */
  affiliateFallback: boolean;
}

export interface ContentMatchInput {
  /** Gem/content type, e.g. "restaurant", "photo_spot", "hotel" */
  type: string;
  neighborhood?: string;
  city?: string;
  /** WGS-84 latitude of the content item (enables serviceRadius coverage check) */
  lat?: number;
  /** WGS-84 longitude of the content item */
  lng?: number;
  limit?: number;
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve matched providers and experts for a given content item.
 * Always returns a valid result object — never throws.
 */
export async function resolveMatches(input: ContentMatchInput): Promise<ContentMatchResult> {
  const limit = Math.min(input.limit ?? 3, 10);
  const normalizedType = (input.type ?? "").toLowerCase().trim();
  const normalizedNeighborhood = (input.neighborhood ?? "").toLowerCase().trim();
  const normalizedCity = (input.city ?? "").toLowerCase().trim();

  const rule: AffinityRule = AFFINITY_RULES[normalizedType] ?? {
    serviceTypes: [],
    expertSpecialties: [],
  };

  const [matchedProviders, matchedExperts] = await Promise.all([
    resolveProviders(rule, normalizedNeighborhood, input.lat, input.lng, limit),
    resolveExperts(rule, normalizedCity, normalizedNeighborhood, limit),
  ]);

  return {
    providers: matchedProviders,
    experts: matchedExperts,
    affiliateFallback: matchedProviders.length === 0,
  };
}

// ─── Provider resolver ────────────────────────────────────────────────────────
//
// Two-stage approach:
// 1. DB query with hard eligibility filters (serviceType affinity + location)
// 2. Enrich with availability/scheduling signals from provider-matching.service
//    then rank: availability score (primary) → rating → featured (tiebreakers)

async function resolveProviders(
  rule: AffinityRule,
  neighborhood: string,
  lat: number | undefined,
  lng: number | undefined,
  limit: number,
): Promise<ProviderMatch[]> {
  try {
    // ── Step 1: Build eligibility WHERE conditions ─────────────────────────
    const conditions: any[] = [eq(providerServices.status, "active")];

    // Affinity filter: serviceType must be in the rule's eligible set.
    // When the rule has no serviceTypes (unknown content type), skip this filter
    // so we degrade to returning any active service rather than nothing.
    if (rule.serviceTypes.length > 0) {
      conditions.push(inArray(providerServices.serviceType as any, rule.serviceTypes));
    }

    // Location eligibility — hard filter, not just a scoring bonus:
    //   INCLUDE if neighborhood matches (case-insensitive), OR
    //   INCLUDE if no neighborhood supplied but lat/lng given and provider has
    //   a serviceRadius (claims geographic coverage), OR
    //   INCLUDE if no location context at all (show any eligible service)
    if (neighborhood) {
      // Must match neighborhood OR have radius coverage when we have coordinates
      const neighborhoodMatch = ilike(providerServices.neighborhood, `%${neighborhood}%`);
      if (lat !== undefined && lng !== undefined) {
        // Either neighborhood matches OR provider offers radius-based coverage
        conditions.push(
          or(neighborhoodMatch, isNotNull(providerServices.serviceRadius))!
        );
      } else {
        conditions.push(neighborhoodMatch);
      }
    } else if (lat !== undefined && lng !== undefined) {
      // No neighborhood string but coordinates given: require radius coverage
      conditions.push(isNotNull(providerServices.serviceRadius));
    }
    // When neither neighborhood nor lat/lng provided, no location restriction.

    // ── Step 2: Fetch eligible services with provider display name ─────────
    const candidateRows = await db
      .select({
        id: providerServices.id,
        userId: providerServices.userId,
        serviceName: providerServices.serviceName,
        shortDescription: providerServices.shortDescription,
        serviceType: providerServices.serviceType,
        price: providerServices.price,
        priceType: providerServices.priceType,
        neighborhood: providerServices.neighborhood,
        location: providerServices.location,
        serviceRadius: providerServices.serviceRadius,
        isFeatured: providerServices.isFeatured,
        averageRating: providerServices.averageRating,
        bookingsCount: providerServices.bookingsCount,
        providerFirstName: users.firstName,
        providerLastName: users.lastName,
        providerUsername: users.username,
      })
      .from(providerServices)
      .leftJoin(users, eq(providerServices.userId, users.id))
      .where(and(...conditions));

    if (candidateRows.length === 0) return [];

    // ── Step 3: Get availability signals from provider-matching.service ────
    // Use today's date with a broad daytime window to check scheduling.
    // This gives us preferred-slot and booking-conflict signals from the
    // existing service without needing a traveller-specific date.
    const today = new Date().toISOString().split("T")[0];
    let availabilityScoreMap = new Map<string, number>();

    try {
      const matchResult = await findMatchingProviders({
        date: today,
        startTime: "09:00",
        endTime: "18:00",
      });
      // Map providerId (user_id) → matchScore for O(1) lookup
      for (const mp of matchResult.providers) {
        availabilityScoreMap.set(mp.providerId, mp.matchScore);
      }
    } catch {
      // Non-critical — fall back to pure quality-signal ranking
    }

    // ── Step 4: Score and rank eligible candidates ─────────────────────────
    // Primary: availability matchScore from provider-matching (0–100)
    // Tiebreakers: exact neighborhood match, rating, featured flag, bookings

    const scored = candidateRows.map((row) => {
      // Availability signal from provider-matching (0 if provider has no schedule)
      const availScore = availabilityScoreMap.get(row.userId) ?? 0;

      // Neighborhood proximity bonus (tiebreaker, not gating)
      let neighborhoodBonus = 0;
      const svcNeighborhood = (row.neighborhood ?? "").toLowerCase().trim();
      if (neighborhood && svcNeighborhood) {
        if (svcNeighborhood === neighborhood) neighborhoodBonus = 20;
        else if (svcNeighborhood.includes(neighborhood) || neighborhood.includes(svcNeighborhood)) neighborhoodBonus = 10;
      }

      // For lat/lng coverage: providers with smaller declared radius are more
      // precisely located → higher relevance (inverse of radius, capped at 10)
      let geoBonus = 0;
      if (lat !== undefined && lng !== undefined && row.serviceRadius) {
        // Tighter radius = more likely locally relevant
        geoBonus = Math.max(0, 10 - Math.floor(row.serviceRadius / 10));
      }

      // Quality tiebreakers
      const rating = parseFloat(row.averageRating ?? "0");
      const ratingBonus = rating >= 4.5 ? 15 : rating >= 4.0 ? 10 : rating >= 3.5 ? 5 : 0;
      const featuredBonus = row.isFeatured ? 5 : 0;
      const popularityBonus = Math.min(Math.floor((row.bookingsCount ?? 0) / 5), 5);

      const totalScore = availScore + neighborhoodBonus + geoBonus + ratingBonus + featuredBonus + popularityBonus;

      const providerName =
        [row.providerFirstName, row.providerLastName].filter(Boolean).join(" ").trim() ||
        row.providerUsername ||
        "Provider";

      return { row, totalScore, providerName };
    });

    return scored
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit)
      .map(({ row, totalScore, providerName }): ProviderMatch => ({
        serviceId: row.id,
        serviceName: row.serviceName,
        shortDescription: row.shortDescription ?? null,
        serviceType: row.serviceType ?? null,
        price: row.price ?? null,
        priceType: row.priceType ?? null,
        neighborhood: row.neighborhood ?? null,
        location: row.location ?? null,
        serviceRadius: row.serviceRadius ?? null,
        isFeatured: row.isFeatured ?? false,
        averageRating: row.averageRating ?? null,
        bookingsCount: row.bookingsCount ?? 0,
        relevanceScore: totalScore,
        providerId: row.userId,
        providerName,
      }));
  } catch (err: any) {
    console.error("[ContentMatching] resolveProviders error:", err.message);
    return [];
  }
}

// ─── Expert resolver ──────────────────────────────────────────────────────────
// Delegates entirely to lead-routing.service scoring:
//   destination 40 / specialty 25 / availability 20 / response 15

async function resolveExperts(
  rule: AffinityRule,
  city: string,
  neighborhood: string,
  limit: number,
): Promise<ExpertMatch[]> {
  try {
    const destination = neighborhood || city || "";
    if (!destination) return [];

    // Use the first specialty keyword as the topic for the lead-routing scorer
    const topic = rule.expertSpecialties[0] ?? "";

    const scores = await leadRoutingService.scoreExperts({ destination, topic });

    return scores
      .filter((s) => s.totalScore > 0)
      .slice(0, limit)
      .map(
        (s: ExpertScore): ExpertMatch => ({
          expertId: s.expertId,
          expertName: s.expertName,
          totalScore: s.totalScore,
          destinationScore: s.destinationScore,
          specialtyScore: s.specialtyScore,
          availabilityScore: s.availabilityScore,
          responseRateScore: s.responseRateScore,
        }),
      );
  } catch (err: any) {
    console.error("[ContentMatching] resolveExperts error:", err.message);
    return [];
  }
}
