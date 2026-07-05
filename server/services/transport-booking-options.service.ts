/**
 * Transport Booking Options Service
 *
 * Generates booking options for transport legs based on:
 * - Service providers on Traveloure platform
 * - Affiliate partners (12Go, Viator, GetYourGuide, Klook, Booking.com)
 * - Rideshare apps (Uber, Bolt, Grab, Ola)
 * - Free options (walking, self-arranged)
 * - Multi-day transport passes
 */

import { db } from "../db";
import { transportBookingOptions, transportLegs, itineraryVariants, providerServices, bookingFeeConfigs } from "@shared/schema";
import { eq, and, ilike, sql } from "drizzle-orm";
import { getTravelpayoutsToken } from "./travelpayouts/travelpayouts-client";
import { buildPartnerizeTrackingLink } from "./partnerize/partnerize-client";

export interface TransportBookingOption {
  transportLegId?: string;
  variantId?: string;
  bookingType: "platform" | "affiliate" | "deep_link" | "info_only";
  source: string;
  title: string;
  description?: string;
  modeType: string;
  iconType?: string;
  priceDisplay?: string;
  priceCentsLow?: number;
  priceCentsHigh?: number;
  pricePerPerson?: boolean;
  currency?: string;
  estimatedMinutes?: number;
  estimatedMinutesHigh?: number;
  providerId?: number;
  externalUrl?: string;
  affiliateCode?: string;
  deepLinkScheme?: string;
  bookingStatus?: string;
  isMultiDayPass?: boolean;
  passValidDays?: number;
  savingsVsIndividual?: number;
  rating?: number;
  reviewCount?: number;
  sortOrder?: number;
  isRecommended?: boolean;
  revenueType?: "platform_commission" | "affiliate_margin";
  revenueRate?: number;
  isPartnerizeSourced?: boolean;
  partnerizePartnerId?: string;
}

/**
 * Populates booking options for a transport leg
 * Called after transport legs are calculated
 */
export async function populateBookingOptionsForLeg(
  legId: string,
  destination: string,
  travelers: number = 1
): Promise<void> {
  // Fetch the leg to get location info
  const leg = await db.query.transportLegs.findFirst({
    where: eq(transportLegs.id, legId),
  });

  if (!leg) throw new Error(`Transport leg ${legId} not found`);

  const options: TransportBookingOption[] = [];

  // 1. PLATFORM OPTIONS — Service providers on Traveloure
  // Query providers filtered by destination and transport service type
  const platformProviders = await findTransportProviders(
    destination,
    leg.recommendedMode,
    leg.fromLat,
    leg.fromLng,
    leg.toLat,
    leg.toLng
  );

  for (const provider of platformProviders) {
    const price = calculateProviderPrice(provider, leg.distanceMeters);
    options.push({
      transportLegId: legId,
      bookingType: "platform",
      source: "traveloure",
      title: provider.businessName,
      description: provider.serviceDescription,
      modeType: leg.recommendedMode,
      iconType: getModeIcon(leg.recommendedMode),
      priceDisplay: `$${price}`,
      priceCentsLow: price * 100,
      priceCentsHigh: price * 100,
      currency: "USD",
      estimatedMinutes: leg.estimatedDurationMinutes,
      rating: provider.ratingAvg,
      reviewCount: provider.reviewCount,
      isRecommended: true,
      sortOrder: 0,
      revenueType: "platform_commission",
      revenueRate: provider.commissionRate,
    });
  }

  // 2. AFFILIATE OPTIONS — Partner platforms
  const affiliateOptions = await findAffiliateTransportOptions(
    destination,
    leg.fromName,
    leg.toName,
    leg.distanceMeters,
    travelers
  );

  for (const affiliate of affiliateOptions) {
    options.push({
      transportLegId: legId,
      bookingType: "affiliate",
      source: affiliate.partner,
      title: affiliate.title,
      description: affiliate.description,
      modeType: affiliate.modeType,
      iconType: getModeIcon(affiliate.modeType),
      priceDisplay: affiliate.priceDisplay,
      priceCentsLow: affiliate.priceCentsLow,
      priceCentsHigh: affiliate.priceCentsHigh,
      pricePerPerson: affiliate.pricePerPerson,
      currency: affiliate.currency,
      estimatedMinutes: affiliate.estimatedMinutes,
      externalUrl: affiliate.urlWithAffiliate,
      affiliateCode: affiliate.affiliateCode,
      rating: affiliate.rating,
      reviewCount: affiliate.reviewCount,
      sortOrder: 1,
      revenueType: "affiliate_margin",
      revenueRate: affiliate.revenueRate,
      isPartnerizeSourced: affiliate.isPartnerizeSourced,
      partnerizePartnerId: affiliate.partnerizePartnerId,
    });
  }

  // 3. DEEP LINK OPTIONS — Rideshare apps
  const rideshareApps = getRideshareAppsForDestination(destination);
  for (const app of rideshareApps) {
    const priceRange = estimateRidesharePrice(app, leg.distanceMeters);
    options.push({
      transportLegId: legId,
      bookingType: "deep_link",
      source: app.name,
      title: app.displayName,
      description: `Rideshare • Est. ${leg.estimatedDurationMinutes - 5}-${leg.estimatedDurationMinutes + 10} min`,
      modeType: "rideshare",
      iconType: app.icon,
      priceDisplay: priceRange.display,
      priceCentsLow: priceRange.low,
      priceCentsHigh: priceRange.high,
      currency: "USD",
      estimatedMinutes: leg.estimatedDurationMinutes,
      deepLinkScheme: buildRideshareDeepLink(app, leg),
      sortOrder: 2,
    });
  }

  // 4. WALKING (if reasonable distance)
  if (leg.distanceMeters < 3000) {
    const walkMinutes = Math.ceil(leg.distanceMeters / 75); // ~75m/min walking pace
    options.push({
      transportLegId: legId,
      bookingType: "info_only",
      source: "walking",
      title: "Walk",
      description: `${leg.distanceDisplay} • ${walkMinutes} min`,
      modeType: "walk",
      iconType: "🚶",
      priceDisplay: "Free",
      priceCentsLow: 0,
      priceCentsHigh: 0,
      currency: "USD",
      estimatedMinutes: walkMinutes,
      sortOrder: 3,
    });
  }

  // Save all options to database
  await db.insert(transportBookingOptions).values(
    options.map((opt) => ({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
      ...opt,
    }))
  );

}

/**
 * Populates booking options for all legs in a variant
 */
export async function populateBookingOptionsForVariant(
  variantId: string,
  destination: string,
  travelers: number = 1
): Promise<void> {
  const legs = await db.query.transportLegs.findMany({
    where: eq(transportLegs.variantId, variantId),
  });

  for (const leg of legs) {
    await populateBookingOptionsForLeg(leg.id, destination, travelers);
  }

  // Populate multi-day passes for the variant
  await populateMultiDayPasses(variantId, destination, legs, travelers);
}

/**
 * Populates multi-day transport pass recommendations
 */
async function populateMultiDayPasses(
  variantId: string,
  destination: string,
  legs: any[],
  travelers: number
): Promise<void> {
  // Count how many legs use transit modes
  const transitLegs = legs.filter((l) =>
    ["transit", "train", "bus", "tram", "metro"].includes(l.recommendedMode)
  );

  if (transitLegs.length === 0) return; // No transit legs = no pass needed

  // Calculate total individual transit cost
  const totalIndividualCost = transitLegs.reduce(
    (sum, l) => sum + ((l.estimatedCostUsd || 0) * travelers),
    0
  );

  // Get available passes for destination
  const passes = getAvailablePassesForDestination(destination);

  for (const pass of passes) {
    const passCost = pass.pricePerPerson * travelers;
    const savings = totalIndividualCost - passCost;

    if (savings > 0) {
      await db.insert(transportBookingOptions).values({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
        variantId,
        bookingType: "affiliate",
        source: pass.source,
        title: pass.title,
        description: pass.description,
        modeType: "transit_pass",
        iconType: pass.icon,
        priceDisplay: `$${pass.pricePerPerson} per person`,
        priceCentsLow: pass.pricePerPerson * 100,
        priceCentsHigh: pass.pricePerPerson * 100,
        pricePerPerson: true,
        currency: "USD",
        isMultiDayPass: true,
        passValidDays: pass.validDays,
        savingsVsIndividual: Math.round(savings * 100),
        externalUrl: pass.affiliateUrl,
        rating: pass.rating,
        reviewCount: pass.reviewCount,
        isRecommended: savings > 500, // Recommend if saves > $5
        sortOrder: 0,
      });
    }
  }
}

// ============================================================================
// Fee resolution — reads from booking_fee_configs; falls back to spec defaults.
// All defaults are admin-editable via the Fee Config admin UI once the
// 031_transport_commerce_fee_config migration has run.
// ============================================================================

const TRANSPORT_COMMISSION_DEFAULT = 0.10; // 10% — within spec range 4-12%
const AFFILIATE_MARGIN_DEFAULTS: Record<string, number> = {
  "12go": 0.12,
  omio: 0.08,
  discovercars: 0.10,
  kiwi: 0.06,
};

async function resolveTransportCommissionRate(): Promise<number> {
  try {
    const rows = await db
      .select({ rate: bookingFeeConfigs.platformFeePercent })
      .from(bookingFeeConfigs)
      .where(and(
        eq(bookingFeeConfigs.category, "platform_transport_commission"),
        eq(bookingFeeConfigs.isActive, true),
      ))
      .limit(1);
    const val = rows[0]?.rate;
    if (val !== null && val !== undefined) return parseFloat(String(val)) / 100;
  } catch {
    // booking_fee_configs not yet on this DB; use approved default
  }
  return TRANSPORT_COMMISSION_DEFAULT;
}

async function resolveAffiliateMarginRate(partner: string): Promise<number> {
  try {
    const rows = await db
      .select({ rate: bookingFeeConfigs.platformFeePercent })
      .from(bookingFeeConfigs)
      .where(and(
        eq(bookingFeeConfigs.category, `affiliate_margin_${partner}`),
        eq(bookingFeeConfigs.isActive, true),
      ))
      .limit(1);
    const val = rows[0]?.rate;
    if (val !== null && val !== undefined) return parseFloat(String(val)) / 100;
  } catch {
    // booking_fee_configs not yet on this DB; use approved default
  }
  return AFFILIATE_MARGIN_DEFAULTS[partner] ?? 0.08;
}

// ============================================================================
// Affiliate URL builders
// ============================================================================

function buildTwelveGoUrl(fromName: string, toName: string, token: string | null): string {
  const f = encodeURIComponent(fromName.toLowerCase().replace(/\s+/g, "-"));
  const t = encodeURIComponent(toName.toLowerCase().replace(/\s+/g, "-"));
  const ref = token ? `?z=${token}` : "";
  return `https://12go.asia/en/travel/${f}/${t}${ref}`;
}

function buildOmioUrl(fromName: string, toName: string, token: string | null): string {
  const f = encodeURIComponent(fromName);
  const t = encodeURIComponent(toName);
  const ref = token ? `&ref=${token}` : "";
  return `https://www.omio.com/results/${f}/${t}?sortBy=best${ref}`;
}

function buildDiscoverCarsUrl(destination: string, token: string | null): string {
  const loc = encodeURIComponent(destination);
  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 86_400_000);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const aff = token ? `&affiliate_id=${token}` : "";
  return `https://www.discovercars.com/car-hire/${loc}?pickup_date=${fmt(today)}&dropoff_date=${fmt(nextWeek)}${aff}`;
}

function buildKiwiUrl(fromName: string, toName: string, token: string | null): string {
  const f = encodeURIComponent(fromName);
  const t = encodeURIComponent(toName);
  const ref = token ? `&source=${token}` : "";
  return `https://www.kiwi.com/en/search/results/${f}/${t}${ref}`;
}

// ============================================================================
// Phase 1 — Platform resolver
// Queries provider_services for active transport providers matching the
// destination and leg mode, reads commission from booking_fee_configs.
// ============================================================================

/**
 * Finds Traveloure platform transport providers for a leg.
 * Only private/charter modes (taxi, car, shuttle, private_driver) map to
 * platform providers — transit/walk/bicycle are not bookable here.
 */
async function findTransportProviders(
  destination: string,
  mode: string,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<any[]> {
  const PLATFORM_MODES = ["taxi", "car", "shuttle", "private_driver", "transfer", "rideshare"];
  const m = mode.toLowerCase();
  if (!PLATFORM_MODES.some((pm) => m.includes(pm))) return [];

  const commissionRate = await resolveTransportCommissionRate();
  const destLower = destination.toLowerCase();

  // Primary query: active providers whose location matches the destination
  const locationRows = await db
    .select({
      id: providerServices.id,
      businessName: providerServices.serviceName,
      serviceDescription: providerServices.shortDescription,
      price: providerServices.price,
      priceType: providerServices.priceType,
      location: providerServices.location,
      serviceRadius: providerServices.serviceRadius,
      ratingAvg: providerServices.averageRating,
      reviewCount: providerServices.reviewCount,
      bookingsCount: providerServices.bookingsCount,
    })
    .from(providerServices)
    .where(
      and(
        eq(providerServices.status, "active"),
        ilike(providerServices.location, `%${destLower}%`),
      )
    )
    .limit(8);

  // Secondary query: providers tagged for transport (content_affinity_tags array)
  let tagRows: any[] = [];
  try {
    const res = await db.execute(sql`
      SELECT id,
             service_name        AS "businessName",
             short_description   AS "serviceDescription",
             price,
             price_type          AS "priceType",
             location,
             service_radius      AS "serviceRadius",
             CAST(average_rating AS float) AS "ratingAvg",
             review_count        AS "reviewCount",
             bookings_count      AS "bookingsCount"
      FROM provider_services
      WHERE status = 'active'
        AND (
          content_affinity_tags @> ARRAY['transport']::text[]
          OR content_affinity_tags @> ARRAY['airport_transfer']::text[]
          OR content_affinity_tags @> ARRAY['private_driver']::text[]
          OR service_type = 'transportation'
        )
        AND location ILIKE ${'%' + destLower + '%'}
      ORDER BY bookings_count DESC NULLS LAST
      LIMIT 5
    `);
    tagRows = res.rows as any[];
  } catch {
    // content_affinity_tags column may be absent on older dev DBs; ignore
  }

  // Merge, deduplicate by id, attach commission rate
  const seen = new Set<string>();
  return [...locationRows, ...tagRows]
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .map((r) => ({ ...r, commissionRate }));
}

// ============================================================================
// Phase 2 — Affiliate resolver
// Builds deep-link options for 12Go, Omio, DiscoverCars, and Kiwi.
// Margin rates are read from booking_fee_configs — no literals in this block.
// ============================================================================

/**
 * Builds affiliate booking options for a transport leg.
 * Partner selection is mode-aware:
 *   train/bus/transit/ferry/shuttle → 12Go + Omio
 *   car/taxi/shuttle/drive          → DiscoverCars
 *   flight (>100 km)                → Kiwi
 */
async function findAffiliateTransportOptions(
  destination: string,
  fromName: string,
  toName: string,
  distanceMeters: number,
  travelers: number
): Promise<any[]> {
  const token = getTravelpayoutsToken();
  const results: any[] = [];

  // 12Go — trains, buses, ferries, shuttles (strong Asia + global coverage)
  const go12Margin = await resolveAffiliateMarginRate("12go");
  results.push({
    partner: "12go",
    title: `${fromName} → ${toName}`,
    description: "Book trains, buses & ferries with 12Go",
    modeType: "transit",
    priceDisplay: "From $5",
    priceCentsLow: 500,
    priceCentsHigh: null,
    pricePerPerson: true,
    currency: "USD",
    estimatedMinutes: null,
    urlWithAffiliate: buildTwelveGoUrl(fromName, toName, token),
    affiliateCode: token ?? "traveloure",
    revenueRate: go12Margin,
  });

  // Omio — trains, buses, coaches (Europe + global)
  const omioMargin = await resolveAffiliateMarginRate("omio");
  results.push({
    partner: "omio",
    title: `${fromName} → ${toName}`,
    description: "Compare trains, buses & coaches with Omio",
    modeType: "train",
    priceDisplay: "Compare prices",
    priceCentsLow: null,
    priceCentsHigh: null,
    pricePerPerson: true,
    currency: "EUR",
    estimatedMinutes: null,
    urlWithAffiliate: buildOmioUrl(fromName, toName, token),
    affiliateCode: token ?? "traveloure",
    revenueRate: omioMargin,
  });

  // DiscoverCars — car rental for journeys likely to need a vehicle
  if (distanceMeters > 5_000) {
    const dcMargin = await resolveAffiliateMarginRate("discovercars");
    results.push({
      partner: "discovercars",
      title: `Rent a car in ${destination}`,
      description: "Compare 500+ rental providers with DiscoverCars",
      modeType: "car",
      priceDisplay: "From $25/day",
      priceCentsLow: 2_500,
      priceCentsHigh: null,
      pricePerPerson: false,
      currency: "USD",
      estimatedMinutes: null,
      urlWithAffiliate: buildDiscoverCarsUrl(destination, token),
      affiliateCode: token ?? "traveloure",
      revenueRate: dcMargin,
    });
  }

  // Kiwi — flights for long-distance legs (>100 km)
  if (distanceMeters > 100_000) {
    const kiwiMargin = await resolveAffiliateMarginRate("kiwi");
    results.push({
      partner: "kiwi",
      title: `${fromName} → ${toName}`,
      description: "Search flights with Kiwi.com",
      modeType: "flight",
      priceDisplay: "From $50",
      priceCentsLow: 5_000,
      priceCentsHigh: null,
      pricePerPerson: true,
      currency: "USD",
      estimatedMinutes: null,
      urlWithAffiliate: buildKiwiUrl(fromName, toName, token),
      affiliateCode: token ?? "traveloure",
      revenueRate: kiwiMargin,
    });
  }

  // Partnerize — synced brand campaigns (car rental, airport transfer, etc.)
  // approved for the transportation category. Requires checkout on the
  // brand's own site, so these are flagged for the "book with an expert"
  // CTA alongside the direct link.
  try {
    const partnerizeRows = await db.execute(sql`
      SELECT id, name, external_campaign_id, commission_rate, website_url
      FROM affiliate_partners
      WHERE source = 'partnerize'
        AND is_active = true
        AND category = 'transportation'
      ORDER BY last_synced_at DESC NULLS LAST
      LIMIT 3
    `);
    for (const row of (partnerizeRows.rows || []) as any[]) {
      const url = buildPartnerizeTrackingLink(row.external_campaign_id, row.website_url, {
        destination,
      });
      if (!url) continue;
      results.push({
        partner: "partnerize",
        title: row.name,
        description: `Book ${row.name} — completed on their site or via a booking expert`,
        modeType: "car",
        priceDisplay: "View pricing",
        priceCentsLow: null,
        priceCentsHigh: null,
        pricePerPerson: false,
        currency: "USD",
        estimatedMinutes: null,
        urlWithAffiliate: url,
        affiliateCode: row.external_campaign_id,
        revenueRate: row.commission_rate !== null && row.commission_rate !== undefined ? Number(row.commission_rate) / 100 : undefined,
        isPartnerizeSourced: true,
        partnerizePartnerId: row.id,
      });
    }
  } catch (err) {
    console.warn("[transport-booking-options] Partnerize option lookup failed, skipping:", err);
  }

  return results;
}

/**
 * Gets rideshare apps available in destination
 */
function getRideshareAppsForDestination(destination: string): any[] {
  // Destination-specific rideshare availability
  const rideshareProfiles: Record<string, any[]> = {
    paris: [
      { name: "uber", displayName: "Uber", icon: "🚕", baseCostPerKm: 1.5, flagFall: 3.0 },
      { name: "bolt", displayName: "Bolt", icon: "🚗", baseCostPerKm: 1.2, flagFall: 2.5 },
    ],
    mumbai: [
      { name: "uber", displayName: "Uber", icon: "🚕", baseCostPerKm: 0.3, flagFall: 1.0 },
      { name: "ola", displayName: "Ola", icon: "🚗", baseCostPerKm: 0.25, flagFall: 0.8 },
    ],
    kyoto: [
      { name: "uber", displayName: "Uber Japan", icon: "🚕", baseCostPerKm: 3.0, flagFall: 5.0 },
    ],
    // ... more destinations
  };

  return rideshareProfiles[destination.toLowerCase()] || [];
}

/**
 * Gets available multi-day passes for destination
 */
function getAvailablePassesForDestination(destination: string): any[] {
  const passData: Record<string, any[]> = {
    paris: [
      {
        source: "12go",
        title: "Paris Navigo Week Pass",
        description: "Unlimited metro, bus, RER (zones 1-3) for 7 days",
        icon: "🚇",
        pricePerPerson: 30,
        validDays: 7,
        affiliateUrl: "https://12go.asia/en/travel/paris-metro-pass",
      },
    ],
    // ... more passes
  };

  return passData[destination.toLowerCase()] || [];
}

/**
 * Calculates rideshare deep link for opening in native app
 */
function buildRideshareDeepLink(app: any, leg: any): string {
  switch (app.name) {
    case "uber":
      return `uber://?action=setPickup&pickup[latitude]=${leg.fromLat}&pickup[longitude]=${leg.fromLng}&dropoff[latitude]=${leg.toLat}&dropoff[longitude]=${leg.toLng}`;
    case "grab":
      return `grab://open?destinationLat=${leg.toLat}&destinationLng=${leg.toLng}&pickupLat=${leg.fromLat}&pickupLng=${leg.fromLng}`;
    case "bolt":
      return `bolt://ride?startLat=${leg.fromLat}&startLng=${leg.fromLng}&endLat=${leg.toLat}&endLng=${leg.toLng}`;
    case "ola":
      return `olaapp://startRide?pickup_latitude=${leg.fromLat}&pickup_longitude=${leg.fromLng}&drop_latitude=${leg.toLat}&drop_longitude=${leg.toLng}`;
    default:
      return "";
  }
}

/**
 * Estimates rideshare price based on distance
 */
function estimateRidesharePrice(app: any, distanceMeters: number): { low: number; high: number; display: string } {
  const distanceKm = distanceMeters / 1000;
  const baseCost = app.flagFall + app.baseCostPerKm * distanceKm;
  const withSurge = baseCost * 1.5; // Assume possible surge pricing

  return {
    low: Math.round(baseCost * 100),
    high: Math.round(withSurge * 100),
    display: `$${baseCost.toFixed(0)}-${withSurge.toFixed(0)}`,
  };
}

/**
 * Calculates provider price for a leg distance.
 * - fixed price: returned directly
 * - variable price: treated as per-km rate
 * - no price set: estimated at $2/km, $5 minimum
 */
function calculateProviderPrice(provider: any, distanceMeters: number): number {
  const distanceKm = distanceMeters / 1000;
  if (provider.price && provider.priceType === "fixed") {
    return Math.round(parseFloat(String(provider.price)) * 100) / 100;
  }
  if (provider.price && provider.priceType === "variable") {
    return Math.max(5, Math.round(parseFloat(String(provider.price)) * distanceKm * 100) / 100);
  }
  return Math.max(5, Math.round(distanceKm * 2 * 100) / 100);
}

/**
 * Gets icon for transport mode
 */
function getModeIcon(mode: string): string {
  const icons: Record<string, string> = {
    walk: "🚶",
    transit: "🚇",
    train: "🚄",
    bus: "🚌",
    tram: "🚊",
    taxi: "🚕",
    rideshare: "🚗",
    private_driver: "🚐",
    bike: "🚴",
    ferry: "⛴️",
    rental_car: "🚙",
  };
  return icons[mode] || "🚌";
}
