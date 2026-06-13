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
 * Coverage strategy (two-phase, in priority order):
 *
 *   Phase 1 — Neighborhood-coverage model (strict):
 *     JOIN provider_neighborhood_coverage → city_neighborhoods (city match)
 *     + provider_services WHERE status='active' AND approval_status='approved'
 *     This is the correct model per the brief: providers are confirmed to cover
 *     the target city when they have a neighborhood_coverage row for it.
 *
 *   Phase 2 — Location ILIKE fallback (dev/empty-DB safety):
 *     If Phase 1 yields zero results (no neighborhood data seeded), falls back
 *     to provider_services.location ILIKE %city% with same active+approved gate.
 *     Ensures the browse surface works in dev without requiring seed data.
 *
 * Seasonal filter logic:
 *   • Offerings with `seasonTag = null` are always included (non-seasonal).
 *   • Offerings with a non-null `seasonTag` are included ONLY when the caller
 *     passes a `dateStart`/`dateEnd` AND the tag's known month range overlaps
 *     the requested months (simple heuristic — see SEASON_MONTH_RANGES).
 *   • Unknown season tags (not in the heuristic table) are always shown.
 *
 * Distance filter:
 *   • When `distanceKm` is provided (and not 0), only providers with
 *     serviceRadius IS NULL or serviceRadius <= distanceKm are considered.
 *     serviceRadius = null means "no radius constraint set" → always eligible.
 */

import { db } from "../db";
import { eq, and, ilike, lte, or, isNull } from "drizzle-orm";
import {
  serviceOfferingTypes,
  providerServices,
  providerNeighborhoodCoverage,
  cityNeighborhoods,
  serviceCategories,
  users,
} from "@shared/schema";
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
  if (!range) return true;
  return requestedMonths.some(m => range.includes(m));
}

// ─── Provider row shape used internally ───────────────────────────────────────

interface ProviderRow {
  id: string;
  serviceType: string | null;
  categoryId: string | null;
  price: string | null;
  averageRating: string | null;
  reviewCount: number | null;
  serviceRadius: number | null;
  providerFirstName: string | null;
  providerLastName: string | null;
  /** category key the provider has neighborhood coverage for */
  coveredCategoryKey?: string;
}

// ─── Phase 1: Neighborhood-coverage-scoped query ──────────────────────────────

async function fetchCoveredProviders(city: string, distanceKm?: number): Promise<ProviderRow[]> {
  const baseConditions = and(
    eq(providerServices.status, "active"),
    eq(providerServices.approvalStatus, "approved"),
    ...(distanceKm
      ? [or(isNull(providerServices.serviceRadius), lte(providerServices.serviceRadius, distanceKm))]
      : [])
  );

  // Join serviceCategories to get the stable categoryKey for this provider service,
  // then constrain providerNeighborhoodCoverage to only match rows where that
  // same categoryKey is covered. This prevents the cross-product where a provider
  // with photography coverage is treated as covered for an unrelated cooking service.
  const rows = await db
    .selectDistinct({
      id:                providerServices.id,
      serviceType:       providerServices.serviceType,
      categoryId:        providerServices.categoryId,
      price:             providerServices.price,
      averageRating:     providerServices.averageRating,
      reviewCount:       providerServices.reviewCount,
      serviceRadius:     providerServices.serviceRadius,
      providerFirstName: users.firstName,
      providerLastName:  users.lastName,
      coveredCategoryKey: providerNeighborhoodCoverage.categoryKey,
    })
    .from(providerServices)
    .innerJoin(users, eq(providerServices.userId, users.id))
    // Category-safe join: resolve the provider service's own category key first
    .innerJoin(serviceCategories, eq(serviceCategories.id, providerServices.categoryId))
    // Coverage join constrained to the same category key — prevents cross-product
    .innerJoin(
      providerNeighborhoodCoverage,
      and(
        eq(providerNeighborhoodCoverage.providerId, providerServices.userId),
        eq(providerNeighborhoodCoverage.categoryKey, serviceCategories.categoryKey)
      )
    )
    .innerJoin(
      cityNeighborhoods,
      and(
        eq(cityNeighborhoods.id, providerNeighborhoodCoverage.neighborhoodId),
        ilike(cityNeighborhoods.city, city)
      )
    )
    .where(baseConditions)
    .limit(300);

  return rows as ProviderRow[];
}

// ─── Phase 2: ILIKE fallback (dev / no neighborhood data) ────────────────────

async function fetchLocationFallbackProviders(city: string, distanceKm?: number): Promise<ProviderRow[]> {
  const conditions = and(
    eq(providerServices.status, "active"),
    eq(providerServices.approvalStatus, "approved"),
    ilike(providerServices.location, `%${city}%`),
    ...(distanceKm
      ? [or(isNull(providerServices.serviceRadius), lte(providerServices.serviceRadius, distanceKm))]
      : [])
  );

  const rows = await db
    .select({
      id:                providerServices.id,
      serviceType:       providerServices.serviceType,
      categoryId:        providerServices.categoryId,
      price:             providerServices.price,
      averageRating:     providerServices.averageRating,
      reviewCount:       providerServices.reviewCount,
      serviceRadius:     providerServices.serviceRadius,
      providerFirstName: users.firstName,
      providerLastName:  users.lastName,
    })
    .from(providerServices)
    .leftJoin(users, eq(providerServices.userId, users.id))
    .where(conditions)
    .limit(300);

  return rows as ProviderRow[];
}

// ─── Match a single offering type to the best provider ───────────────────────
//
// Only serviceType synonym expansion is used — no category-level fallback.
// A category fallback would cause a cross-product: a provider who has
// neighborhood coverage for "photography" but also has an unrelated cooking
// service would incorrectly match cooking offering types. Returning null
// (request-this) is always safer than linking to a wrong service.

function findBestMatch(
  offering: { offeringTypeKey: string },
  providers: ProviderRow[]
): ProviderRow | null {
  const expansionTerms = expandDemandType(offering.offeringTypeKey);

  const matches = providers.filter(p => {
    if (!p.serviceType) return false;
    const svcType = p.serviceType.toLowerCase();
    return expansionTerms.some(t => svcType === t || svcType.includes(t) || t.includes(svcType));
  });

  // Sort by rating then review count
  return matches.sort((a, b) => {
    const rA = parseFloat(a.averageRating ?? "0");
    const rB = parseFloat(b.averageRating ?? "0");
    if (rB !== rA) return rB - rA;
    return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
  })[0] ?? null;
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function queryCatalogServices(opts: {
  city: string;
  country?: string;
  /** template context — accepted for contract alignment; reserved for future scoping */
  templateKey?: string;
  categoryKey?: string;
  dateStart?: string;
  dateEnd?: string;
  distanceKm?: number;
}): Promise<CatalogEntry[]> {
  const city = opts.city.trim();
  const citySlug = city.toLowerCase();

  // 1. Load all active platform offering types (exclude affiliate aff_*)
  const allOfferings = await db
    .select()
    .from(serviceOfferingTypes)
    .where(eq(serviceOfferingTypes.isActive, true))
    .orderBy(serviceOfferingTypes.sortOrder);

  const platformOfferings = allOfferings.filter(o => !o.categoryKey.startsWith("aff_"));

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
      const tag = o.seasonTag ?? null;
      if (!tag) return true;
      return seasonTagMatchesMonths(tag, requestedMonths);
    });
  } else {
    // No date: exclude seasonal offerings (they need a date context to surface)
    seasonFiltered = categoryFiltered.filter(o => !o.seasonTag);
  }

  if (seasonFiltered.length === 0) return [];

  // 5. Fetch providers — Phase 1 (neighborhood-scoped) with Phase 2 fallback
  let providers = await fetchCoveredProviders(city, opts.distanceKm);
  if (providers.length === 0) {
    providers = await fetchLocationFallbackProviders(city, opts.distanceKm);
  }

  // 6. Match each offering type to the best provider
  const entries: CatalogEntry[] = seasonFiltered.map(offering => {
    const best = findBestMatch(offering, providers);

    let coveredBy: CatalogCoverage | null = null;
    if (best) {
      const name = [best.providerFirstName, best.providerLastName].filter(Boolean).join(" ") || "Provider";
      coveredBy = {
        providerServiceId: best.id,
        providerName:      name,
        price:             best.price,
        href:              `/services/${best.id}`,
      };
    }

    return {
      offeringTypeKey: offering.offeringTypeKey,
      displayName:     offering.displayName,
      tagline:         offering.tagline,
      categoryKey:     offering.categoryKey,
      isSurprising:    offering.isSurprising,
      seasonTag:       offering.seasonTag ?? null,
      coveredBy,
    };
  });

  return entries;
}
