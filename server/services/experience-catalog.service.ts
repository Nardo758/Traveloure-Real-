import { db } from "../db";
import { 
  activityCache, 
  hotelCache, 
  feverEventCache,
  poiCache,
  restaurantCache,
  experienceTypes,
  experienceTemplateTabs,
  experienceTemplateFilters,
  experienceTemplateFilterOptions,
  experienceUniversalFilters,
  experienceUniversalFilterOptions
} from "@shared/schema";
import { eq, and, or, ilike, gte, lte, asc, sql, inArray } from "drizzle-orm";
import { logger, databaseQueryDuration } from "../infrastructure";
import { amadeusService } from "./amadeus.service";

// ─────────────────────────────────────────────
// Discriminated union content model
// ─────────────────────────────────────────────

export interface BaseItem {
  id: string;
  provider: string;
  externalId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  destination: string | null;
  location: { lat: number; lng: number } | null;
  duration: string | null;
  categories: string[];
  tags: string[];
  bookingUrl: string | null;
  affiliateUrl: string | null;
  source?: string | null;
  lastUpdated: Date | null;
}

export interface ActivityItem extends BaseItem {
  type: "activity";
}

export interface EventItem extends BaseItem {
  type: "event";
  dates: { start: Date | null; end: Date | null } | null;
  isFree: boolean;
  isSoldOut: boolean;
  venueName: string | null;
}

export interface HotelItem extends BaseItem {
  type: "hotel";
  amenities: string[];
}

export interface FlightItem extends BaseItem {
  type: "flight";
  origin: string | null;
  destination: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  stops: number | null;
  cabin: string | null;
}

export interface POIItem extends BaseItem {
  type: "poi";
  rank: number | null;
  poiCategory: string | null;
}

export interface TransferItem extends BaseItem {
  type: "transfer";
  vehicle: {
    code: string;
    category: string;
    description: string;
    seats?: number;
  } | null;
  quotation: {
    amount: string;
    currencyCode: string;
  } | null;
  transferType: string | null;
}

export interface SafetyItem extends BaseItem {
  type: "safety";
  subType: string | null;
  safetyScores: {
    overall: number;
    lgbtq: number;
    medical: number;
    physicalHarm: number;
    politicalFreedom: number;
    theft: number;
    women: number;
  } | null;
}

export interface CarRentalItem extends BaseItem {
  type: "car_rental";
}

export interface EsimItem extends BaseItem {
  type: "esim";
  dataGB: number | null;
  validityDays: number | null;
  countries: string[];
}

export interface TransportItem extends BaseItem {
  type: "transport";
  transportMode: string | null;
}

export interface RestaurantItem extends BaseItem {
  type: "restaurant";
  cuisine: string | null;
  priceLevel: string | null;
}

export type CatalogItem =
  | ActivityItem
  | EventItem
  | HotelItem
  | FlightItem
  | POIItem
  | TransferItem
  | SafetyItem
  | CarRentalItem
  | EsimItem
  | TransportItem
  | RestaurantItem;

// ─────────────────────────────────────────────
// Search params / result shapes
// ─────────────────────────────────────────────

export interface CatalogSearchParams {
  experienceTypeSlug?: string;
  tabSlug?: string;
  destination?: string;
  query?: string;
  priceMin?: number;
  priceMax?: number;
  rating?: number;
  sortBy?: "popular" | "price_low" | "price_high" | "rating";
  limit?: number;
  offset?: number;
  providers?: string[];
  /** When provided, constrains which content types are queried */
  type?: Array<"activity" | "event" | "hotel" | "flight" | "poi" | "transfer" | "safety" | "restaurant">;
}

export interface CatalogSearchResult {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    destinations: string[];
    priceRange: { min: number; max: number };
    providers: string[];
  };
}

export interface TemplateWithFilters {
  id: string;
  experienceTypeId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number | null;
  filters: {
    id: string;
    name: string;
    slug: string;
    filterType: string | null;
    icon: string | null;
    options: {
      label: string;
      value: string;
      icon: string | null;
    }[];
  }[];
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

class ExperienceCatalogService {
  private catalogLogger = logger.child({ service: "experience-catalog" });

  async searchCatalog(params: CatalogSearchParams): Promise<CatalogSearchResult> {
    const startTime = Date.now();
    const limit = params.limit || 20;
    const offset = params.offset || 0;
    
    this.catalogLogger.debug({ params }, "Searching experience catalog");

    const items: CatalogItem[] = [];
    const batchSize = 100;

    // Determine which content types to fetch
    const requestedTypes = params.type;

    const shouldFetch = (type: string): boolean => {
      if (!requestedTypes || requestedTypes.length === 0) return false;
      return requestedTypes.includes(type as any);
    };

    // When type[] is provided, use it to constrain fetching
    // When type[] is absent, fall back to providers[] behaviour
    if (requestedTypes && requestedTypes.length > 0) {
      if (shouldFetch("activity")) {
        const activities = await this.searchActivities(params, batchSize, 0);
        items.push(...activities);
      }
      if (shouldFetch("event")) {
        const events = await this.searchEvents(params, batchSize, 0);
        items.push(...events);
      }
      if (shouldFetch("hotel")) {
        const hotels = await this.searchHotels(params, batchSize, 0);
        items.push(...hotels);
      }
      if (shouldFetch("poi")) {
        const pois = await this.searchPOIs(params, batchSize, 0);
        items.push(...pois);
      }
      if (shouldFetch("safety")) {
        const safety = await this.searchSafety(params, batchSize, 0);
        items.push(...safety);
      }
      if (shouldFetch("transfer")) {
        const transfers = await this.searchTransfers(params, batchSize, 0);
        items.push(...transfers);
      }
      if (shouldFetch("restaurant")) {
        const restaurants = await this.searchRestaurants(params, batchSize, 0);
        items.push(...restaurants);
      }
      // flight: date-specific, stays as direct Amadeus call — no-op in generic search
    } else {
      // Legacy providers[] behaviour
      const providers = params.providers || ["viator", "fever", "amadeus"];

      if (providers.includes("viator")) {
        const activities = await this.searchActivities(params, batchSize, 0);
        items.push(...activities);
      }
      if (providers.includes("fever")) {
        const events = await this.searchEvents(params, batchSize, 0);
        items.push(...events);
      }
      if (providers.includes("amadeus") || providers.includes("booking_com")) {
        const hotels = await this.searchHotels(params, batchSize, 0);
        items.push(...hotels);
      }
      if (providers.includes("opentable")) {
        const restaurants = await this.searchRestaurants(params, batchSize, 0);
        items.push(...restaurants);
      }
    }

    let sortedItems = [...items];
    if (params.sortBy === "price_low") {
      sortedItems.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (params.sortBy === "price_high") {
      sortedItems.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (params.sortBy === "rating") {
      sortedItems.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    const totalCount = sortedItems.length;
    const paginatedItems = sortedItems.slice(offset, offset + limit);

    const destinationSet = new Set<string>();
    items.forEach(i => { if (i.destination) destinationSet.add(i.destination); });
    const destinations = Array.from(destinationSet);

    const prices = items.map(i => i.price).filter((p): p is number => p !== null);
    
    const providerSet = new Set<string>();
    items.forEach(i => providerSet.add(i.provider));
    
    const duration = (Date.now() - startTime) / 1000;
    databaseQueryDuration.labels("catalog_search", "read").observe(duration);
    
    this.catalogLogger.info({ 
      resultCount: paginatedItems.length,
      totalCount,
      duration,
      types: requestedTypes,
      providers: params.providers 
    }, "Catalog search completed");

    return {
      items: paginatedItems,
      total: totalCount,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      filters: {
        destinations,
        priceRange: {
          min: prices.length ? Math.min(...prices) : 0,
          max: prices.length ? Math.max(...prices) : 1000,
        },
        providers: Array.from(providerSet),
      },
    };
  }

  // ─── Private helpers ───────────────────────

  private async searchActivities(params: CatalogSearchParams, limit: number, offset: number): Promise<ActivityItem[]> {
    const conditions = [];
    
    if (params.destination) {
      conditions.push(ilike(activityCache.destination, `%${params.destination}%`));
    }
    if (params.query) {
      conditions.push(
        or(
          ilike(activityCache.title, `%${params.query}%`),
          ilike(activityCache.description, `%${params.query}%`)
        )
      );
    }
    if (params.priceMin !== undefined) {
      conditions.push(gte(activityCache.price, params.priceMin.toString()));
    }
    if (params.priceMax !== undefined) {
      conditions.push(lte(activityCache.price, params.priceMax.toString()));
    }
    if (params.rating !== undefined) {
      conditions.push(gte(activityCache.rating, params.rating.toString()));
    }
    if (params.providers && params.providers.length > 0) {
      const normalized = params.providers.map(p => p.toLowerCase());
      conditions.push(inArray(activityCache.provider, normalized));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const activities = await db.select()
      .from(activityCache)
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    return activities.map(a => ({
      id: a.id,
      type: "activity" as const,
      provider: a.provider || "viator",
      externalId: a.productCode,
      title: a.title,
      description: a.description,
      imageUrl: a.imageUrl,
      price: a.price ? parseFloat(a.price) : null,
      currency: a.currency || "USD",
      rating: a.rating ? parseFloat(a.rating) : null,
      reviewCount: a.reviewCount,
      destination: a.destination,
      location: a.latitude && a.longitude 
        ? { lat: parseFloat(a.latitude), lng: parseFloat(a.longitude) }
        : null,
      duration: a.durationMinutes ? `${a.durationMinutes} minutes` : null,
      categories: a.category ? [a.category] : [],
      tags: (a.tags as string[]) || [],
      bookingUrl: null,
      affiliateUrl: null,
      lastUpdated: a.lastUpdated,
    }));
  }

  private async searchEvents(params: CatalogSearchParams, limit: number, offset: number): Promise<EventItem[]> {
    const conditions = [];
    
    if (params.destination) {
      conditions.push(ilike(feverEventCache.city, `%${params.destination}%`));
    }
    if (params.query) {
      conditions.push(
        or(
          ilike(feverEventCache.title, `%${params.query}%`),
          ilike(feverEventCache.description, `%${params.query}%`)
        )
      );
    }
    if (params.priceMin !== undefined) {
      conditions.push(gte(feverEventCache.minPrice, params.priceMin.toString()));
    }
    if (params.priceMax !== undefined) {
      conditions.push(lte(feverEventCache.maxPrice, params.priceMax.toString()));
    }
    if (params.rating !== undefined) {
      conditions.push(gte(feverEventCache.rating, params.rating.toString()));
    }
    if (params.providers && params.providers.length > 0) {
      const normalized = params.providers.map(p => p.toLowerCase());
      conditions.push(inArray(feverEventCache.provider, normalized));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const events = await db.select()
      .from(feverEventCache)
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    return events.map(e => ({
      id: e.id,
      type: "event" as const,
      provider: e.provider || "fever",
      externalId: e.eventId,
      title: e.title,
      description: e.description,
      imageUrl: e.imageUrl,
      price: e.minPrice ? parseFloat(e.minPrice) : null,
      currency: e.currency || "USD",
      rating: e.rating ? parseFloat(e.rating) : null,
      reviewCount: e.reviewCount,
      destination: e.city,
      location: e.latitude && e.longitude 
        ? { lat: parseFloat(e.latitude), lng: parseFloat(e.longitude) }
        : null,
      duration: null,
      categories: e.category ? [e.category] : [],
      tags: (e.tags as string[]) || [],
      bookingUrl: e.bookingUrl,
      affiliateUrl: e.affiliateUrl,
      lastUpdated: e.lastUpdated,
      dates: e.startDate || e.endDate
        ? { start: e.startDate, end: e.endDate }
        : null,
      isFree: e.isFree ?? false,
      isSoldOut: e.isSoldOut ?? false,
      venueName: e.venueName,
    }));
  }

  private async searchHotels(params: CatalogSearchParams, limit: number, offset: number): Promise<HotelItem[]> {
    const conditions = [];
    
    if (params.destination) {
      conditions.push(
        or(
          ilike(hotelCache.city, `%${params.destination}%`),
          ilike(hotelCache.countryName, `%${params.destination}%`)
        )
      );
    }
    if (params.query) {
      conditions.push(ilike(hotelCache.name, `%${params.query}%`));
    }
    if (params.rating !== undefined) {
      conditions.push(gte(hotelCache.rating, params.rating.toString()));
    }
    if (params.providers && params.providers.length > 0) {
      const normalized = params.providers.map(p => p.toLowerCase());
      conditions.push(inArray(hotelCache.provider, normalized));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const hotels = await db.select()
      .from(hotelCache)
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    return hotels.map(h => {
      const media = h.media as { url?: string }[] | null;
      const firstImage = media && media.length > 0 ? media[0].url : null;
      
      return {
        id: h.id,
        type: "hotel" as const,
        provider: h.provider || "amadeus",
        externalId: h.hotelId,
        title: h.name,
        description: h.address,
        imageUrl: firstImage || null,
        price: null,
        currency: "USD",
        rating: h.rating ? parseFloat(h.rating) : null,
        reviewCount: h.reviewCount,
        destination: h.city,
        location: h.latitude && h.longitude 
          ? { lat: parseFloat(h.latitude), lng: parseFloat(h.longitude) }
          : null,
        duration: null,
        categories: (h.amenities as string[]) || [],
        tags: [],
        bookingUrl: null,
        affiliateUrl: null,
        lastUpdated: h.lastUpdated,
        amenities: (h.amenities as string[]) || [],
      };
    });
  }

  /** Search POIs: tries poi_cache first, falls back to live Amadeus if coords are available */
  async searchPOIs(params: CatalogSearchParams, limit: number, offset: number): Promise<POIItem[]> {
    const conditions = [];

    if (params.destination) {
      conditions.push(
        or(
          ilike(poiCache.city, `%${params.destination}%`),
          ilike(poiCache.country, `%${params.destination}%`)
        )
      );
    }
    if (params.query) {
      conditions.push(ilike(poiCache.name, `%${params.query}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const cached = await db.select()
      .from(poiCache)
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    if (cached.length > 0) {
      return cached.map(p => ({
        id: p.id,
        type: "poi" as const,
        provider: "amadeus",
        externalId: p.amadeusId,
        title: p.name,
        description: null,
        imageUrl: null,
        price: null,
        currency: "USD",
        rating: null,
        reviewCount: null,
        destination: p.city,
        location: { lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) },
        duration: null,
        categories: p.category ? [p.category] : [],
        tags: (p.tags as string[]) || [],
        bookingUrl: null,
        affiliateUrl: null,
        lastUpdated: p.lastUpdated,
        rank: p.rank,
        poiCategory: p.category,
      }));
    }

    // Live Amadeus fallback: need coords
    const coords = params.destination ? await this.getDestinationCoords(params.destination) : null;
    if (!coords) return [];

    try {
      const pois = await amadeusService.searchPointsOfInterest({
        latitude: coords.lat,
        longitude: coords.lng,
        radius: 20,
      });

      return pois.slice(offset, offset + limit).map(p => ({
        id: `poi-${p.id}`,
        type: "poi" as const,
        provider: "amadeus",
        externalId: p.id,
        title: p.name,
        description: null,
        imageUrl: null,
        price: null,
        currency: "USD",
        rating: null,
        reviewCount: null,
        destination: params.destination || null,
        location: { lat: p.geoCode.latitude, lng: p.geoCode.longitude },
        duration: null,
        categories: p.category ? [p.category] : [],
        tags: p.tags || [],
        bookingUrl: null,
        affiliateUrl: null,
        lastUpdated: new Date(),
        rank: p.rank,
        poiCategory: p.category,
      }));
    } catch (err) {
      this.catalogLogger.warn({ err }, "Live Amadeus POI search failed, returning empty");
      return [];
    }
  }

  /** Search safety ratings via live Amadeus (requires coords) */
  async searchSafety(params: CatalogSearchParams, _limit: number, _offset: number): Promise<SafetyItem[]> {
    const coords = params.destination ? await this.getDestinationCoords(params.destination) : null;
    if (!coords) return [];

    try {
      const ratings = await amadeusService.getSafetyRatings({
        latitude: coords.lat,
        longitude: coords.lng,
        radius: 5,
      });

      return ratings.map(r => ({
        id: `safety-${r.id}`,
        type: "safety" as const,
        provider: "amadeus",
        externalId: r.id,
        title: r.name,
        description: null,
        imageUrl: null,
        price: null,
        currency: "USD",
        rating: r.safetyScores?.overall ?? null,
        reviewCount: null,
        destination: params.destination || null,
        location: { lat: r.geoCode.latitude, lng: r.geoCode.longitude },
        duration: null,
        categories: ["safety"],
        tags: [],
        bookingUrl: null,
        affiliateUrl: null,
        lastUpdated: new Date(),
        subType: r.subType,
        safetyScores: r.safetyScores ?? null,
      }));
    } catch (err) {
      this.catalogLogger.warn({ err }, "Live Amadeus safety search failed, returning empty");
      return [];
    }
  }

  private async searchRestaurants(params: CatalogSearchParams, limit: number, offset: number): Promise<RestaurantItem[]> {
    const conditions = [];

    if (params.destination) {
      conditions.push(ilike(restaurantCache.city, `%${params.destination}%`));
    }
    if (params.query) {
      conditions.push(
        or(
          ilike(restaurantCache.name, `%${params.query}%`),
          ilike(restaurantCache.cuisine, `%${params.query}%`)
        )
      );
    }
    if (params.rating !== undefined) {
      conditions.push(gte(restaurantCache.rating, params.rating.toString()));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const restaurants = await db.select()
      .from(restaurantCache)
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    return restaurants.map(r => ({
      id: r.id,
      type: "restaurant" as const,
      provider: "opentable",
      externalId: r.externalId,
      title: r.name,
      description: r.description,
      imageUrl: r.imageUrl,
      price: null,
      currency: "USD",
      rating: r.rating ? parseFloat(r.rating) : null,
      reviewCount: r.reviewCount,
      destination: r.city,
      location: r.latitude && r.longitude
        ? { lat: parseFloat(r.latitude), lng: parseFloat(r.longitude) }
        : null,
      duration: null,
      categories: r.cuisine ? [r.cuisine] : ["restaurant"],
      tags: [],
      bookingUrl: r.bookingUrl,
      affiliateUrl: r.bookingUrl,
      lastUpdated: r.lastUpdated,
      cuisine: r.cuisine,
      priceLevel: r.priceLevel,
    }));
  }

  /**
   * Search transfers via live Amadeus.
   * In a generic catalog context (no specific start/end codes), returns empty.
   * For direct use, call amadeusService.searchTransfers() with specific params.
   */
  async searchTransfers(_params: CatalogSearchParams, _limit: number, _offset: number): Promise<TransferItem[]> {
    // Transfer search requires specific start/end location codes and a datetime —
    // these cannot be derived from a generic destination string alone.
    // Pages that need transfers should call amadeusService.searchTransfers() directly.
    return [];
  }

  /** Convert a live Amadeus TransferOffer into a TransferItem */
  transferOfferToItem(offer: import("./amadeus.service").TransferOffer, destination?: string): TransferItem {
    return {
      id: `transfer-${offer.id}`,
      type: "transfer" as const,
      provider: "amadeus",
      externalId: offer.id,
      title: `${offer.vehicle.description} — ${offer.transferType}`,
      description: null,
      imageUrl: null,
      price: parseFloat(offer.quotation.monetaryAmount),
      currency: offer.quotation.currencyCode,
      rating: null,
      reviewCount: null,
      destination: destination || null,
      location: null,
      duration: null,
      categories: ["transfer"],
      tags: [],
      bookingUrl: null,
      affiliateUrl: null,
      lastUpdated: new Date(),
      vehicle: {
        code: offer.vehicle.code,
        category: offer.vehicle.category,
        description: offer.vehicle.description,
        seats: offer.vehicle.seats?.[0]?.count,
      },
      quotation: {
        amount: offer.quotation.monetaryAmount,
        currencyCode: offer.quotation.currencyCode,
      },
      transferType: offer.transferType,
    };
  }

  /**
   * Look up approximate center coordinates for a destination string
   * by sampling from the activity cache.
   */
  private async getDestinationCoords(destination: string): Promise<{ lat: number; lng: number } | null> {
    const [activity] = await db
      .select({ lat: activityCache.latitude, lng: activityCache.longitude })
      .from(activityCache)
      .where(
        and(
          ilike(activityCache.destination, `%${destination}%`),
          sql`${activityCache.latitude} IS NOT NULL AND ${activityCache.longitude} IS NOT NULL`
        )
      )
      .limit(1);

    if (activity?.lat && activity?.lng) {
      return { lat: parseFloat(activity.lat), lng: parseFloat(activity.lng) };
    }
    return null;
  }

  // ─── Experience type / tab helpers ─────────

  async getExperienceTypeWithTabs(slug: string): Promise<{
    experienceType: typeof experienceTypes.$inferSelect | null;
    tabs: TemplateWithFilters[];
    universalFilters: {
      id: string;
      name: string;
      slug: string;
      filterType: string | null;
      icon: string | null;
      options: { label: string; value: string; icon: string | null }[];
    }[];
  }> {
    const startTime = Date.now();

    const [expType] = await db.select()
      .from(experienceTypes)
      .where(eq(experienceTypes.slug, slug))
      .limit(1);

    if (!expType) {
      return { experienceType: null, tabs: [], universalFilters: [] };
    }

    const tabs = await db.select()
      .from(experienceTemplateTabs)
      .where(eq(experienceTemplateTabs.experienceTypeId, expType.id))
      .orderBy(asc(experienceTemplateTabs.sortOrder));

    const tabsWithFilters: TemplateWithFilters[] = await Promise.all(
      tabs.map(async (tab) => {
        const filters = await db.select()
          .from(experienceTemplateFilters)
          .where(eq(experienceTemplateFilters.tabId, tab.id))
          .orderBy(asc(experienceTemplateFilters.sortOrder));

        const filtersWithOptions = await Promise.all(
          filters.map(async (filter) => {
            const options = await db.select()
              .from(experienceTemplateFilterOptions)
              .where(eq(experienceTemplateFilterOptions.filterId, filter.id))
              .orderBy(asc(experienceTemplateFilterOptions.sortOrder));

            return {
              id: filter.id,
              name: filter.name,
              slug: filter.slug,
              filterType: filter.filterType,
              icon: filter.icon,
              options: options.map(o => ({
                label: o.label,
                value: o.value,
                icon: o.icon,
              })),
            };
          })
        );

        return {
          id: tab.id,
          experienceTypeId: tab.experienceTypeId,
          name: tab.name,
          slug: tab.slug,
          description: tab.description,
          icon: tab.icon,
          sortOrder: tab.sortOrder,
          filters: filtersWithOptions,
        };
      })
    );

    const universalFiltersRaw = await db.select()
      .from(experienceUniversalFilters)
      .where(eq(experienceUniversalFilters.experienceTypeId, expType.id))
      .orderBy(asc(experienceUniversalFilters.sortOrder));

    const universalFilters = await Promise.all(
      universalFiltersRaw.map(async (uf) => {
        const options = await db.select()
          .from(experienceUniversalFilterOptions)
          .where(eq(experienceUniversalFilterOptions.filterId, uf.id))
          .orderBy(asc(experienceUniversalFilterOptions.sortOrder));

        return {
          id: uf.id,
          name: uf.name,
          slug: uf.slug,
          filterType: uf.filterType,
          icon: uf.icon,
          options: options.map(o => ({
            label: o.label,
            value: o.value,
            icon: o.icon,
          })),
        };
      })
    );

    const duration = (Date.now() - startTime) / 1000;
    databaseQueryDuration.labels("experience_type_with_tabs", "read").observe(duration);

    this.catalogLogger.debug({ slug, tabCount: tabs.length, duration }, "Fetched experience type with tabs");

    return {
      experienceType: expType,
      tabs: tabsWithFilters,
      universalFilters,
    };
  }

  async getCatalogItem(id: string, type: string): Promise<CatalogItem | null> {
    const startTime = Date.now();

    try {
      if (type === "activity") {
        const [activity] = await db.select()
          .from(activityCache)
          .where(eq(activityCache.id, id))
          .limit(1);

        if (!activity) return null;

        return {
          id: activity.id,
          type: "activity",
          provider: activity.provider || "viator",
          externalId: activity.productCode,
          title: activity.title,
          description: activity.description,
          imageUrl: activity.imageUrl,
          price: activity.price ? parseFloat(activity.price) : null,
          currency: activity.currency || "USD",
          rating: activity.rating ? parseFloat(activity.rating) : null,
          reviewCount: activity.reviewCount,
          destination: activity.destination,
          location: activity.latitude && activity.longitude 
            ? { lat: parseFloat(activity.latitude), lng: parseFloat(activity.longitude) }
            : null,
          duration: activity.durationMinutes ? `${activity.durationMinutes} minutes` : null,
          categories: activity.category ? [activity.category] : [],
          tags: (activity.tags as string[]) || [],
          bookingUrl: null,
          affiliateUrl: null,
          lastUpdated: activity.lastUpdated,
        };
      }

      if (type === "event") {
        const [event] = await db.select()
          .from(feverEventCache)
          .where(eq(feverEventCache.id, id))
          .limit(1);

        if (!event) return null;

        return {
          id: event.id,
          type: "event",
          provider: event.provider || "fever",
          externalId: event.eventId,
          title: event.title,
          description: event.description,
          imageUrl: event.imageUrl,
          price: event.minPrice ? parseFloat(event.minPrice) : null,
          currency: event.currency || "USD",
          rating: event.rating ? parseFloat(event.rating) : null,
          reviewCount: event.reviewCount,
          destination: event.city,
          location: event.latitude && event.longitude 
            ? { lat: parseFloat(event.latitude), lng: parseFloat(event.longitude) }
            : null,
          duration: null,
          categories: event.category ? [event.category] : [],
          tags: (event.tags as string[]) || [],
          bookingUrl: event.bookingUrl,
          affiliateUrl: event.affiliateUrl,
          lastUpdated: event.lastUpdated,
          dates: event.startDate || event.endDate
            ? { start: event.startDate, end: event.endDate }
            : null,
          isFree: event.isFree ?? false,
          isSoldOut: event.isSoldOut ?? false,
          venueName: event.venueName,
        };
      }

      if (type === "hotel") {
        const [hotel] = await db.select()
          .from(hotelCache)
          .where(eq(hotelCache.id, id))
          .limit(1);

        if (!hotel) return null;

        const media = hotel.media as { url?: string }[] | null;
        const firstImage = media && media.length > 0 ? media[0].url : null;

        return {
          id: hotel.id,
          type: "hotel",
          provider: hotel.provider || "amadeus",
          externalId: hotel.hotelId,
          title: hotel.name,
          description: hotel.address,
          imageUrl: firstImage || null,
          price: null,
          currency: "USD",
          rating: hotel.rating ? parseFloat(hotel.rating) : null,
          reviewCount: hotel.reviewCount,
          destination: hotel.city,
          location: hotel.latitude && hotel.longitude 
            ? { lat: parseFloat(hotel.latitude), lng: parseFloat(hotel.longitude) }
            : null,
          duration: null,
          categories: (hotel.amenities as string[]) || [],
          tags: [],
          bookingUrl: null,
          affiliateUrl: null,
          lastUpdated: hotel.lastUpdated,
          amenities: (hotel.amenities as string[]) || [],
        };
      }

      if (type === "poi") {
        const [poi] = await db.select()
          .from(poiCache)
          .where(eq(poiCache.id, id))
          .limit(1);

        if (!poi) return null;

        return {
          id: poi.id,
          type: "poi",
          provider: "amadeus",
          externalId: poi.amadeusId,
          title: poi.name,
          description: null,
          imageUrl: null,
          price: null,
          currency: "USD",
          rating: null,
          reviewCount: null,
          destination: poi.city,
          location: { lat: parseFloat(poi.latitude), lng: parseFloat(poi.longitude) },
          duration: null,
          categories: poi.category ? [poi.category] : [],
          tags: (poi.tags as string[]) || [],
          bookingUrl: null,
          affiliateUrl: null,
          lastUpdated: poi.lastUpdated,
          rank: poi.rank,
          poiCategory: poi.category,
        };
      }

      if (type === "transfer") {
        const [transfer] = await db.select()
          .from(transferCache)
          .where(eq(transferCache.id, id))
          .limit(1);

        if (!transfer) return null;

        return {
          id: transfer.id,
          type: "transfer",
          provider: transfer.provider || "amadeus",
          externalId: transfer.offerId,
          title: transfer.vehicleDescription
            ? `${transfer.vehicleDescription} — ${transfer.transferType}`
            : `Transfer — ${transfer.transferType}`,
          description: null,
          imageUrl: null,
          price: transfer.price ? parseFloat(transfer.price) : null,
          currency: transfer.currency || "USD",
          rating: null,
          reviewCount: null,
          destination: transfer.endCityName,
          location: transfer.endLatitude && transfer.endLongitude
            ? { lat: parseFloat(transfer.endLatitude), lng: parseFloat(transfer.endLongitude) }
            : null,
          duration: null,
          categories: ["transfer"],
          tags: [],
          bookingUrl: null,
          affiliateUrl: null,
          lastUpdated: transfer.lastUpdated,
          vehicle: transfer.vehicleCode
            ? {
                code: transfer.vehicleCode,
                category: transfer.vehicleCategory || "",
                description: transfer.vehicleDescription || "",
                seats: transfer.maxSeats ?? undefined,
              }
            : null,
          quotation: transfer.price
            ? { amount: transfer.price, currencyCode: transfer.currency || "USD" }
            : null,
          transferType: transfer.transferType,
        };
      }

      if (type === "safety") {
        // Safety items are served live from Amadeus (not cached); not retrievable by UUID.
        // Return null to surface a 404 — callers should use live safety search instead.
        return null;
      }

      return null;
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      databaseQueryDuration.labels("catalog_item_detail", "read").observe(duration);
    }
  }

  async getDestinations(): Promise<string[]> {
    const minLen = 3;
    const activities = await db.selectDistinct({ destination: activityCache.destination })
      .from(activityCache)
      .where(sql`${activityCache.destination} IS NOT NULL AND length(${activityCache.destination}) >= ${minLen}`)
      .limit(100);

    const events = await db.selectDistinct({ city: feverEventCache.city })
      .from(feverEventCache)
      .where(sql`${feverEventCache.city} IS NOT NULL AND length(${feverEventCache.city}) >= ${minLen}`)
      .limit(100);

    const hotels = await db.selectDistinct({ city: hotelCache.city })
      .from(hotelCache)
      .where(sql`${hotelCache.city} IS NOT NULL AND length(${hotelCache.city}) >= ${minLen}`)
      .limit(100);

    const allDestinations = [
      ...activities.map(a => a.destination),
      ...events.map(e => e.city),
      ...hotels.map(h => h.city),
    ].filter((d): d is string => d !== null);

    const isValidDestination = (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length < 3) return false;
      if (/^[a-z\s]+$/.test(trimmed) && !trimmed.includes(' ') && trimmed.length < 5) return false;
      const known = ['amsterdam','barcelona','berlin','bogotá','buenos aires','cartagena','delhi',
        'dublin','edinburgh','goa','hong kong','jaipur','kyoto','lisbon','london','los angeles',
        'madrid','mexico city','milan','mumbai','new york','paris','porto','rome','seoul',
        'singapore','sydney','são paulo','tokyo','thailand','california'];
      const lower = trimmed.toLowerCase().replace(/[,;].*$/, '').trim();
      if (known.includes(lower)) return true;
      if (/\b(france|italy|japan|spain|usa|uk)\b/i.test(trimmed) && trimmed.includes(',')) return true;
      const words = trimmed.split(/\s+/);
      if (words.length === 1 && trimmed.length < 5 && !/^[A-Z]/.test(trimmed)) return false;
      if (/^[A-Z]/.test(trimmed) && trimmed.length >= 3) return true;
      return false;
    };

    const seen = new Map<string, string>();
    for (const d of allDestinations) {
      if (!isValidDestination(d)) continue;
      const trimmed = d.trim();
      const key = trimmed.toLowerCase();
      if (!seen.has(key) || /^[A-Z]/.test(trimmed)) {
        const normalized = trimmed.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        seen.set(key, normalized);
      }
    }
    return Array.from(seen.values()).sort();
  }

  async searchWithSerpFallback(params: CatalogSearchParams & {
    enableSerpFallback?: boolean;
    templateSlug?: string;
    minNativeResults?: number;
  }): Promise<CatalogSearchResult & {
    serpResults: import("@shared/schema").SerpResult[];
    usedSerpFallback: boolean;
  }> {
    const minNative = params.minNativeResults || 5;
    
    const nativeResult = await this.searchCatalog(params);
    
    if (!params.enableSerpFallback || nativeResult.items.length >= minNative) {
      return {
        ...nativeResult,
        serpResults: [],
        usedSerpFallback: false
      };
    }

    this.catalogLogger.info({
      nativeCount: nativeResult.items.length,
      minNative,
      destination: params.destination,
      template: params.templateSlug
    }, "Native results sparse, attempting SERP fallback");

    try {
      const serpModule = await import("./serp.service");
      const { serpService } = serpModule;
      type EnrichedVenue = import("./serp.service").EnrichedVenue;
      
      let serpResults: EnrichedVenue[] = [];
      
      if (params.destination) {
        const queryParams = serpService.buildQueryForTemplate(
          params.experienceTypeSlug || "travel",
          params.destination,
          params.templateSlug || "travel",
          {}
        );

        serpResults = await serpService.searchAttractions(
          params.destination,
          "",
          queryParams.query
        );
      }

      const formattedSerpResults: import("@shared/schema").SerpResult[] = serpResults.map(r => ({
        id: r.id || `serp-${crypto.randomUUID()}`,
        name: r.name || "Unknown",
        rating: r.rating ?? null,
        reviewCount: r.reviewCount ?? null,
        priceLevel: r.priceLevel ?? null,
        address: r.address ?? null,
        phone: r.phone ?? null,
        website: r.website ?? null,
        imageUrl: r.thumbnail ?? null,
        source: "serp" as const,
        isPartner: false as const
      }));

      this.catalogLogger.info({
        serpResultCount: formattedSerpResults.length
      }, "SERP fallback completed");

      return {
        ...nativeResult,
        serpResults: formattedSerpResults,
        usedSerpFallback: formattedSerpResults.length > 0
      };
    } catch (error) {
      this.catalogLogger.error({ error }, "SERP fallback failed");
      return {
        ...nativeResult,
        serpResults: [],
        usedSerpFallback: false
      };
    }
  }
}

export const experienceCatalogService = new ExperienceCatalogService();
