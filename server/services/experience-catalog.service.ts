import { db } from "../db";
import { 
  activityCache, 
  hotelCache, 
  feverEventCache,
  experienceTypes,
  experienceTemplateTabs,
  experienceTemplateFilters,
  experienceTemplateFilterOptions,
  experienceUniversalFilters,
  experienceUniversalFilterOptions
} from "@shared/schema";
import { eq, and, or, ilike, gte, lte, asc, sql } from "drizzle-orm";
import { logger, databaseQueryDuration } from "../infrastructure";

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
}

export interface CatalogItem {
  id: string;
  type: "activity" | "hotel" | "event" | "flight";
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
  lastUpdated: Date | null;
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

class ExperienceCatalogService {
  private catalogLogger = logger.child({ service: "experience-catalog" });

  async searchCatalog(params: CatalogSearchParams): Promise<CatalogSearchResult> {
    const startTime = Date.now();
    const limit = params.limit || 20;
    const offset = params.offset || 0;
    
    this.catalogLogger.debug({ params }, "Searching experience catalog");

    const items: CatalogItem[] = [];
    const providers = params.providers || ["viator", "fever", "amadeus"];

    if (providers.includes("viator")) {
      const activities = await this.searchActivities(params, limit, offset);
      items.push(...activities);
    }

    if (providers.includes("fever")) {
      const events = await this.searchEvents(params, limit, offset);
      items.push(...events);
    }

    if (providers.includes("amadeus")) {
      const hotels = await this.searchHotels(params, limit, offset);
      items.push(...hotels);
    }

    let sortedItems = items;
    if (params.sortBy === "price_low") {
      sortedItems = items.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (params.sortBy === "price_high") {
      sortedItems = items.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (params.sortBy === "rating") {
      sortedItems = items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    const destinationSet = new Set<string>();
    items.forEach(i => { if (i.destination) destinationSet.add(i.destination); });
    const destinations = Array.from(destinationSet);

    const prices = items.map(i => i.price).filter((p): p is number => p !== null);
    
    const providerSet = new Set<string>();
    items.forEach(i => providerSet.add(i.provider));
    
    const duration = (Date.now() - startTime) / 1000;
    databaseQueryDuration.labels("catalog_search", "read").observe(duration);
    
    this.catalogLogger.info({ 
      resultCount: sortedItems.length, 
      duration,
      providers 
    }, "Catalog search completed");

    return {
      items: sortedItems.slice(0, limit),
      total: sortedItems.length,
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

  private async searchActivities(params: CatalogSearchParams, limit: number, offset: number): Promise<CatalogItem[]> {
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
      lastUpdated: a.lastUpdated,
    }));
  }

  private async searchEvents(params: CatalogSearchParams, limit: number, offset: number): Promise<CatalogItem[]> {
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
      lastUpdated: e.lastUpdated,
    }));
  }

  private async searchHotels(params: CatalogSearchParams, limit: number, offset: number): Promise<CatalogItem[]> {
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
        lastUpdated: h.lastUpdated,
      };
    });
  }

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
          lastUpdated: event.lastUpdated,
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
          lastUpdated: hotel.lastUpdated,
        };
      }

      return null;
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      databaseQueryDuration.labels("catalog_item_detail", "read").observe(duration);
    }
  }

  async getDestinations(): Promise<string[]> {
    const activities = await db.selectDistinct({ destination: activityCache.destination })
      .from(activityCache)
      .where(sql`${activityCache.destination} IS NOT NULL`)
      .limit(100);

    const events = await db.selectDistinct({ city: feverEventCache.city })
      .from(feverEventCache)
      .where(sql`${feverEventCache.city} IS NOT NULL`)
      .limit(100);

    const hotels = await db.selectDistinct({ city: hotelCache.city })
      .from(hotelCache)
      .where(sql`${hotelCache.city} IS NOT NULL`)
      .limit(100);

    const allDestinations = [
      ...activities.map(a => a.destination),
      ...events.map(e => e.city),
      ...hotels.map(h => h.city),
    ].filter((d): d is string => d !== null);

    const uniqueDestinations = Array.from(new Set(allDestinations));
    return uniqueDestinations.sort();
  }
}

export const experienceCatalogService = new ExperienceCatalogService();
