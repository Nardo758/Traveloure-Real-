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
 *   signals, then intersects with hard affinity + location eligibility filters.
 * • Expert path wraps lead-routing.service for destination + specialty scoring.
 * • Sparse markets degrade gracefully: empty arrays + affiliateFallback flag.
 * • Unknown content types degrade to affiliateFallback:true (no arbitrary supply
 *   surfaces without an affinity rule — prevents category noise).
 *
 * Geo radius limitation
 * ─────────────────────
 * providerServices.serviceRadius is a coverage claim (km), but neither
 * providerServices nor users store provider coordinates. True haversine
 * distance cannot be computed server-side. When lat/lng are supplied the
 * resolver therefore falls back to city-level text matching via
 * providerServices.location (e.g., "Kyoto, Japan") combined with serviceRadius
 * IS NOT NULL as a coverage eligibility signal. Any future migration that adds
 * provider lat/lng to the DB can replace this with a real distance check.
 */

import { db } from "../db";
import { eq, and, or, ilike, inArray, isNotNull } from "drizzle-orm";
import { providerServices, users } from "@shared/schema";
import { leadRoutingService, type ExpertScore } from "./lead-routing.service";
import {
  findMatchingProviders,
} from "./provider-matching.service";

// ─── Affinity Rules Config ────────────────────────────────────────────────────
// Maps gem/content type → provider serviceType enum values + expert specialty topics.
//
// serviceTypes: values from the providerServices.serviceType enum —
//   consultation | planning | action | concierge | experience | specialty
//
// expertSpecialties: topic strings forwarded to lead-routing specialty scoring.

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
  // Neighborhoods → local experience + specialty + planning
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
  // Generic activity / adventure
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
  /** Availability + quality score (featured is a tiebreaker in sort, not additive) */
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
  /** WGS-84 latitude of the content item (enables city-level location matching) */
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

  const rule: AffinityRule | undefined = AFFINITY_RULES[normalizedType];

  // Unknown content type: surface nothing (never pollute recommendations with
  // off-affinity supply). Experts can still resolve by destination.
  if (!rule) {
    const experts = await resolveExperts(
      { serviceTypes: [], expertSpecialties: [] },
      normalizedCity,
      normalizedNeighborhood,
      limit,
    );
    return { providers: [], experts, affiliateFallback: true };
  }

  const [matchedProviders, matchedExperts] = await Promise.all([
    resolveProviders(rule, normalizedNeighborhood, normalizedCity, input.lat, input.lng, limit),
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
// Two-stage:
// 1. Hard eligibility WHERE: serviceType affinity + location filter
// 2. Availability/scheduling enrichment from provider-matching.service
//    Ranking: availability score (primary) → quality signals → featured (tiebreaker)

async function resolveProviders(
  rule: AffinityRule,
  neighborhood: string,
  city: string,
  lat: number | undefined,
  lng: number | undefined,
  limit: number,
): Promise<ProviderMatch[]> {
  try {
    // ── Step 1: Build hard eligibility WHERE conditions ────────────────────
    const conditions: any[] = [
      eq(providerServices.status, "active"),
      // Affinity: serviceType must be in the configured set for this content type
      inArray(providerServices.serviceType as any, rule.serviceTypes),
    ];

    // Location eligibility (hard filter — provider must pass at least one criterion):
    //
    // Priority A: Exact neighborhood match (case-insensitive LIKE)
    // Priority B: City-level match via providerServices.location text + serviceRadius
    //             coverage claim. Note: provider coordinates are not stored in this
    //             schema, so haversine distance cannot be computed. City text match
    //             is the closest available proxy. serviceRadius IS NOT NULL confirms
    //             the provider explicitly claims geographic coverage.
    // If no location context at all: no restriction (show any eligible service).

    if (neighborhood) {
      const neighborhoodMatch = ilike(providerServices.neighborhood, `%${neighborhood}%`);

      if (lat !== undefined && lng !== undefined && city) {
        // Neighborhood match OR (city-level location match AND radius coverage claim)
        conditions.push(
          or(
            neighborhoodMatch,
            and(
              ilike(providerServices.location, `%${city}%`),
              isNotNull(providerServices.serviceRadius),
            )!,
          )!
        );
      } else {
        // Neighborhood only
        conditions.push(neighborhoodMatch);
      }
    } else if (lat !== undefined && lng !== undefined && city) {
      // No neighborhood specified; use city + radius as geo coverage signal
      conditions.push(
        or(
          ilike(providerServices.location, `%${city}%`),
          isNotNull(providerServices.serviceRadius),
        )!
      );
    }
    // No location context → no restriction

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

    // ── Step 3: Availability signals from provider-matching.service ────────
    // Call with today's date and a broad daytime window to get scheduling-based
    // matchScore for each provider. Non-critical: falls back to quality signals.
    const today = new Date().toISOString().split("T")[0];
    const availabilityScoreMap = new Map<string, number>();

    try {
      const matchResult = await findMatchingProviders({
        date: today,
        startTime: "09:00",
        endTime: "18:00",
      });
      for (const mp of matchResult.providers) {
        availabilityScoreMap.set(mp.providerId, mp.matchScore);
      }
    } catch {
      // Scheduling data unavailable; pure quality-signal ranking below
    }

    // ── Step 4: Score eligible candidates ─────────────────────────────────
    // Scoring components (featured is NOT additive — applied as sort tiebreaker):
    //   Availability (from provider-matching.service):  0–100
    //   Exact neighborhood match bonus:                  +20 / +10 partial
    //   Smaller serviceRadius bonus (tighter coverage):  0–10
    //   Rating:                                          0–15
    //   Bookings popularity:                             0–5

    const scored = candidateRows.map((row) => {
      const availScore = availabilityScoreMap.get(row.userId) ?? 0;

      // Neighborhood proximity bonus
      let neighborhoodBonus = 0;
      const svcNeighborhood = (row.neighborhood ?? "").toLowerCase().trim();
      if (neighborhood && svcNeighborhood) {
        if (svcNeighborhood === neighborhood) neighborhoodBonus = 20;
        else if (svcNeighborhood.includes(neighborhood) || neighborhood.includes(svcNeighborhood)) neighborhoodBonus = 10;
      }

      // Tighter serviceRadius = more locally specific provider (if radius is set)
      const geoBonus =
        row.serviceRadius
          ? Math.max(0, 10 - Math.floor(row.serviceRadius / 10))
          : 0;

      // Quality signals
      const rating = parseFloat(row.averageRating ?? "0");
      const ratingBonus = rating >= 4.5 ? 15 : rating >= 4.0 ? 10 : rating >= 3.5 ? 5 : 0;
      const popularityBonus = Math.min(Math.floor((row.bookingsCount ?? 0) / 5), 5);

      const totalScore = availScore + neighborhoodBonus + geoBonus + ratingBonus + popularityBonus;

      const providerName =
        [row.providerFirstName, row.providerLastName].filter(Boolean).join(" ").trim() ||
        row.providerUsername ||
        "Provider";

      return { row, totalScore, providerName };
    });

    // Sort: relevance score descending, featured as tiebreaker (not additive)
    scored.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return (b.row.isFeatured ? 1 : 0) - (a.row.isFeatured ? 1 : 0);
    });

    return scored.slice(0, limit).map(({ row, totalScore, providerName }): ProviderMatch => ({
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
// Delegates entirely to lead-routing.service:
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
