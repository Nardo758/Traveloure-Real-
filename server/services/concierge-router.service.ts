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
import { complexityTier } from "./smart-sequencing.service";
import { getFee } from "./optimization-fee.service";
import { getExpertAvailability } from "./expert-availability.service";

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
}

export interface ConciergeRouteFull {
  available: boolean;
  note: string;
}

export interface ConciergeRoute {
  ai: ConciergeRouteAi;
  expert: ConciergeRouteExpert;
  full: ConciergeRouteFull;
  recommended: ConciergeTier;
}

// Event types that map to Full / Done-for-You per §2.3.
// Phase 8 reads event_packages for the real catalog; until then, treat these as
// "available on request" so the surface can offer the quote-on-request CTA.
const FULL_DFY_EVENT_TYPES = new Set(["wedding", "proposal", "corporate"]);

export async function routeConcierge(input: {
  intent: string;
  destination?: string | null;
  eventType?: string | null;
  tripId?: string | null;
  cartId?: string | null;
}): Promise<ConciergeRoute> {
  const eventType = input.eventType?.trim() || null;
  const tier = complexityTier(eventType);

  const aiFee = await getFee(eventType, tier);
  const availability = await getExpertAvailability({
    city: input.destination ?? null,
    eventType,
  });

  const isFullEventType = !!eventType && FULL_DFY_EVENT_TYPES.has(eventType);

  let recommended: ConciergeTier;
  if (isFullEventType) {
    recommended = "full";
  } else if (aiFee.isDisabled) {
    recommended = availability.bookableNow ? "expert" : "ai";
  } else {
    recommended = "ai";
  }

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
    },
    full: {
      available: isFullEventType,
      note: isFullEventType
        ? "Quote on request — a human will follow up with pricing."
        : "Available only for wedding, proposal, and corporate events.",
    },
    recommended,
  };
}
