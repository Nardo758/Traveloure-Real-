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
import { transportBookingOptions, transportLegs, itineraryVariants, providerServices } from "@shared/schema";
import { eq, and, ilike, sql } from "drizzle-orm";
import { getTravelpayoutsMarker } from "./travelpayouts/travelpayouts-client";
import { buildPartnerizeTrackingLink } from "./partnerize/partnerize-client";
import { metersPerMinute } from "@shared/travel-speeds";
import { readBand } from "./fee-resolution.service";
import { syncLegAffiliateOptions } from "./transport-affiliate.service";
import { AFFILIATE_TRANSPORT_MARGIN_BAND, TRANSPORT_PLATFORM_COMMISSION_BAND, declaredFallbackValue } from "./fee-band-requirements";

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
      priceDisplay: price === null ? "Request quote" : `$${price}`,
      priceCentsLow: price === null ? undefined : Math.round(price * 100),
      priceCentsHigh: price === null ? undefined : Math.round(price * 100),
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

  // 2. AFFILIATE OPTIONS — TC-2 Phase 1 (ledger `2026-10-12-tc2-affiliate-legs`): the ONE leg resolver,
  // `syncLegAffiliateOptions`, writes them after the rows below, gated by the partner registry and the route
  // map; the old every-leg 12Go/Omio/DiscoverCars/Kiwi/Partnerize list is deleted (§18c).

  // 3. DEEP LINK OPTIONS — Rideshare apps
  // V-1b (ledger `2026-10-12-v1b-google-version-legs`): a deep link carries both ends' coordinates in a
  // stored URL, so a leg with a Google-sourced end (`coord_source='google'`) gets NO ride deep link —
  // that would be a stored copy of a Google point (LD 57).
  const rideshareApps = leg.coordSource === "google" ? [] : getRideshareAppsForDestination(destination);
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
    const walkMinutes = Math.ceil(leg.distanceMeters / metersPerMinute("walk")); // the ONE speeds table (R228)
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
  if (options.length) {
    await db.insert(transportBookingOptions).values(
      options.map((opt) => ({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
        ...opt,
      }))
    );
  }
  await syncLegAffiliateOptions(legId);
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
// Fee resolution — the transport commission and the route-search partners' margin are fee bands (TC-0).
// ============================================================================

/**
 * TC-0 (ledger `2026-10-10-tc0-transport-commission-band`; LD 8): the platform transport commission is
 * the `transport_platform_commission` fee band — admin-editable on /admin/fee-bands with no deploy — and
 * its declared fallback (0) when the row is absent, inactive or unreadable. The old read of the dormant
 * `booking_fee_configs` row (no admin editor since Phase 8.1) and the 10% code literal are gone.
 */
export async function resolveTransportCommissionRate(): Promise<number> {
  try {
    const band = await readBand(TRANSPORT_PLATFORM_COMMISSION_BAND);
    if (band && band.rateType === "percent" && band.rate >= 0) return band.rate;
  } catch {
    /* unreadable ⇒ the declared fallback, below */
  }
  return declaredFallbackValue(TRANSPORT_PLATFORM_COMMISSION_BAND);
}

/**
 * TC-0 (decision-maker, Oct 10, 2026; LD 8): the margin shown on the four route-search partners (12Go,
 * Omio, DiscoverCars, Kiwi) is ONE band, `affiliate_transport_margin`, with its declared fallback 0. The
 * per-partner `booking_fee_configs` rows (dormant — no admin editor since Phase 8.1) and the hard-coded
 * per-partner defaults are gone. Partnerize transport rows keep their own `affiliate_partners.commission_rate`.
 * Display metadata only (`revenue_rate`); no charge path reads it.
 */
export async function resolveAffiliateTransportMargin(): Promise<number> {
  try {
    const band = await readBand(AFFILIATE_TRANSPORT_MARGIN_BAND);
    if (band && band.rateType === "percent" && band.rate >= 0) return band.rate;
  } catch {
    /* unreadable ⇒ the declared fallback, below */
  }
  return declaredFallbackValue(AFFILIATE_TRANSPORT_MARGIN_BAND);
}

// ============================================================================
// Phase 1 — Platform resolver
// Queries provider_services for active transport providers matching the
// destination and leg mode, reads commission from the transport_platform_commission band (TC-0).
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
// Destination-level transport options (no trip leg required)
// Used by GET /api/transport-options for the standalone Transfers tab.
// ============================================================================

/**
 * What the CLIENT receives (§16, ledger `2026-09-26-transfer-link-tracked`): the partner URL is
 * NEVER shipped. `hasPartnerLink` says one exists; following it goes through the tracked
 * `POST /api/transport-options/click`, which rebuilds the option server-side, records the click and
 * only then returns the URL — the same strip the hub/leg DTOs already apply (`hasBookingLink`).
 */
export interface DestinationTransportOption {
  id: string;
  source: string;
  title: string;
  description: string;
  modeType: string;
  icon: string;
  priceDisplay: string;
  priceCentsLow: number | null;
  currency: string;
  hasPartnerLink: boolean;
  isExternal: boolean;
}

/** Server-internal: the same option WITH its partner URL. Never serialized to a client. */
export interface DestinationTransportOptionWithUrl extends Omit<DestinationTransportOption, "hasPartnerLink"> {
  externalUrl?: string;
}

/** Public list — every option with its partner URL stripped (§16). */
export async function getDestinationTransportOptions(
  destination: string,
  travelers: number = 1,
  startDate?: string,
): Promise<DestinationTransportOption[]> {
  const options = await buildDestinationTransportOptions(destination, travelers, startDate);
  return options.map(({ externalUrl, ...rest }) => ({ ...rest, hasPartnerLink: !!externalUrl }));
}

/**
 * Resolve ONE option's partner URL for the tracked click. Rebuilt from the same builder the list
 * uses (§18 rule 1 — one derivation), keyed by the option id the list published; `null` when the
 * option is unknown or carries no partner link. The client never supplies a URL.
 */
export async function resolveDestinationTransportOptionLink(
  destination: string,
  optionId: string,
  startDate?: string,
  travelers: number = 1,
): Promise<{ url: string; source: string } | null> {
  const options = await buildDestinationTransportOptions(destination, travelers, startDate);
  const hit = options.find((o) => o.id === optionId);
  return hit?.externalUrl ? { url: hit.externalUrl, source: hit.source } : null;
}

/**
 * Builds curated transport options for a destination without needing a trip
 * leg. Includes affiliate deep-links (12Go, Omio, DiscoverCars) and any
 * platform providers registered for that destination. SERVER-INTERNAL: carries URLs.
 */
async function buildDestinationTransportOptions(
  destination: string,
  travelers: number = 1,
  startDate?: string,
): Promise<DestinationTransportOptionWithUrl[]> {
  // Use the public affiliate marker (partner ID) — never the secret API token —
  // for any URL that will be returned to the client.
  const marker = getTravelpayoutsMarker();
  const results: DestinationTransportOptionWithUrl[] = [];

  // 1. Platform providers tagged for transport in this destination
  try {
    const destLower = destination.toLowerCase();
    const rows = await db.execute(sql`
      SELECT id, service_name AS "businessName", short_description AS "serviceDescription",
             price, price_type AS "priceType"
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
    for (const row of (rows.rows || []) as any[]) {
      const price = row.price ? parseFloat(String(row.price)) : null;
      results.push({
        id: `platform-${row.id}`,
        source: "traveloure",
        title: row.businessName,
        description: row.serviceDescription || `Private transport in ${destination}`,
        modeType: "private_driver",
        icon: "🚐",
        priceDisplay: price ? `From $${price}` : "Request quote",
        priceCentsLow: price ? Math.round(price * 100) : null,
        currency: "USD",
        isExternal: false,
      });
    }
  } catch {
    // content_affinity_tags may be absent on older dev DBs — not fatal
  }

  // Date helpers — use the trip's startDate when provided, otherwise today.
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const tripStart = startDate ? new Date(startDate) : new Date();
  const tripEnd = new Date(tripStart.getTime() + 7 * 86_400_000);

  // 2. 12Go — destination search page (user enters their own origin).
  // We link to the 12Go destination hub so the user can search from wherever
  // they're travelling from. The ?z= param is the public partner marker.
  // priceCentsLow is null — these are affiliate search links, not real quotes,
  // so no "Add" button is shown (would corrupt the budget with a floor estimate).
  const destSlug = encodeURIComponent(
    destination.toLowerCase().replace(/\s+/g, "-")
  );
  const go12DateParam = `&date=${fmt(tripStart)}`;
  results.push({
    id: "affiliate-12go",
    source: "12go",
    title: `Trains & buses to ${destination}`,
    description: "Search trains, buses & ferries with 12Go — strong Asia & global coverage",
    modeType: "transit",
    icon: "🚄",
    priceDisplay: "Search prices",
    priceCentsLow: null,
    currency: "USD",
    externalUrl: `https://12go.asia/en/travel/to/${destSlug}?z=${marker}${go12DateParam}`,
    isExternal: true,
  });

  // 3. Omio — destination search page (user enters their own origin).
  // priceCentsLow null → no "Add" button (price-compare only).
  results.push({
    id: "affiliate-omio",
    source: "omio",
    title: `Coaches & trains to ${destination}`,
    description: "Compare trains, buses & coaches with Omio — great for European routes",
    modeType: "train",
    icon: "🚌",
    priceDisplay: "Compare prices",
    priceCentsLow: null,
    currency: "EUR",
    externalUrl: `https://www.omio.com/results?to=${encodeURIComponent(destination)}&date=${fmt(tripStart)}&ref=${marker}`,
    isExternal: true,
  });

  // 4. DiscoverCars — car rental at destination.
  // Dates are threaded from the trip's startDate (or today if none provided).
  // priceCentsLow null — this is a search link, not a real quote.
  results.push({
    id: "affiliate-discovercars",
    source: "discovercars",
    title: `Rent a car in ${destination}`,
    description: "Compare 500+ rental providers with DiscoverCars — free cancellation options",
    modeType: "car",
    icon: "🚙",
    priceDisplay: "Search prices",
    priceCentsLow: null,
    currency: "USD",
    externalUrl: `https://www.discovercars.com/car-hire/${encodeURIComponent(destination)}?pickup_date=${fmt(tripStart)}&dropoff_date=${fmt(tripEnd)}&affiliate_id=${marker}`,
    isExternal: true,
  });

  // 5. Partnerize-sourced transport partners for this destination
  try {
    const partnerizeRows = await db.execute(sql`
      SELECT id, name, external_campaign_id, commission_rate, website_url
      FROM affiliate_partners
      WHERE source = 'partnerize'
        AND is_active = true
        AND category = 'transportation'
      ORDER BY last_synced_at DESC NULLS LAST
      LIMIT 2
    `);
    for (const row of (partnerizeRows.rows || []) as any[]) {
      const url = buildPartnerizeTrackingLink(row.external_campaign_id, row.website_url, { destination });
      if (!url) continue;
      results.push({
        id: `partnerize-${row.id}`,
        source: "partnerize",
        title: String(row.name),
        // §16: this is a tracked pricing link, not a booking the platform takes — say so.
        description: `See ${row.name}'s transfer pricing on their site`,
        modeType: "car",
        icon: "🚗",
        priceDisplay: "View pricing",
        priceCentsLow: null,
        currency: "USD",
        externalUrl: url,
        isExternal: true,
      });
    }
  } catch {
    // affiliate_partners table may be absent on dev — not fatal
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
      { name: "uber", displayName: "Uber", icon: "🚕" },
      { name: "bolt", displayName: "Bolt", icon: "🚗" },
    ],
    mumbai: [
      { name: "uber", displayName: "Uber", icon: "🚕" },
      { name: "ola", displayName: "Ola", icon: "🚗" },
    ],
    kyoto: [
      { name: "uber", displayName: "Uber Japan", icon: "🚕" },
    ],
    // ... more destinations
  };

  return rideshareProfiles[destination.toLowerCase()] || [];
}

/**
 * Gets available multi-day passes for destination
 */
function getAvailablePassesForDestination(_destination: string): any[] {
  // Ledger `2026-10-03-transport-price-literals`: the hard-coded pass catalog (a "Paris Navigo Week
  // Pass" at a literal $30) is REMOVED. A pass returns when a partner payload or an admin-configured
  // row states its price — never as a literal here (§13).
  return [];
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
 * Rideshare price: NOT ESTIMATED (ledger `2026-10-03-transport-price-literals`). The old estimate
 * multiplied hard-coded per-app, per-city rates by a 1.5 "surge" — figures no partner gave us. The
 * app quotes its own price; we show none (§13).
 */
function estimateRidesharePrice(_app: any, _distanceMeters: number): { low: number | undefined; high: number | undefined; display: string } {
  return { low: undefined, high: undefined, display: "Price shown in the app" };
}

/**
 * Calculates provider price for a leg distance — FROM THE LISTING ONLY (ledger
 * `2026-10-03-transport-price-literals`):
 * - fixed price: returned directly
 * - variable price: the listing's own per-km rate × the leg distance
 * - no price set: NULL — never an invented "$2/km, $5 minimum" (§13/§14). The option then shows
 *   "Request quote", and the platform checkout refuses it rather than charging a guess.
 */
function calculateProviderPrice(provider: any, distanceMeters: number): number | null {
  const distanceKm = distanceMeters / 1000;
  const listed = provider.price != null ? parseFloat(String(provider.price)) : NaN;
  if (!Number.isFinite(listed) || listed <= 0) return null;
  if (provider.priceType === "fixed") return Math.round(listed * 100) / 100;
  if (provider.priceType === "variable") return Math.round(listed * distanceKm * 100) / 100;
  return null;
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
