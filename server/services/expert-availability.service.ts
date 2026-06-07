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
 *   4. Cross-check expert_city_queues — if the cohort is saturated (activeRequests
 *      meets/exceeds the cohort size), mark queued rather than bookable-now.
 *
 * eventType is accepted but not yet used as a filter (provider_services has no direct
 * event-type tag — Phase 5 can layer in category/affinity-tag heuristics if needed).
 */
import { and, eq, ilike, inArray } from "drizzle-orm";
import { db } from "../db";
import { providerServices, users, expertCityQueues } from "@shared/schema";

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

  // Queue depth check — saturated cohort = queued, otherwise bookable-now.
  const [queueRow] = await db
    .select({ activeRequests: expertCityQueues.activeRequests, expertIds: expertCityQueues.expertIds })
    .from(expertCityQueues)
    .where(ilike(expertCityQueues.city, city))
    .limit(1);

  let bookableNow = true;
  if (queueRow) {
    const activeRequests = queueRow.activeRequests ?? 0;
    const expertIdsArr = Array.isArray(queueRow.expertIds) ? queueRow.expertIds : [];
    if (expertIdsArr.length > 0 && activeRequests >= expertIdsArr.length) {
      bookableNow = false;
    }
  }

  return bookableNow
    ? { bookableNow: true, estPriceCents, etaHours: 0 }
    : { bookableNow: false, estPriceCents, etaHours: minLeadHours };
}
