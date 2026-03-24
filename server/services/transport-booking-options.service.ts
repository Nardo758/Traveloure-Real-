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
import { transportBookingOptions, transportLegs, itineraryVariants } from "@shared/schema";
import { eq, and } from "drizzle-orm";

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
      providerId: provider.id,
      rating: provider.ratingAvg,
      reviewCount: provider.reviewCount,
      isRecommended: true,
      sortOrder: 0,
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
// Helper Functions
// ============================================================================

/**
 * Finds transport service providers in destination
 */
async function findTransportProviders(
  destination: string,
  mode: string,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<any[]> {
  // TODO: Query service_providers table filtered by destination and service_type = "transport"
  // For now, return empty array (should be seeded with test data)
  return [];
}

/**
 * Finds affiliate transport options from partner catalogs
 */
async function findAffiliateTransportOptions(
  destination: string,
  fromName: string,
  toName: string,
  distanceMeters: number,
  travelers: number
): Promise<any[]> {
  // TODO: Query affiliate partner data/APIs
  // Partners: 12Go, Viator, GetYourGuide, Klook, Booking.com
  return [
    // Example structure:
    // {
    //   partner: "12go",
    //   title: "RER B + Metro",
    //   description: "Train to Châtelet + walk",
    //   modeType: "transit",
    //   priceDisplay: "$12 per person",
    //   priceCentsLow: 1200,
    //   pricePerPerson: true,
    //   currency: "USD",
    //   estimatedMinutes: 65,
    //   urlWithAffiliate: "https://12go.asia/en/travel/...",
    //   affiliateCode: "traveloure",
    //   rating: 4.6,
    //   reviewCount: 8234,
    // }
  ];
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
        rating: 4.6,
        reviewCount: 8234,
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
 * Calculates provider price for distance
 */
function calculateProviderPrice(provider: any, distanceMeters: number): number {
  // TODO: Use provider's pricing formula
  // For now, simple formula: base fee + distance-based pricing
  return 25; // Placeholder
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
