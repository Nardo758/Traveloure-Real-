// Item 2 Phase 2 (ledger 2026-08-23-item2-affiliate): affiliate products for the slip-grounding
// resolver's rung 02 (catalog → AFFILIATE → DMO).
//
// The DETERMINISTIC registry path (Lane 2a): active affiliate_products for the market, matched by
// the same fail-closed name/geo posture as the catalog and DMO rungs. The best-effort LIVE-FEED
// reconcile (fetch → materialize into affiliate_products → link) is Lane 2b; this file is its
// registry half and the sole loader the resolver calls today.

import { db } from "../db";
import { affiliateProducts } from "@shared/schema";
import { and, eq, isNotNull } from "drizzle-orm";

/** The subset of an affiliate_products row the resolver + plancard DTO need. `affiliateUrl` stays
 *  SERVER-SIDE — it is read only when minting a vault token, never emitted to a client (§16). */
export interface GroundableAffiliateProduct {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  bookingType: string | null;
  partnerName: string | null;
  price: string | null;
  affiliateUrl: string | null;
}

/**
 * Active affiliate products for a MARKET (city), for the slip-grounding resolver. City scope lives
 * on the row (`affiliate_products.city`, plus a `location` ILIKE fallback for rows that only filled
 * the free-text location). Only ACTIVE rows contribute — the same honesty gate the catalog rung uses
 * (`is_active`). Returns raw rows the resolver matches by name/geo; empty when the market has no
 * active affiliate inventory (§13 — the rung then simply falls through to DMO). Coordinates come from
 * the row's `coordinates` jsonb, flattened to lat/lng strings so the resolver's coord-copy is
 * uniform across all three rungs.
 */
export async function getAffiliateProductsForMarket(
  destination: string | null | undefined,
): Promise<GroundableAffiliateProduct[]> {
  const city = destination?.split(",")[0]?.trim() ?? "";
  if (!city) return [];
  const rows = await db
    .select({
      id: affiliateProducts.id,
      name: affiliateProducts.name,
      city: affiliateProducts.city,
      location: affiliateProducts.location,
      coordinates: affiliateProducts.coordinates,
      bookingType: affiliateProducts.bookingType,
      partnerName: affiliateProducts.name, // display fallback; real partner label resolved below
      price: affiliateProducts.price,
      affiliateUrl: affiliateProducts.affiliateUrl,
      isActive: affiliateProducts.isActive,
    })
    .from(affiliateProducts)
    .where(and(eq(affiliateProducts.isActive, true), isNotNull(affiliateProducts.name)))
    .limit(1000);

  const needle = city.toLowerCase();
  const dest = (destination ?? "").toLowerCase();
  return rows
    .filter((r) => {
      const c = (r.city ?? "").toLowerCase();
      const loc = (r.location ?? "").toLowerCase();
      return c.includes(needle) || loc.includes(needle) || (dest && (c.includes(dest) || loc.includes(dest)));
    })
    .map((r) => {
      const coord = r.coordinates as { lat?: number; lng?: number } | null;
      return {
        id: r.id,
        name: r.name,
        latitude: coord?.lat != null ? String(coord.lat) : null,
        longitude: coord?.lng != null ? String(coord.lng) : null,
        bookingType: r.bookingType ?? null,
        partnerName: r.partnerName ?? null,
        price: r.price ?? null,
        affiliateUrl: r.affiliateUrl ?? null,
      };
    });
}

/** One affiliate product by id — the plancard DTO reads this to mint a vault token for a grounded
 *  item at assembly time. `affiliateUrl` is used ONLY to mint the token, never returned to a client. */
export async function getAffiliateProductById(id: string): Promise<GroundableAffiliateProduct | null> {
  const [r] = await db
    .select({
      id: affiliateProducts.id,
      name: affiliateProducts.name,
      coordinates: affiliateProducts.coordinates,
      bookingType: affiliateProducts.bookingType,
      price: affiliateProducts.price,
      affiliateUrl: affiliateProducts.affiliateUrl,
    })
    .from(affiliateProducts)
    .where(eq(affiliateProducts.id, id))
    .limit(1);
  if (!r) return null;
  const coord = r.coordinates as { lat?: number; lng?: number } | null;
  return {
    id: r.id,
    name: r.name,
    latitude: coord?.lat != null ? String(coord.lat) : null,
    longitude: coord?.lng != null ? String(coord.lng) : null,
    bookingType: r.bookingType ?? null,
    partnerName: r.name ?? null,
    price: r.price ?? null,
    affiliateUrl: r.affiliateUrl ?? null,
  };
}

/** Batch load affiliate products by id → map, for the plancard assembly's one-query prefetch. */
export async function getAffiliateProductsByIds(ids: string[]): Promise<Map<string, GroundableAffiliateProduct>> {
  const out = new Map<string, GroundableAffiliateProduct>();
  if (ids.length === 0) return out;
  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .select({
      id: affiliateProducts.id,
      name: affiliateProducts.name,
      coordinates: affiliateProducts.coordinates,
      bookingType: affiliateProducts.bookingType,
      price: affiliateProducts.price,
      affiliateUrl: affiliateProducts.affiliateUrl,
    })
    .from(affiliateProducts)
    .where(inArray(affiliateProducts.id, ids));
  for (const r of rows) {
    const coord = r.coordinates as { lat?: number; lng?: number } | null;
    out.set(r.id, {
      id: r.id,
      name: r.name,
      latitude: coord?.lat != null ? String(coord.lat) : null,
      longitude: coord?.lng != null ? String(coord.lng) : null,
      bookingType: r.bookingType ?? null,
      partnerName: r.name ?? null,
      price: r.price ?? null,
      affiliateUrl: r.affiliateUrl ?? null,
    });
  }
  return out;
}
