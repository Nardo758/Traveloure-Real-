/**
 * Expert availability service (CON-A.P4 / N4).
 *
 * Read-only lookup that powers the Concierge's "book expert now vs queue request"
 * branch (D4). Reads existing supply tables — no new storage.
 *
 * Resolution:
 *   1. Find active+approved provider_services in the city owned by expert-class users.
 *   2. If none: bookableNow=false, no estimates.
 *   3. Otherwise: estPriceCents = median service price; min leadTimeHours = ETA baseline.
 *   4. Saturation check via expert_requests count per city — scoring formula
 *      max(0, 20 - queueDepth×4); isSaturated when score===0.
 *
 * eventType is accepted but not yet used as a filter (provider_services has no direct
 * event-type tag — Phase 5 can layer in category/affinity-tag heuristics if needed).
 */
import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { db } from "../db";
import { providerServices, users, expertRequests } from "@shared/schema";

const EXPERT_ROLES = ["travel_expert", "local_expert", "event_planner", "expert"] as const;

export interface ExpertAvailabilityResult {
  bookableNow: boolean;
  estPriceCents?: number;
  etaHours?: number;
}

export async function getExpertAvailability(input: {
  city?: string | null;
  eventType?: string | null;
}): Promise<ExpertAvailabilityResult> {
  const city = input.city?.trim() || null;
  if (!city) {
    return { bookableNow: false };
  }

  const matches = await db
    .select({
      userId: providerServices.userId,
      price: providerServices.price,
      leadTimeHours: providerServices.leadTimeHours,
    })
    .from(providerServices)
    .innerJoin(users, eq(providerServices.userId, users.id))
    .where(and(
      ilike(providerServices.location, `%${city}%`),
      inArray(users.role, EXPERT_ROLES as unknown as string[]),
      eq(providerServices.status, "active"),
      eq(providerServices.approvalStatus, "approved"),
    ))
    .limit(50);

  if (matches.length === 0) {
    return { bookableNow: false };
  }

  const prices = matches
    .map(m => parseFloat(m.price ?? "0"))
    .filter(p => p > 0)
    .sort((a, b) => a - b);
  const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : undefined;
  const estPriceCents = medianPrice !== undefined ? Math.round(medianPrice * 100) : undefined;

  const leadTimes = matches
    .map(m => m.leadTimeHours ?? 24)
    .filter(l => l > 0);
  const minLeadHours = leadTimes.length > 0 ? Math.min(...leadTimes) : 24;

  // Queue depth check — use expert_requests (current source of truth) instead of
  // the deprecated expert_city_queues table.
  // Saturation formula: availabilityScore = max(0, 20 - queueDepth×4); isSaturated = score===0
  const activeRequestCount = await db
    .select({ count: count() })
    .from(expertRequests)
    .where(
      and(
        ilike(expertRequests.destinationCity, `%${city}%`),
        inArray(expertRequests.status, ["pending", "queued", "assigned", "in_progress"]),
      )
    );

  const queueDepth = Number(activeRequestCount[0]?.count ?? 0);
  const availabilityScore = Math.max(0, 20 - queueDepth * 4);
  const isSaturated = availabilityScore === 0;

  const bookableNow = !isSaturated;

  return bookableNow
    ? { bookableNow: true, estPriceCents, etaHours: 0 }
    : { bookableNow: false, estPriceCents, etaHours: minLeadHours };
}
