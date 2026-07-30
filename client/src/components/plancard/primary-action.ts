/**
 * Mode-aware primary action for the "Up Next" hero (CLAUDE.md §18, item 5 — exact rule):
 *
 * Inspect the transport leg INBOUND to the next activity IF leg data is present in what
 * the client already receives.
 *  - Self-directed mode (walk/metro/transit/bus/bicycle/rental_car) → Navigate via the
 *    existing openInMaps helper with that mode.
 *  - Booked chauffeured leg (taxi/rideshare/private_driver WITH real booking data) →
 *    pickup card (pickup point, time, ride details, call driver) — real fields only.
 *  - Chauffeured but unbooked → destination address + a "Book this ride" CTA through the
 *    EXISTING booking-agent rail (§16 — never a raw window.open to a partner).
 *  - No leg data → destination-only Navigate (today's behavior).
 *
 * KNOWN GAP (see plancard-mobile-lens-jul30.md §2): the plancard payload does not carry
 * pickup/booking fields on a transport leg today, so the "pickup" and "book_ride" branches
 * are presence-guarded and will not fire against real trips until a server-side mapping
 * exists. This file does not add that mapping (out of scope — server lane) — it only reads
 * the fields if/when they show up, per the brief's presence-guard instruction.
 */
import type { PlanCardActivity, PlanCardLegData } from "./plancard-types";
import { canonicalMode, hasValidCoords } from "./plancard-temporal";
import type { TraveloureMode } from "@/lib/navigate";

// Self-directed (walk/metro/transit/bus/bicycle/rental_car, per canonicalMode's alias map)
// is the DEFAULT arm below — anything not explicitly chauffeured resolves to Navigate.
const CHAUFFEURED_MODES = new Set<TraveloureMode>(["taxi", "rideshare", "private_driver", "private_car"]);

export type PrimaryAction =
  | { kind: "none" }
  | { kind: "navigate"; mode: TraveloureMode; activity: PlanCardActivity }
  | {
      kind: "pickup";
      pickupPoint: string | null;
      pickupTime: string | null;
      driverPhone: string | null;
      rideDetails: string | null;
    }
  | { kind: "book_ride"; leg: PlanCardLegData; activity: PlanCardActivity };

function canNavigateActivity(activity: PlanCardActivity): boolean {
  return hasValidCoords(activity.lat, activity.lng) || !!activity.mapsUrl;
}

export function resolvePrimaryAction(
  activity: PlanCardActivity | null | undefined,
  leg: PlanCardLegData | null | undefined,
): PrimaryAction {
  if (!activity) return { kind: "none" };

  // No leg data → destination-only Navigate (today's behavior, unchanged).
  if (!leg) {
    return canNavigateActivity(activity) ? { kind: "navigate", mode: "walk", activity } : { kind: "none" };
  }

  const mode = canonicalMode(leg.userSelectedMode || leg.recommendedMode || leg.mode || "walk");

  if (CHAUFFEURED_MODES.has(mode)) {
    const hasRealBooking = !!(leg.pickupPoint || leg.pickupTime);
    if (hasRealBooking) {
      return {
        kind: "pickup",
        pickupPoint: leg.pickupPoint ?? null,
        pickupTime: leg.pickupTime ?? null,
        driverPhone: leg.driverPhone ?? null,
        rideDetails: leg.rideDetails ?? null,
      };
    }
    if (leg.bookingAffiliateUrl) {
      return { kind: "book_ride", leg, activity };
    }
    // Chauffeured leg with no real booking AND no bookable affiliate data (today's reality
    // for every trip — see KNOWN GAP above): honest fallback so the CTA is never dead —
    // let the traveler navigate themselves to the meeting point in the meantime.
    return canNavigateActivity(activity) ? { kind: "navigate", mode, activity } : { kind: "none" };
  }

  // Self-directed (walk/metro/transit/bus/bicycle/rental_car) or an unrecognized mode —
  // default to Navigate, same safe fallback as "no leg data".
  return canNavigateActivity(activity) ? { kind: "navigate", mode, activity } : { kind: "none" };
}
