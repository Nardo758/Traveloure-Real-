/**
 * Content-to-Supply Matching Service
 *
 * Given a piece of content (gem, hotel, restaurant, attraction, etc.), resolves
 * which provider services and which experts are relevant to surface alongside it.
 *
 * This is the foundational layer for cross-sell, expert matching ("Ask an expert"),
 * and content-driven recommendations.
 */

import { db } from "../db";
import { eq, and, or, ilike, isNotNull, sql } from "drizzle-orm";
import { providerServices, users } from "@shared/schema";
import { leadRoutingService, type ExpertScore } from "./lead-routing.service";

// ─── Affinity Rules Config ───────────────────────────────────────────────────
// Maps gem/content type → provider keyword patterns + expert specialty keywords.
// Extend this constant — never hard-code affinity logic per-endpoint.

export interface AffinityRule {
  /** Keywords matched (case-insensitive) against providerServices.serviceName + description */
  providerKeywords: string[];
  /** Topics passed to lead-routing specialty scoring */
  expertSpecialties: string[];
}

export const AFFINITY_RULES: Readonly<Record<string, AffinityRule>> = {
  // Photo spots → photography services
  photo_spot: {
    providerKeywords: ["photography", "photo", "photoshoot", "videography", "camera", "instagram"],
    expertSpecialties: [],
  },
  // Hotels/lodging → transport services (transfer, car hire)
  hotel: {
    providerKeywords: ["transfer", "transportation", "car hire", "airport transfer", "pickup", "taxi", "shuttle"],
    expertSpecialties: [],
  },
  lodging: {
    providerKeywords: ["transfer", "transportation", "car hire", "pickup", "taxi", "shuttle"],
    expertSpecialties: [],
  },
  // Attractions, temples, museums → tours, experiences, tickets
  attraction: {
    providerKeywords: ["tour", "experience", "ticket", "entrance", "cultural", "sightseeing", "walking", "guide"],
    expertSpecialties: ["cultural", "history", "heritage", "art"],
  },
  temple: {
    providerKeywords: ["tour", "cultural", "heritage", "experience", "walking", "guide"],
    expertSpecialties: ["cultural", "history", "heritage"],
  },
  museum: {
    providerKeywords: ["tour", "cultural", "art", "museum", "experience", "guide"],
    expertSpecialties: ["cultural", "art", "history"],
  },
  // Restaurants / cafés → reservation services, food tours
  restaurant: {
    providerKeywords: ["reservation", "food", "culinary", "dining", "foodie", "tour", "gastronomy"],
    expertSpecialties: ["foodie", "culinary", "food", "dining"],
  },
  cafe: {
    providerKeywords: ["reservation", "food", "culinary", "coffee", "cafe", "dining"],
    expertSpecialties: ["foodie", "culinary", "food"],
  },
  food: {
    providerKeywords: ["food", "culinary", "dining", "reservation", "foodie", "gastronomy", "tour"],
    expertSpecialties: ["foodie", "culinary", "food"],
  },
  // Neighborhoods → local expertise
  neighborhood: {
    providerKeywords: ["local", "neighborhood", "walking", "tour", "guide", "hidden"],
    expertSpecialties: ["local"],
  },
  // Wellness → health, wellness, beauty services
  wellness: {
    providerKeywords: ["wellness", "spa", "yoga", "meditation", "health", "beauty", "styling", "retreat"],
    expertSpecialties: [],
  },
  // Nightlife → transport + bar tours
  nightlife: {
    providerKeywords: ["nightlife", "bar", "transport", "transfer", "tour", "club", "entertainment"],
    expertSpecialties: [],
  },
  // Trip-level content → eSIM, insurance, transfer, planning
  trip: {
    providerKeywords: ["esim", "insurance", "transfer", "sim", "planning", "concierge"],
    expertSpecialties: ["itinerary", "planning"],
  },
  // Generic activity / experience
  activity: {
    providerKeywords: ["tour", "experience", "adventure", "outdoor", "guide", "activity"],
    expertSpecialties: [],
  },
  // Shopping areas
  shopping: {
    providerKeywords: ["shopping", "market", "boutique", "bazaar", "guide"],
    expertSpecialties: [],
  },
  // Water / beach
  beach: {
    providerKeywords: ["beach", "diving", "snorkeling", "boat", "cruise", "water"],
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
  affiliateFallback: boolean;
}

export interface ContentMatchInput {
  type: string;        // gem/content type (e.g., "restaurant", "photo_spot")
  neighborhood?: string;
  city?: string;
  lat?: number;
  lng?: number;
  limit?: number;
}

// ─── Haversine distance helper ────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve matched providers and experts for a given content item.
 * Returns empty arrays on sparse markets — never throws.
 */
export async function resolveMatches(input: ContentMatchInput): Promise<ContentMatchResult> {
  const limit = Math.min(input.limit ?? 3, 10);
  const normalizedType = (input.type ?? "").toLowerCase().trim();
  const normalizedNeighborhood = (input.neighborhood ?? "").toLowerCase().trim();
  const normalizedCity = (input.city ?? "").toLowerCase().trim();

  const rule: AffinityRule = AFFINITY_RULES[normalizedType] ?? {
    providerKeywords: [],
    expertSpecialties: [],
  };

  // ── 1. Provider matching ───────────────────────────────────────────────────
  const matchedProviders = await resolveProviders(rule, normalizedNeighborhood, input.lat, input.lng, limit);

  // ── 2. Expert matching via lead-routing scoring ───────────────────────────
  const matchedExperts = await resolveExperts(rule, normalizedCity, normalizedNeighborhood, limit);

  // ── 3. Affiliate fallback flag ────────────────────────────────────────────
  const affiliateFallback = matchedProviders.length === 0;

  return {
    providers: matchedProviders,
    experts: matchedExperts,
    affiliateFallback,
  };
}

// ─── Provider resolver ────────────────────────────────────────────────────────

async function resolveProviders(
  rule: AffinityRule,
  neighborhood: string,
  lat: number | undefined,
  lng: number | undefined,
  limit: number,
): Promise<ProviderMatch[]> {
  try {
    // Fetch active services with their provider's display name
    const rows = await db
      .select({
        id: providerServices.id,
        userId: providerServices.userId,
        serviceName: providerServices.serviceName,
        shortDescription: providerServices.shortDescription,
        description: providerServices.description,
        serviceType: providerServices.serviceType,
        price: providerServices.price,
        priceType: providerServices.priceType,
        neighborhood: providerServices.neighborhood,
        location: providerServices.location,
        serviceRadius: providerServices.serviceRadius,
        isFeatured: providerServices.isFeatured,
        averageRating: providerServices.averageRating,
        bookingsCount: providerServices.bookingsCount,
        // Provider lat/lng stored on the user row
        providerFirstName: users.firstName,
        providerLastName: users.lastName,
        providerUsername: users.username,
      })
      .from(providerServices)
      .leftJoin(users, eq(providerServices.userId, users.id))
      .where(eq(providerServices.status, "active"));

    if (rows.length === 0) return [];

    const keywords = rule.providerKeywords;

    // Score each service
    const scored = rows
      .map((row) => {
        let score = 0;

        // ── Keyword affinity match (up to 40 pts) ──────────────────────────
        if (keywords.length > 0) {
          const haystack = [
            row.serviceName ?? "",
            row.shortDescription ?? "",
            row.description ?? "",
            row.serviceType ?? "",
          ]
            .join(" ")
            .toLowerCase();

          for (const kw of keywords) {
            if (haystack.includes(kw.toLowerCase())) {
              score += 10;
            }
          }
          score = Math.min(score, 40);
        } else {
          // No keyword filter — base score for any active service
          score = 10;
        }

        // ── Neighborhood match (30 pts) ────────────────────────────────────
        const svcNeighborhood = (row.neighborhood ?? "").toLowerCase().trim();
        if (neighborhood && svcNeighborhood) {
          if (svcNeighborhood === neighborhood) {
            score += 30;
          } else if (svcNeighborhood.includes(neighborhood) || neighborhood.includes(svcNeighborhood)) {
            score += 15;
          }
        }

        // ── Radius coverage fallback (15 pts) ─────────────────────────────
        // Only used when no neighborhood match and lat/lng are provided.
        // Provider location coordinates are not stored on providerServices;
        // we use serviceRadius as a proxy signal here.
        if (!svcNeighborhood && row.serviceRadius && lat !== undefined && lng !== undefined) {
          // Give credit proportional to radius — wider radius services are
          // considered a rough fallback for geo coverage.
          const radiusScore = Math.min(Math.floor(row.serviceRadius / 10), 15);
          score += radiusScore;
        }

        // ── Quality signals ────────────────────────────────────────────────
        // Rating (up to 15 pts)
        const rating = parseFloat(row.averageRating ?? "0");
        if (rating >= 4.5) score += 15;
        else if (rating >= 4.0) score += 10;
        else if (rating >= 3.5) score += 5;

        // Featured tiebreaker (+5)
        if (row.isFeatured) score += 5;

        // Popularity tiebreaker — bookings count (up to 5 pts)
        score += Math.min(Math.floor((row.bookingsCount ?? 0) / 5), 5);

        const providerName =
          [row.providerFirstName, row.providerLastName].filter(Boolean).join(" ").trim() ||
          row.providerUsername ||
          "Provider";

        return { row, score, providerName };
      })
      // Only keep services with at least one keyword hit (score > 10 baseline when no kw)
      .filter(({ score, row }) => {
        if (keywords.length === 0) return true;
        // Must have gotten keyword affinity points
        const affinityPoints = score - (row.isFeatured ? 5 : 0);
        return affinityPoints > 0;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(({ row, score, providerName }): ProviderMatch => ({
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
      relevanceScore: score,
      providerId: row.userId,
      providerName,
    }));
  } catch (err: any) {
    console.error("[ContentMatching] resolveProviders error:", err.message);
    return [];
  }
}

// ─── Expert resolver ──────────────────────────────────────────────────────────

async function resolveExperts(
  rule: AffinityRule,
  city: string,
  neighborhood: string,
  limit: number,
): Promise<ExpertMatch[]> {
  try {
    // Build destination context — prefer neighborhood for "local expert" affinity
    const destination = neighborhood || city || "";
    if (!destination) return [];

    // Use the first specialty keyword as the topic, or empty for any expert
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
