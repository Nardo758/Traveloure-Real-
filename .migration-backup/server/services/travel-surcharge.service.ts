/**
 * TRAVEL SURCHARGE resolver — DECISIONS.md ruling 81 (lane B1), CLAUDE.md §13/§14/§15.
 *
 * ONE pure, server-side function that turns a listing's provider-chosen surcharge mode + config and
 * the traveler's CONFIRMED pickup location into a charge. It is the ONLY place a surcharge amount is
 * computed — the checkout charge loop, the checkout quote loop, GET /api/cart and
 * GET /api/cart/fee-preview all call THIS, so the amount quoted and the amount charged can never
 * disagree (the "one resolver" discipline the rate lanes use).
 *
 * THE HONEST RAILS (ruling 81 — non-negotiable, enforced here):
 *  1. TRIGGERED ONLY by a real pickup the traveler provided. No pickup coords ⇒ amount 0 (§13). A
 *     surcharge is NEVER produced from an invented/defaulted/city-centre location.
 *  2. SERVER-DERIVED (§14). The amount comes from the listing config × the pickup — there is no
 *     `amount` parameter to this function; a client cannot hand it a price. The pickup COORDS are the
 *     traveler's own booking input (like a scheduled date), never a money field.
 *  3. §13 CONTAINMENT, NOT DISTANCE, for flat/zones. `flat` and `zones` decide by WHICH RING CONTAINS
 *     the pickup; the straight-line distance is used only to test containment and (for per_km) to
 *     multiply — `basis` records the honest reason, and the caller never renders a computed distance
 *     for flat/zones. `per_km` is STRAIGHT-LINE, labeled "as-the-crow-flies", NEVER driving.
 *  4. ELIGIBILITY. A confirmed pickup beyond the outer bound (`surchargeMaxKm`, or — for zones — the
 *     largest ring) makes the booking INELIGIBLE: `eligible=false`, which the checkout refuses BEFORE
 *     any charge. `eligible` is only ever false when there IS a real pickup that is out of range.
 *
 * NO fee_bands (§8) — the provider sets the amounts/rings/rate; this is listing config that CHANGES
 * the charge, not a platform fee/commission. The surcharge is folded into the line's total_amount at
 * checkout so the §15 claim/re-drive and §17 reconciliation (SUM(total_amount+platform_fee)) stay
 * correct with no change to those systems.
 */

import type { SurchargeMode } from "../../shared/schema";

/** The traveler's confirmed pickup (cart_items.pickup_location). Coords required to compute. */
export interface TravelerPickup {
  address?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
}

/** A zones-mode ring (service_surcharge_tiers row), radius in km + fee in dollars. */
export interface SurchargeTierInput {
  radiusKm: number | string;
  fee: number | string;
}

/** The listing surcharge config the resolver reads (a subset of the provider_services row). */
export interface SurchargeServiceConfig {
  surchargeMode?: string | null;
  surchargeFlatAmount?: number | string | null;
  surchargePerKm?: number | string | null;
  surchargeMaxKm?: number | string | null;
  serviceRadius?: number | string | null; // the coverage radius (km) — the flat mode's free zone
  latitude?: number | string | null;       // the confirmed pin (decimal columns, stored as strings)
  longitude?: number | string | null;
}

export interface TravelSurchargeResult {
  /** Dollars to add to the line (rounded to cents). 0 when no surcharge applies. */
  amount: number;
  /** The mode actually applied. */
  mode: SurchargeMode;
  /** false ⇒ the pickup is beyond the outer bound; the booking must be REFUSED before charging. */
  eligible: boolean;
  /** Machine/human reason for the outcome — §13 honesty; never a fabricated distance for flat/zones. */
  basis: string;
  /** Whether a real pickup coordinate was present (the §13 trigger). */
  hasPickup: boolean;
  /**
   * Straight-line km from the pin to the pickup, when computable. STRAIGHT-LINE ONLY — the caller may
   * surface this for per_km (labeled "as-the-crow-flies"), and MUST NOT surface it as a distance for
   * flat/zones (those disclose containment, not distance). Never a driving time/distance.
   */
  straightLineKm: number | null;
}

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const roundCents = (n: number): number => Math.round(n * 100) / 100;

/** Great-circle (haversine) distance in km — STRAIGHT-LINE, never routed. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const NONE: TravelSurchargeResult = {
  amount: 0,
  mode: "none",
  eligible: true,
  basis: "mode_none",
  hasPickup: false,
  straightLineKm: null,
};

/**
 * Resolve the travel surcharge for one line. Pure and deterministic.
 *
 * @param service  the listing's surcharge config (from the provider_services row)
 * @param pickup   the traveler's confirmed pickup (cart_items.pickup_location) — may be null
 * @param tiers    the zones-mode rings (service_surcharge_tiers), any order; ignored for other modes
 */
export function resolveTravelSurcharge(
  service: SurchargeServiceConfig,
  pickup: TravelerPickup | null | undefined,
  tiers: SurchargeTierInput[] = [],
): TravelSurchargeResult {
  const rawMode = (service?.surchargeMode ?? "none") as string;
  const mode: SurchargeMode =
    rawMode === "flat" || rawMode === "zones" || rawMode === "per_km" ? rawMode : "none";
  if (mode === "none") return { ...NONE };

  // Rail 1 (§13): a surcharge is triggered ONLY by a real pickup the traveler provided.
  const pLat = toNum(pickup?.lat);
  const pLng = toNum(pickup?.lng);
  if (pLat === null || pLng === null) {
    return { amount: 0, mode, eligible: true, basis: "no_pickup", hasPickup: false, straightLineKm: null };
  }
  if (pLat < -90 || pLat > 90 || pLng < -180 || pLng > 180) {
    // A malformed pickup is not a real location — never guess a charge onto it (§13).
    return { amount: 0, mode, eligible: true, basis: "no_pickup", hasPickup: false, straightLineKm: null };
  }

  // Every mode measures from the CONFIRMED pin. No pin ⇒ no honest centre ⇒ no surcharge (§13 — never
  // a city-centre fallback).
  const sLat = toNum(service?.latitude);
  const sLng = toNum(service?.longitude);
  if (sLat === null || sLng === null) {
    return { amount: 0, mode, eligible: true, basis: "no_pin", hasPickup: true, straightLineKm: null };
  }

  const km = haversineKm({ lat: sLat, lng: sLng }, { lat: pLat, lng: pLng });
  const maxKm = toNum(service?.surchargeMaxKm);

  // Rail 4: an explicit outer bound refuses the booking before any charge.
  if (maxKm !== null && km > maxKm) {
    return { amount: 0, mode, eligible: false, basis: "beyond_max_km", hasPickup: true, straightLineKm: km };
  }

  if (mode === "flat") {
    // Binary in/out of the coverage radius — honest CONTAINMENT, no distance disclosed (§13).
    const radius = toNum(service?.serviceRadius) ?? 0;
    const fee = toNum(service?.surchargeFlatAmount) ?? 0;
    if (km <= radius) {
      return { amount: 0, mode, eligible: true, basis: "inside_radius", hasPickup: true, straightLineKm: km };
    }
    return {
      amount: roundCents(Math.max(0, fee)),
      mode,
      eligible: true,
      basis: "outside_radius",
      hasPickup: true,
      straightLineKm: km,
    };
  }

  if (mode === "zones") {
    // Ordered rings; the pickup maps to the SMALLEST ring that CONTAINS it (§13 containment, no
    // distance disclosed). A pickup beyond the largest ring is out of the provider's drawn coverage
    // and refuses the booking (like the explicit outer bound above).
    const rings = tiers
      .map((t) => ({ radiusKm: toNum(t.radiusKm) ?? 0, fee: toNum(t.fee) ?? 0 }))
      .filter((t) => t.radiusKm > 0)
      .sort((a, b) => a.radiusKm - b.radiusKm);
    if (rings.length === 0) {
      // Mode is zones but no rings are drawn — nothing to contain the pickup honestly ⇒ 0 (§13).
      return { amount: 0, mode, eligible: true, basis: "no_zones", hasPickup: true, straightLineKm: km };
    }
    for (let i = 0; i < rings.length; i++) {
      if (km <= rings[i].radiusKm) {
        return {
          amount: roundCents(Math.max(0, rings[i].fee)),
          mode,
          eligible: true,
          basis: `zone_tier:${i + 1}`,
          hasPickup: true,
          straightLineKm: km,
        };
      }
    }
    // Beyond every ring — outside the drawn coverage.
    return { amount: 0, mode, eligible: false, basis: "beyond_zones", hasPickup: true, straightLineKm: km };
  }

  // per_km — STRAIGHT-LINE km × the provider's rate. Labeled as-the-crow-flies by the caller; NEVER a
  // driving distance/time (§13).
  const rate = toNum(service?.surchargePerKm) ?? 0;
  return {
    amount: roundCents(Math.max(0, rate) * km),
    mode,
    eligible: true,
    basis: "per_km",
    hasPickup: true,
    straightLineKm: km,
  };
}
