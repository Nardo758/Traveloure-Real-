/**
 * Concierge router service (CON-A.P5 / N2).
 *
 * Single call that takes an intent + context and returns priced options for all
 * three delivery tiers. Source of truth for "show price before commit" on the
 * Concierge surface (Phase 6).
 *
 *   AI    → FEE-A resolver (server/services/optimization-fee.service.ts)
 *   Expert → expert-availability service + median provider_services price (Phase 4)
 *   Full   → catalog stub this phase; Phase 8 wires event_packages through
 *
 * No constants — every price flows through an existing resolver.
 */
import { and, eq, ilike } from "drizzle-orm";
import { db } from "../db";
import { eventPackages } from "@shared/schema";
import { complexityTier } from "./smart-sequencing.service";
import { getFee, getOptimizerBranch } from "./optimization-fee.service";
import { getExpertAvailability } from "./expert-availability.service";
import { resolveCommissionRates } from "./commission";

export type ConciergeTier = "ai" | "expert" | "full";

export interface ConciergeRouteAi {
  priceCents: number;
  available: boolean;
  disabled: boolean;
  currency: string;
}

export interface ConciergeRouteExpert {
  priceCents?: number;
  available: boolean;
  etaHours?: number;
  /** Phase 3: Expert Concierge commission split from resolveCommissionRates. */
  commissionRate?: number; // platform take fraction (e.g. 0.25 = 25%)
  expertShareRate?: number; // expert keep fraction (e.g. 0.75 = 75%)
}

export interface ConciergeRouteFull {
  available: boolean;
  priceFromCents?: number;
  packageCount?: number;
  note: string;
}

export interface ConciergeRoute {
  ai: ConciergeRouteAi;
  expert: ConciergeRouteExpert;
  full: ConciergeRouteFull;
  recommended: ConciergeTier;
  /** Phase 3: 'suggest' for Trip/Experience (optional upsell), 'add' for Event (mandatory coordinator). */
  suggestVsAdd: "suggest" | "add";
  /** Phase 3: The branch derived from eventType — drives copy, fee shape, coordination default. */
  branch: string;
}

async function getFullPackageAvailability(input: {
  eventType: string | null;
  destination: string | null;
}): Promise<{ available: boolean; priceFromCents?: number; packageCount: number }> {
  if (!input.eventType) {
    return { available: false, packageCount: 0 };
  }
  const conditions = [
    eq(eventPackages.eventType, input.eventType),
    eq(eventPackages.status, "active"),
  ];
  if (input.destination) {
    conditions.push(ilike(eventPackages.market, `%${input.destination}%`));
  }
  const rows = await db
    .select({ priceFromCents: eventPackages.priceFromCents })
    .from(eventPackages)
    .where(and(...conditions))
    .limit(20);
  if (rows.length === 0) {
    return { available: false, packageCount: 0 };
  }
  const priced = rows.map(r => r.priceFromCents).filter((c): c is number => c !== null && c !== undefined && c > 0);
  const priceFromCents = priced.length > 0 ? Math.min(...priced) : undefined;
  return { available: true, priceFromCents, packageCount: rows.length };
}

export async function routeConcierge(input: {
  intent: string;
  destination?: string | null;
  eventType?: string | null;
  tripId?: string | null;
  cartId?: string | null;
}): Promise<ConciergeRoute> {
  const eventType = input.eventType?.trim() || null;
  const destination = input.destination?.trim() || null;
  const tier = complexityTier(eventType);
  const branch = getOptimizerBranch(eventType);

  // Phase 3: AI Concierge fee (optimizer + per-task) resolves through getFee.
  const aiFee = await getFee(eventType, tier);

  // Phase 3: Expert Concierge commission resolves through resolveCommissionRates.
  // Expert offerings are commission-split, not flat fees. The displayed "price"
  // is the median expert service price; the commission split is shown for transparency.
  const expertCommission = await resolveCommissionRates({
    source: "expert",
    category: "expert_concierge",
  });

  const availability = await getExpertAvailability({ city: destination, eventType });
  const fullPkg = await getFullPackageAvailability({ eventType, destination });

  // Phase 3: Recommendation logic.
  // Event branch → "full" if packages exist, else "expert" (coordinator mandatory).
  // Trip/Experience branch → "ai" if available, else "expert" as fallback.
  let recommended: ConciergeTier;
  if (branch === "event") {
    // Event: coordinator is mandatory. Full package preferred, else expert.
    if (fullPkg.available) {
      recommended = "full";
    } else {
      recommended = "expert";
    }
  } else if (fullPkg.available) {
    recommended = "full";
  } else if (aiFee.isDisabled) {
    recommended = availability.bookableNow ? "expert" : "ai";
  } else {
    recommended = "ai";
  }

  // Phase 3: Suggest vs Add.
  // Trip/Experience → "suggest" (expert is optional upsell).
  // Event → "add" (coordinator is mandatory, not optional).
  const suggestVsAdd = branch === "event" ? "add" : "suggest";

  return {
    ai: {
      priceCents: aiFee.isDisabled ? 0 : aiFee.priceCents,
      currency: aiFee.currency,
      available: !aiFee.isDisabled,
      disabled: aiFee.isDisabled,
    },
    expert: {
      priceCents: availability.estPriceCents,
      available: availability.bookableNow,
      etaHours: availability.etaHours,
      // Phase 3: Commission split from resolveCommissionRates.
      commissionRate: expertCommission.platformFeeRate,
      expertShareRate: expertCommission.expertShareRate,
    },
    full: {
      available: fullPkg.available,
      priceFromCents: fullPkg.priceFromCents,
      packageCount: fullPkg.packageCount || undefined,
      note: fullPkg.available
        ? `${fullPkg.packageCount} package${fullPkg.packageCount === 1 ? "" : "s"} match — quote on request.`
        : "No packages configured for this event type and market yet.",
    },
    recommended,
    suggestVsAdd,
    branch,
  };
}
