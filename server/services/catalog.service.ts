/**
 * Catalog Service — Task #601
 *
 * Returns all platform `service_offering_types` relevant to a city, each
 * annotated with a `coveredBy` field (real provider) or null (request-this).
 *
 * Called by:
 *   • GET  /api/catalog/services          — Services tab on experience-template
 *   • POST /api/upsell/discover-date      — Discover by Date sidebar
 *
 * Affiliate offering types (categoryKey starts with 'aff_') are excluded —
 * this catalog surfaces platform providers only.
 *
 * Seasonal filter logic:
 *   • Offerings with `seasonTag = null` are always included (non-seasonal).
 *   • Offerings with a non-null `seasonTag` are included ONLY when the caller
 *     passes a `dateStart`/`dateEnd` AND the tag's known month range overlaps
 *     the requested months (simple heuristic — see SEASON_MONTH_RANGES below).
 *   • Unknown season tags (not in the heuristic table) are always shown.
 */

import { db } from "../db";
import { eq, and, ilike } from "drizzle-orm";
import { serviceOfferingTypes, providerServices, users } from "@shared/schema";
import { expandDemandType } from "./demand-service-synonyms";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogCoverage {
  providerServiceId: string;
  providerName: string;
  price: string | null;
  href: string;
}

export interface CatalogEntry {
  offeringTypeKey: string;
  displayName: string;
  tagline: string | null;
  categoryKey: string;
  isSurprising: boolean;
  seasonTag: string | null;
  coveredBy: CatalogCoverage | null;
}

// ─── Season heuristic ─────────────────────────────────────────────────────────
//
// Maps season_tag → months (1-12) where the season is active.
// Unknown tags default to "always show" so future tags don't silently break.

const SEASON_MONTH_RANGES: Record<string, readonly number[]> = {
  cherry_blossom: [3, 4],
  autumn_foliage:  [10, 11],
  fringe_festival: [8],
  summer_festival: [6, 7, 8],
  winter_festival: [11, 12, 1],
  rainy_season:    [6, 7],
  monsoon:         [6, 7, 8, 9],
  sakura:          [3, 4],
};

function monthsInDateRange(dateStart: string, dateEnd: string): number[] {
  const start = new Date(dateStart);
  const end   = new Date(dateEnd);
  const months = new Set<number>();
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.add(cur.getMonth() + 1);
    cur.setMonth(cur.getMonth() + 1);
  }
  return Array.from(months);
}

function seasonTagMatchesMonths(tag: string, requestedMonths: number[]): boolean {
  const range = SEASON_MONTH_RANGES[tag];
  if (!range) return true; // unknown tag → always include
  return requestedMonths.some(m => range.includes(m));
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function queryCatalogServices(opts: {
  city: string;
  country?: string;
  categoryKey?: string;
  dateStart?: string;
  dateEnd?: string;
}): Promise<CatalogEntry[]> {
  const citySlug = opts.city.toLowerCase().trim();

  // 1. Load all active platform offering types (exclude affiliate aff_*)
  const allOfferings = await db
    .select()
    .from(serviceOfferingTypes)
    .where(eq(serviceOfferingTypes.isActive, true))
    .orderBy(serviceOfferingTypes.sortOrder);

  const platformOfferings = allOfferings.filter(
    o => !o.categoryKey.startsWith("aff_")
  );

  // 2. Market scope: null = universal; array = city slug must be in the list
  const scopedOfferings = platformOfferings.filter(o => {
    if (!o.marketScoped || o.marketScoped.length === 0) return true;
    return o.marketScoped.some(m => m.toLowerCase() === citySlug);
  });

  // 3. Category filter
  const categoryFiltered = opts.categoryKey && opts.categoryKey !== "all"
    ? scopedOfferings.filter(o => o.categoryKey === opts.categoryKey)
    : scopedOfferings;

  // 4. Seasonal filter
  let seasonFiltered: typeof categoryFiltered;
  if (opts.dateStart && opts.dateEnd) {
    const requestedMonths = monthsInDateRange(opts.dateStart, opts.dateEnd);
    seasonFiltered = categoryFiltered.filter(o => {
      const tag = (o as any).seasonTag as string | null;
      if (!tag) return true; // non-seasonal: always show
      return seasonTagMatchesMonths(tag, requestedMonths);
    });
  } else {
    // No date: exclude seasonal offerings (they need a date context)
    seasonFiltered = categoryFiltered.filter(o => !(o as any).seasonTag);
  }

  if (seasonFiltered.length === 0) return [];

  // 5. Bulk load active provider services for the city (one query)
  const cityServices = await db
    .select({
      id:               providerServices.id,
      serviceType:      providerServices.serviceType,
      price:            providerServices.price,
      isFeatured:       providerServices.isFeatured,
      averageRating:    providerServices.averageRating,
      reviewCount:      providerServices.reviewCount,
      providerFirstName: users.firstName,
      providerLastName:  users.lastName,
    })
    .from(providerServices)
    .leftJoin(users, eq(providerServices.userId, users.id))
    .where(
      and(
        eq(providerServices.status, "active"),
        ilike(providerServices.location, `%${opts.city}%`)
      )
    )
    .limit(300);

  // 6. For each offering, find the best-matching provider service
  const entries: CatalogEntry[] = seasonFiltered.map(offering => {
    // expandDemandType includes the original key + synonyms
    const expansionTerms = expandDemandType(offering.offeringTypeKey);

    // Pick the highest-rated match
    const matches = cityServices.filter(svc => {
      if (!svc.serviceType) return false;
      const svcType = svc.serviceType.toLowerCase();
      return expansionTerms.some(t => svcType === t || svcType.includes(t) || t.includes(svcType));
    });

    // Sort by rating then review count (featured-adjacent heuristic)
    const best = matches.sort((a, b) => {
      const rA = parseFloat(a.averageRating ?? "0");
      const rB = parseFloat(b.averageRating ?? "0");
      if (rB !== rA) return rB - rA;
      return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
    })[0];

    let coveredBy: CatalogCoverage | null = null;
    if (best) {
      const providerName = [best.providerFirstName, best.providerLastName]
        .filter(Boolean)
        .join(" ") || "Provider";
      coveredBy = {
        providerServiceId: best.id,
        providerName,
        price: best.price,
        href: `/services/${best.id}`,
      };
    }

    return {
      offeringTypeKey: offering.offeringTypeKey,
      displayName:     offering.displayName,
      tagline:         offering.tagline,
      categoryKey:     offering.categoryKey,
      isSurprising:    offering.isSurprising,
      seasonTag:       (offering as any).seasonTag ?? null,
      coveredBy,
    };
  });

  return entries;
}
