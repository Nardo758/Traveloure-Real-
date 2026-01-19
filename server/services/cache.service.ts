import { db } from "../db";
import { hotelCache, hotelOfferCache, activityCache, flightCache, locationCache } from "@shared/schema";
import { eq, and, gte, lte, ilike, or, sql, inArray } from "drizzle-orm";
import { HotelOffer, AmadeusService } from "./amadeus.service";
import { ViatorProduct, viatorService } from "./viator.service";

const CACHE_DURATION_HOURS = 24;

// ============ PREFERENCE TAG INFERENCE ============
// Infers preference tags based on hotel data (amenities, name, price, etc.)
function inferHotelPreferenceTags(hotel: any, offers: any[]): string[] {
  const tags: string[] = [];
  const name = (hotel.name || "").toLowerCase();
  const amenities = (hotel.amenities || []).map((a: string) => a.toLowerCase());
  
  // Price-based tags
  const avgPrice = offers.length > 0 
    ? offers.reduce((sum: number, o: any) => sum + parseFloat(o.price?.total || "0"), 0) / offers.length
    : 0;
  if (avgPrice > 0 && avgPrice <= 150) tags.push("budget");
  if (avgPrice > 300) tags.push("luxury");
  
  // Amenity-based tags
  if (amenities.some((a: string) => a.includes("pool") || a.includes("beach"))) tags.push("beach");
  if (amenities.some((a: string) => a.includes("spa") || a.includes("wellness"))) tags.push("wellness_spa");
  if (amenities.some((a: string) => a.includes("business") || a.includes("meeting"))) tags.push("business");
  if (amenities.some((a: string) => a.includes("family") || a.includes("kids") || a.includes("playground"))) tags.push("family");
  
  // Name-based tags
  if (name.includes("resort") || name.includes("luxury") || name.includes("palace")) tags.push("luxury");
  if (name.includes("boutique")) tags.push("romantic");
  if (name.includes("downtown") || name.includes("city center")) tags.push("city");
  
  // Rating-based tags
  const rating = parseInt(hotel.rating) || 0;
  if (rating >= 4) tags.push("luxury");
  if (rating <= 2) tags.push("budget");
  
  return Array.from(new Set(tags)); // Remove duplicates
}

// Infers preference tags based on activity data (flags, tags, title, description)
function inferActivityPreferenceTags(activity: ViatorProduct): string[] {
  const tags: string[] = [];
  const title = (activity.title || "").toLowerCase();
  const description = (activity.description || "").toLowerCase();
  const activityTags = (activity.tags || []).map((t: any) => (typeof t === 'string' ? t : t.tag || "").toLowerCase());
  const flags = (activity.flags || []).map((f: string) => f.toLowerCase());
  
  // Price-based tags
  const price = activity.pricing?.summary?.fromPrice || 0;
  if (price > 0 && price <= 50) tags.push("budget");
  if (price > 200) tags.push("luxury");
  
  // Category-based inference
  if (activityTags.some((t: string) => t.includes("museum") || t.includes("art"))) {
    tags.push("art_museums");
    tags.push("culture_history");
  }
  if (activityTags.some((t: string) => t.includes("food") || t.includes("dining") || t.includes("culinary"))) tags.push("food_dining");
  if (activityTags.some((t: string) => t.includes("nature") || t.includes("outdoor") || t.includes("park") || t.includes("hiking"))) {
    tags.push("nature_outdoors");
    tags.push("nature");
  }
  if (activityTags.some((t: string) => t.includes("adventure") || t.includes("extreme") || t.includes("sport"))) tags.push("adventure");
  if (activityTags.some((t: string) => t.includes("nightlife") || t.includes("club") || t.includes("bar"))) tags.push("nightlife");
  if (activityTags.some((t: string) => t.includes("shopping") || t.includes("market"))) tags.push("shopping");
  if (activityTags.some((t: string) => t.includes("spa") || t.includes("wellness") || t.includes("relax"))) tags.push("wellness_spa");
  if (activityTags.some((t: string) => t.includes("beach") || t.includes("coastal") || t.includes("sea"))) tags.push("beach");
  if (activityTags.some((t: string) => t.includes("family") || t.includes("kid"))) tags.push("family");
  if (activityTags.some((t: string) => t.includes("romantic") || t.includes("couple"))) tags.push("romantic");
  if (activityTags.some((t: string) => t.includes("city") || t.includes("urban") || t.includes("walking tour"))) tags.push("city");
  if (activityTags.some((t: string) => t.includes("history") || t.includes("heritage") || t.includes("historical"))) tags.push("culture_history");
  
  // Title/description-based inference
  if (title.includes("museum") || description.includes("museum")) tags.push("art_museums");
  if (title.includes("tour") && (title.includes("food") || title.includes("culinary"))) tags.push("food_dining");
  if (title.includes("adventure") || description.includes("adventure")) tags.push("adventure");
  if (title.includes("sunset") || title.includes("romantic")) tags.push("romantic");
  
  // Flags-based inference
  if (flags.includes("bestseller") || flags.includes("likely_to_sell_out")) tags.push("group");
  if (flags.includes("private_tour")) tags.push("solo");
  
  return Array.from(new Set(tags)); // Remove duplicates
}

// Infers category from activity data
function inferActivityCategory(activity: ViatorProduct): { category: string; subcategory: string | null } {
  const activityTags = (activity.tags || []).map((t: any) => (typeof t === 'string' ? t : t.tag || "").toLowerCase());
  const title = (activity.title || "").toLowerCase();
  
  // Map common activity types to categories
  if (activityTags.some((t: string) => t.includes("tour"))) {
    if (title.includes("food") || title.includes("culinary")) return { category: "Food & Dining", subcategory: "Food Tours" };
    if (title.includes("walking")) return { category: "Tours", subcategory: "Walking Tours" };
    if (title.includes("bus") || title.includes("hop")) return { category: "Tours", subcategory: "Bus Tours" };
    return { category: "Tours", subcategory: null };
  }
  if (activityTags.some((t: string) => t.includes("museum") || t.includes("art"))) return { category: "Culture & History", subcategory: "Museums" };
  if (activityTags.some((t: string) => t.includes("outdoor") || t.includes("nature"))) return { category: "Nature & Outdoors", subcategory: null };
  if (activityTags.some((t: string) => t.includes("adventure"))) return { category: "Adventure", subcategory: null };
  if (activityTags.some((t: string) => t.includes("wellness") || t.includes("spa"))) return { category: "Wellness & Spa", subcategory: null };
  if (activityTags.some((t: string) => t.includes("nightlife"))) return { category: "Nightlife", subcategory: null };
  if (activityTags.some((t: string) => t.includes("shopping"))) return { category: "Shopping", subcategory: null };
  
  return { category: "Experiences", subcategory: null };
}

function getExpirationDate(): Date {
  const date = new Date();
  date.setHours(date.getHours() + CACHE_DURATION_HOURS);
  return date;
}

function isCacheValid(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) > new Date();
}

export class CacheService {
  private amadeusService: AmadeusService;

  constructor() {
    this.amadeusService = new AmadeusService();
  }

  // ============ HOTEL CACHING ============

  async getCachedHotels(cityCode: string): Promise<any[]> {
    const cached = await db.select()
      .from(hotelCache)
      .where(and(
        eq(hotelCache.cityCode, cityCode),
        gte(hotelCache.expiresAt, new Date())
      ));
    
    return cached;
  }

  async cacheHotels(hotels: HotelOffer[], cityCode: string, locationInfo?: { city?: string; state?: string; county?: string; countryCode?: string; countryName?: string }): Promise<void> {
    const expiresAt = getExpirationDate();

    for (const hotelData of hotels) {
      const hotel = hotelData.hotel;
      
      // Infer preference tags based on hotel data
      const preferenceTags = inferHotelPreferenceTags(hotel, hotelData.offers || []);
      
      // Parse star rating from rating field
      const starRating = hotel.rating ? parseInt(hotel.rating) : null;
      
      // Calculate popularity score based on reviews and rating
      const popularityScore = starRating ? starRating * 20 : 0;
      
      const existingHotel = await db.select()
        .from(hotelCache)
        .where(eq(hotelCache.hotelId, hotel.hotelId))
        .limit(1);

      const hotelValues = {
        name: hotel.name,
        latitude: hotel.latitude?.toString(),
        longitude: hotel.longitude?.toString(),
        address: hotel.address?.lines?.join(", "),
        // Enhanced location fields
        city: locationInfo?.city || hotel.address?.cityName,
        state: locationInfo?.state || (hotel.address as any)?.stateCode,
        county: locationInfo?.county,
        countryCode: locationInfo?.countryCode || hotel.address?.countryCode,
        countryName: locationInfo?.countryName,
        postalCode: (hotel.address as any)?.postalCode,
        // Provider and rating
        provider: "amadeus",
        rating: hotel.rating,
        starRating,
        reviewCount: 0,
        popularityScore,
        // Preference tags
        preferenceTags,
        amenities: hotel.amenities || [],
        media: hotel.media || [],
        rawData: hotelData,
        expiresAt,
      };

      if (existingHotel.length > 0) {
        await db.update(hotelCache)
          .set({
            ...hotelValues,
            lastUpdated: new Date(),
          })
          .where(eq(hotelCache.hotelId, hotel.hotelId));

        if (hotelData.offers) {
          for (const offer of hotelData.offers) {
            await this.cacheHotelOffer(existingHotel[0].id, offer, expiresAt);
          }
        }
      } else {
        const [newHotel] = await db.insert(hotelCache)
          .values({
            hotelId: hotel.hotelId,
            cityCode: cityCode,
            ...hotelValues,
          })
          .returning();

        if (hotelData.offers) {
          for (const offer of hotelData.offers) {
            await this.cacheHotelOffer(newHotel.id, offer, expiresAt);
          }
        }
      }
    }
  }

  private async cacheHotelOffer(hotelCacheId: string, offer: any, expiresAt: Date): Promise<void> {
    const existing = await db.select()
      .from(hotelOfferCache)
      .where(eq(hotelOfferCache.offerId, offer.id))
      .limit(1);

    if (existing.length > 0) {
      await db.update(hotelOfferCache)
        .set({
          checkInDate: offer.checkInDate,
          checkOutDate: offer.checkOutDate,
          roomType: offer.room?.type,
          roomDescription: offer.room?.description?.text,
          price: offer.price?.total,
          currency: offer.price?.currency || "USD",
          rawData: offer,
          lastUpdated: new Date(),
          expiresAt,
        })
        .where(eq(hotelOfferCache.offerId, offer.id));
    } else {
      await db.insert(hotelOfferCache)
        .values({
          hotelCacheId,
          offerId: offer.id,
          checkInDate: offer.checkInDate,
          checkOutDate: offer.checkOutDate,
          roomType: offer.room?.type,
          roomDescription: offer.room?.description?.text,
          price: offer.price?.total,
          currency: offer.price?.currency || "USD",
          rawData: offer,
          expiresAt,
        });
    }
  }

  async getHotelsWithCache(params: {
    cityCode: string;
    checkInDate: string;
    checkOutDate: string;
    adults: number;
    roomQuantity?: number;
    currency?: string;
  }): Promise<{ data: any[]; fromCache: boolean; lastUpdated?: Date }> {
    const cached = await this.getCachedHotels(params.cityCode);
    const currency = params.currency || 'USD';
    
    if (cached.length > 0) {
      // Filter offers by date range and currency, fetch from hotelOfferCache
      const hotelsWithOffers = await Promise.all(cached.map(async (h) => {
        const offers = await db.select()
          .from(hotelOfferCache)
          .where(and(
            eq(hotelOfferCache.hotelCacheId, h.id),
            eq(hotelOfferCache.checkInDate, params.checkInDate),
            eq(hotelOfferCache.checkOutDate, params.checkOutDate),
            eq(hotelOfferCache.currency, currency),
            gte(hotelOfferCache.expiresAt, new Date())
          ));

        return {
          hotel: {
            hotelId: h.hotelId,
            name: h.name,
            cityCode: h.cityCode,
            latitude: parseFloat(h.latitude || "0"),
            longitude: parseFloat(h.longitude || "0"),
            address: h.address ? { lines: [h.address] } : undefined,
            rating: h.rating,
            amenities: h.amenities,
            media: h.media,
          },
          offers: offers.map(o => ({
            id: o.offerId,
            checkInDate: o.checkInDate,
            checkOutDate: o.checkOutDate,
            room: {
              type: o.roomType,
              description: { text: o.roomDescription },
            },
            price: {
              total: o.price,
              currency: o.currency,
            },
            ...(typeof o.rawData === 'object' && o.rawData !== null ? o.rawData as Record<string, unknown> : {}),
          })),
          _cached: true,
          _lastUpdated: h.lastUpdated,
        };
      }));
      
      // Only return hotels that have matching offers for this specific search
      const hotelsWithMatchingOffers = hotelsWithOffers.filter(h => h.offers.length > 0);
      
      if (hotelsWithMatchingOffers.length > 0) {
        return { 
          data: hotelsWithMatchingOffers, 
          fromCache: true, 
          lastUpdated: cached[0]?.lastUpdated || undefined 
        };
      }
    }

    // Fetch from API (cache miss or no matching offers for these dates/currency)
    const hotels = await this.amadeusService.searchHotels(params);
    
    // Cache the results
    await this.cacheHotels(hotels, params.cityCode);
    
    return { data: hotels, fromCache: false };
  }

  // ============ ACTIVITY CACHING ============

  async getCachedActivities(destination: string): Promise<any[]> {
    const cached = await db.select()
      .from(activityCache)
      .where(and(
        eq(activityCache.destination, destination.toLowerCase()),
        gte(activityCache.expiresAt, new Date())
      ));
    
    return cached;
  }

  async cacheActivities(activities: ViatorProduct[], destination: string, locationInfo?: { city?: string; state?: string; county?: string; countryCode?: string; countryName?: string }): Promise<void> {
    const expiresAt = getExpirationDate();

    for (const activity of activities) {
      // Extract coordinates from logistics if available
      let latitude: number | null = null;
      let longitude: number | null = null;
      let meetingPoint: string | null = null;
      let address: string | null = null;

      if (activity.logistics?.start?.[0]?.location?.coordinates) {
        latitude = activity.logistics.start[0].location.coordinates.latitude;
        longitude = activity.logistics.start[0].location.coordinates.longitude;
        meetingPoint = activity.logistics.start[0].location.name || 
                       activity.logistics.start[0].description || null;
        const locationAddress = activity.logistics.start[0].location.address;
        address = locationAddress ? `${locationAddress.street || ""}, ${locationAddress.city || ""}, ${locationAddress.state || ""}, ${locationAddress.country || ""}`.replace(/^[, ]+|[, ]+$/g, "").replace(/, ,/g, ",") : null;
      }

      // Get image URL
      const imageUrl = activity.images?.[0]?.variants?.find(v => v.width >= 400)?.url || 
                       activity.images?.[0]?.variants?.[0]?.url || null;

      // Calculate duration
      let durationMinutes: number | null = null;
      if (activity.duration?.fixedDurationInMinutes) {
        durationMinutes = activity.duration.fixedDurationInMinutes;
      } else if (activity.duration?.variableDurationFromMinutes) {
        durationMinutes = activity.duration.variableDurationFromMinutes;
      }

      // Infer preference tags and category
      const preferenceTags = inferActivityPreferenceTags(activity);
      const { category, subcategory } = inferActivityCategory(activity);
      
      // Calculate popularity score based on reviews
      const reviewCount = activity.reviews?.totalReviews || 0;
      const rating = activity.reviews?.combinedAverageRating || 0;
      const popularityScore = Math.round(reviewCount * 0.1 + rating * 20);

      const existing = await db.select()
        .from(activityCache)
        .where(eq(activityCache.productCode, activity.productCode))
        .limit(1);

      const activityValues = {
        destination: destination.toLowerCase(),
        title: activity.title,
        description: activity.description,
        latitude: latitude?.toString(),
        longitude: longitude?.toString(),
        meetingPoint,
        // Enhanced location fields
        address,
        city: locationInfo?.city,
        state: locationInfo?.state,
        county: locationInfo?.county,
        countryCode: locationInfo?.countryCode,
        countryName: locationInfo?.countryName,
        // Provider and categorization
        provider: "viator",
        category,
        subcategory,
        preferenceTags,
        popularityScore,
        // Existing fields
        durationMinutes,
        price: activity.pricing?.summary?.fromPrice?.toString(),
        currency: activity.pricing?.currency || "USD",
        rating: activity.reviews?.combinedAverageRating?.toString(),
        reviewCount: activity.reviews?.totalReviews || 0,
        imageUrl,
        flags: activity.flags || [],
        tags: activity.tags || [],
        rawData: activity,
        expiresAt,
      };

      if (existing.length > 0) {
        await db.update(activityCache)
          .set({
            ...activityValues,
            lastUpdated: new Date(),
          })
          .where(eq(activityCache.productCode, activity.productCode));
      } else {
        await db.insert(activityCache)
          .values({
            productCode: activity.productCode,
            ...activityValues,
          });
      }
    }
  }

  async getActivitiesWithCache(destination: string, currency: string = "USD", count: number = 20): Promise<{ data: any[]; fromCache: boolean; lastUpdated?: Date }> {
    const cached = await this.getCachedActivities(destination);
    
    if (cached.length > 0) {
      const activitiesWithLocation = cached.map(a => ({
        productCode: a.productCode,
        title: a.title,
        description: a.description,
        latitude: a.latitude ? parseFloat(a.latitude) : null,
        longitude: a.longitude ? parseFloat(a.longitude) : null,
        meetingPoint: a.meetingPoint,
        duration: a.durationMinutes ? { fixedDurationInMinutes: a.durationMinutes } : undefined,
        pricing: {
          summary: { fromPrice: parseFloat(a.price || "0") },
          currency: a.currency,
        },
        reviews: {
          combinedAverageRating: a.rating ? parseFloat(a.rating) : null,
          totalReviews: a.reviewCount,
        },
        images: a.imageUrl ? [{ variants: [{ url: a.imageUrl }] }] : [],
        flags: a.flags,
        _cached: true,
        _lastUpdated: a.lastUpdated,
      }));
      
      return { data: activitiesWithLocation, fromCache: true, lastUpdated: cached[0]?.lastUpdated || undefined };
    }

    // Fetch from API
    const result = await viatorService.searchByFreetext(destination, currency, count);
    
    if (result.products && result.products.length > 0) {
      await this.cacheActivities(result.products, destination);
    }
    
    return { data: result.products || [], fromCache: false };
  }

  // ============ AVAILABILITY CHECK ============

  async verifyHotelAvailability(
    hotelId: string, 
    checkInDate: string, 
    checkOutDate: string,
    options?: { adults?: number; rooms?: number; currency?: string }
  ): Promise<{ available: boolean; currentPrice?: number; priceChanged?: boolean; cachedPrice?: number }> {
    try {
      // Get cached data to compare prices
      const cached = await db.select()
        .from(hotelCache)
        .where(eq(hotelCache.hotelId, hotelId))
        .limit(1);

      if (cached.length === 0) {
        return { available: false };
      }

      const cachedRawData = cached[0].rawData as any;
      const cachedPrice = cachedRawData?.offers?.[0]?.price?.total 
        ? parseFloat(cachedRawData.offers[0].price.total) 
        : undefined;

      // Use provided options or fall back to cached/defaults
      const adults = options?.adults || cachedRawData?.offers?.[0]?.guests?.adults || 2;
      const rooms = options?.rooms || 1;
      const currency = options?.currency || cachedRawData?.offers?.[0]?.price?.currency || 'USD';

      // Call Amadeus API to verify current availability
      // Note: Amadeus hotel search returns offers, so we search for this specific hotel
      try {
        const liveResult = await this.amadeusService.searchHotels({
          cityCode: cached[0].cityCode,
          checkInDate,
          checkOutDate,
          adults,
          roomQuantity: rooms,
          currency,
        });

        // Find the specific hotel in results
        const matchingHotel = liveResult.find(h => h.hotel.hotelId === hotelId);
        
        if (!matchingHotel || !matchingHotel.offers || matchingHotel.offers.length === 0) {
          return { available: false, cachedPrice };
        }

        const currentPrice = parseFloat(matchingHotel.offers[0].price.total);
        const priceChanged = cachedPrice !== undefined && Math.abs(currentPrice - cachedPrice) > 0.01;

        return { 
          available: true, 
          currentPrice,
          cachedPrice,
          priceChanged,
        };
      } catch (apiError) {
        console.error("Live hotel availability check failed, using cached data:", apiError);
        // Fall back to cached data if API fails
        return { 
          available: true, 
          currentPrice: cachedPrice,
          cachedPrice,
          priceChanged: false,
        };
      }
    } catch (error) {
      console.error("Hotel availability check error:", error);
      return { available: false };
    }
  }

  async verifyActivityAvailability(productCode: string, travelDate?: string): Promise<{ available: boolean; currentPrice?: number; priceChanged?: boolean; cachedPrice?: number }> {
    try {
      const cached = await db.select()
        .from(activityCache)
        .where(eq(activityCache.productCode, productCode))
        .limit(1);

      if (cached.length === 0) {
        return { available: false };
      }

      const cachedPrice = cached[0].price ? parseFloat(cached[0].price) : undefined;

      // Call Viator API to check current availability
      try {
        const product = await viatorService.getProductDetails(productCode);
        
        if (!product) {
          return { available: false, cachedPrice };
        }

        const currentPrice = product.pricing?.summary?.fromPrice || cachedPrice;
        const priceChanged = cachedPrice !== undefined && currentPrice !== undefined && 
          Math.abs(currentPrice - cachedPrice) > 0.01;

        // If a travel date is provided, also check specific availability
        if (travelDate) {
          const availability = await viatorService.checkAvailability(
            productCode, 
            travelDate, 
            [{ ageBand: 'ADULT', numberOfTravelers: 1 }]
          );
          
          const isAvailable = availability?.bookableItems?.some((item: { available?: boolean }) => item.available) ?? false;
          
          return {
            available: isAvailable,
            currentPrice,
            cachedPrice,
            priceChanged,
          };
        }

        return { 
          available: true, 
          currentPrice,
          cachedPrice,
          priceChanged,
        };
      } catch (apiError) {
        console.error("Live activity availability check failed, using cached data:", apiError);
        return { 
          available: true, 
          currentPrice: cachedPrice,
          cachedPrice,
          priceChanged: false,
        };
      }
    } catch (error) {
      console.error("Activity availability check error:", error);
      return { available: false };
    }
  }

  // ============ FLIGHT CACHING ============

  async getCachedFlights(originCode: string, destinationCode: string, departureDate: string, returnDate?: string): Promise<any[]> {
    const conditions = [
      eq(flightCache.originCode, originCode),
      eq(flightCache.destinationCode, destinationCode),
      eq(flightCache.departureDate, departureDate),
      gte(flightCache.expiresAt, new Date())
    ];
    
    if (returnDate) {
      conditions.push(eq(flightCache.returnDate, returnDate));
    }
    
    const cached = await db.select()
      .from(flightCache)
      .where(and(...conditions));
    
    return cached;
  }

  async cacheFlights(flights: any[], originCode: string, destinationCode: string, departureDate: string, returnDate?: string): Promise<void> {
    const expiresAt = getExpirationDate();

    for (const flight of flights) {
      const firstSegment = flight.itineraries?.[0]?.segments?.[0];
      const lastSegment = flight.itineraries?.[0]?.segments?.[flight.itineraries?.[0]?.segments?.length - 1];
      
      const existing = await db.select()
        .from(flightCache)
        .where(eq(flightCache.offerId, flight.id))
        .limit(1);

      const flightData = {
        originCode,
        destinationCode,
        departureDate,
        returnDate: returnDate || null,
        adults: flight.travelerPricings?.length || 1,
        offerId: flight.id,
        carrierCode: firstSegment?.carrierCode || null,
        flightNumber: firstSegment?.number || null,
        departureTime: firstSegment?.departure?.at || null,
        arrivalTime: lastSegment?.arrival?.at || null,
        duration: flight.itineraries?.[0]?.duration || null,
        stops: (flight.itineraries?.[0]?.segments?.length || 1) - 1,
        price: flight.price?.total,
        currency: flight.price?.currency || "USD",
        rawData: flight,
        expiresAt,
      };

      if (existing.length > 0) {
        await db.update(flightCache)
          .set({ ...flightData, lastUpdated: new Date() })
          .where(eq(flightCache.offerId, flight.id));
      } else {
        await db.insert(flightCache).values(flightData);
      }
    }
  }

  async getFlightsWithCache(params: {
    originLocationCode: string;
    destinationLocationCode: string;
    departureDate: string;
    returnDate?: string;
    adults: number;
    travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
    nonStop?: boolean;
    currencyCode?: string;
    max?: number;
  }): Promise<{ data: any[]; fromCache: boolean; lastUpdated?: Date }> {
    const cached = await this.getCachedFlights(
      params.originLocationCode,
      params.destinationLocationCode,
      params.departureDate,
      params.returnDate
    );
    
    if (cached.length > 0) {
      // Reconstruct flight data from cache
      const flightsFromCache = cached.map(f => ({
        id: f.offerId,
        source: 'CACHED',
        price: {
          total: f.price?.toString(),
          currency: f.currency,
          grandTotal: f.price?.toString(),
        },
        itineraries: [{
          duration: f.duration,
          segments: [{
            departure: { iataCode: f.originCode, at: f.departureTime },
            arrival: { iataCode: f.destinationCode, at: f.arrivalTime },
            carrierCode: f.carrierCode,
            number: f.flightNumber,
            duration: f.duration,
            numberOfStops: f.stops,
          }],
        }],
        travelerPricings: [{
          travelerId: "1",
          fareOption: "STANDARD",
          travelerType: "ADULT",
          price: { currency: f.currency, total: f.price?.toString() },
        }],
        ...f.rawData,
        _cached: true,
        _lastUpdated: f.lastUpdated,
      }));
      
      return { 
        data: flightsFromCache, 
        fromCache: true, 
        lastUpdated: cached[0]?.lastUpdated || undefined 
      };
    }

    // Fetch from API
    const flights = await this.amadeusService.searchFlights(params);
    
    // Cache the results
    if (flights.length > 0) {
      await this.cacheFlights(
        flights,
        params.originLocationCode,
        params.destinationLocationCode,
        params.departureDate,
        params.returnDate
      );
    }
    
    return { data: flights, fromCache: false };
  }

  // ============ CACHE CLEANUP ============

  async cleanupExpiredCache(): Promise<{ hotels: number; activities: number; flights: number }> {
    const now = new Date();

    const deletedHotels = await db.delete(hotelCache)
      .where(lte(hotelCache.expiresAt, now))
      .returning();

    const deletedActivities = await db.delete(activityCache)
      .where(lte(activityCache.expiresAt, now))
      .returning();

    const deletedFlights = await db.delete(flightCache)
      .where(lte(flightCache.expiresAt, now))
      .returning();

    return {
      hotels: deletedHotels.length,
      activities: deletedActivities.length,
      flights: deletedFlights.length,
    };
  }

  // ============ GET ALL CACHED DATA WITH LOCATIONS ============

  async getCachedHotelsWithLocations(cityCode?: string): Promise<Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    category: string;
    price: number;
    rating: number;
  }>> {
    const query = cityCode 
      ? db.select().from(hotelCache).where(eq(hotelCache.cityCode, cityCode))
      : db.select().from(hotelCache);
    
    const hotels = await query;
    
    return hotels
      .filter(h => h.latitude && h.longitude)
      .map(h => ({
        id: `hotel-${h.hotelId}`,
        name: h.name,
        lat: parseFloat(h.latitude!),
        lng: parseFloat(h.longitude!),
        category: "hotel",
        price: 0, // Would need to join with offers for price
        rating: h.rating ? parseFloat(h.rating) : 4.0,
      }));
  }

  async getCachedActivitiesWithLocations(destination?: string): Promise<Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    category: string;
    price: number;
    rating: number;
    description?: string;
  }>> {
    const query = destination 
      ? db.select().from(activityCache).where(eq(activityCache.destination, destination.toLowerCase()))
      : db.select().from(activityCache);
    
    const activities = await query;
    
    return activities
      .filter(a => a.latitude && a.longitude)
      .map(a => ({
        id: `activity-${a.productCode}`,
        name: a.title,
        lat: parseFloat(a.latitude!),
        lng: parseFloat(a.longitude!),
        category: "activity",
        price: a.price ? parseFloat(a.price) : 0,
        rating: a.rating ? parseFloat(a.rating) : 4.5,
        description: a.description || undefined,
      }));
  }

  // ============ FILTERING AND SORTING ============

  async getFilteredHotels(filters: {
    cityCode?: string;
    searchQuery?: string;
    priceMin?: number;
    priceMax?: number;
    minRating?: number;
    preferenceTags?: string[];
    county?: string;
    state?: string;
    countryCode?: string;
    sortBy?: 'price_low' | 'price_high' | 'rating' | 'popularity' | 'newest';
    limit?: number;
    offset?: number;
  }): Promise<{ data: any[]; total: number; fromCache: boolean }> {
    // Get all cached hotels for the cityCode
    let hotels = filters.cityCode 
      ? await this.getCachedHotels(filters.cityCode)
      : await db.select().from(hotelCache).where(gte(hotelCache.expiresAt, new Date()));

    // Get hotel offers to attach prices (filter by hotel IDs for efficiency)
    const hotelIds = hotels.map(h => h.id);
    let hotelOffers: any[] = [];
    if (hotelIds.length > 0) {
      hotelOffers = await db.select()
        .from(hotelOfferCache)
        .where(and(
          gte(hotelOfferCache.expiresAt, new Date()),
          inArray(hotelOfferCache.hotelCacheId, hotelIds)
        ));
    }

    // Create price map from hotel offers (use minimum price per hotel)
    const hotelPriceMap = new Map<string, number>();
    for (const offer of hotelOffers) {
      // Use the correct 'price' column from hotelOfferCache schema
      const price = offer.price ? parseFloat(offer.price) : 0;
      const existing = hotelPriceMap.get(offer.hotelCacheId);
      if (existing === undefined || price < existing) {
        hotelPriceMap.set(offer.hotelCacheId, price);
      }
    }

    // Attach price to each hotel
    let hotelsWithPrices = hotels.map(h => ({
      ...h,
      lowestPrice: hotelPriceMap.get(h.id) || 0,
    }));

    // Apply text search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      hotelsWithPrices = hotelsWithPrices.filter(h => 
        h.name.toLowerCase().includes(query) ||
        (h.address && h.address.toLowerCase().includes(query)) ||
        (h.city && h.city.toLowerCase().includes(query))
      );
    }

    // Apply price range filter
    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      hotelsWithPrices = hotelsWithPrices.filter(h => {
        const price = h.lowestPrice;
        if (filters.priceMin !== undefined && price < filters.priceMin) return false;
        if (filters.priceMax !== undefined && price > filters.priceMax) return false;
        return true;
      });
    }

    // Apply rating filter (handle both star rating and decimal rating)
    if (filters.minRating && filters.minRating > 0) {
      hotelsWithPrices = hotelsWithPrices.filter(h => {
        // Use starRating (integer 1-5) or parse rating string as decimal
        const rating = h.starRating || (h.rating ? parseFloat(h.rating) : 0);
        return rating >= filters.minRating!;
      });
    }

    // Apply preference tags filter
    if (filters.preferenceTags && filters.preferenceTags.length > 0) {
      hotelsWithPrices = hotelsWithPrices.filter(h => {
        const hotelTags = Array.isArray(h.preferenceTags) ? h.preferenceTags as string[] : [];
        return filters.preferenceTags!.some(tag => hotelTags.includes(tag));
      });
    }

    // Apply location filters
    if (filters.county) hotelsWithPrices = hotelsWithPrices.filter(h => h.county?.toLowerCase() === filters.county!.toLowerCase());
    if (filters.state) hotelsWithPrices = hotelsWithPrices.filter(h => h.state?.toLowerCase() === filters.state!.toLowerCase());
    if (filters.countryCode) hotelsWithPrices = hotelsWithPrices.filter(h => h.countryCode === filters.countryCode);

    const total = hotelsWithPrices.length;

    // Apply sorting
    switch (filters.sortBy) {
      case 'price_low':
        hotelsWithPrices.sort((a, b) => a.lowestPrice - b.lowestPrice);
        break;
      case 'price_high':
        hotelsWithPrices.sort((a, b) => b.lowestPrice - a.lowestPrice);
        break;
      case 'rating':
        hotelsWithPrices.sort((a, b) => {
          const ratingA = a.starRating || (a.rating ? parseFloat(a.rating) : 0);
          const ratingB = b.starRating || (b.rating ? parseFloat(b.rating) : 0);
          return ratingB - ratingA;
        });
        break;
      case 'popularity':
        hotelsWithPrices.sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0));
        break;
      case 'newest':
        hotelsWithPrices.sort((a, b) => new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime());
        break;
      default:
        hotelsWithPrices.sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0));
    }

    // Apply pagination
    if (filters.offset) hotelsWithPrices = hotelsWithPrices.slice(filters.offset);
    if (filters.limit) hotelsWithPrices = hotelsWithPrices.slice(0, filters.limit);

    return { data: hotelsWithPrices, total, fromCache: true };
  }

  async getFilteredActivities(filters: {
    destination?: string;
    searchQuery?: string;
    priceMin?: number;
    priceMax?: number;
    minRating?: number;
    preferenceTags?: string[];
    category?: string;
    county?: string;
    state?: string;
    countryCode?: string;
    sortBy?: 'price_low' | 'price_high' | 'rating' | 'popularity' | 'newest';
    limit?: number;
    offset?: number;
  }): Promise<{ data: any[]; total: number; fromCache: boolean }> {
    // Get cached activities
    let activities = filters.destination 
      ? await this.getCachedActivities(filters.destination)
      : await db.select().from(activityCache).where(gte(activityCache.expiresAt, new Date()));

    // Apply text search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      activities = activities.filter(a => 
        a.title.toLowerCase().includes(query) ||
        (a.description && a.description.toLowerCase().includes(query)) ||
        (a.meetingPoint && a.meetingPoint.toLowerCase().includes(query))
      );
    }

    // Apply price range filter
    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      activities = activities.filter(a => {
        const price = a.price ? parseFloat(a.price) : 0;
        if (filters.priceMin !== undefined && price < filters.priceMin) return false;
        if (filters.priceMax !== undefined && price > filters.priceMax) return false;
        return true;
      });
    }

    // Apply rating filter
    if (filters.minRating && filters.minRating > 0) {
      activities = activities.filter(a => {
        const rating = a.rating ? parseFloat(a.rating) : 0;
        return rating >= filters.minRating!;
      });
    }

    // Apply preference tags filter
    if (filters.preferenceTags && filters.preferenceTags.length > 0) {
      activities = activities.filter(a => {
        const activityTags = Array.isArray(a.preferenceTags) ? a.preferenceTags as string[] : [];
        return filters.preferenceTags!.some(tag => activityTags.includes(tag));
      });
    }

    // Apply category filter
    if (filters.category) {
      activities = activities.filter(a => a.category?.toLowerCase() === filters.category!.toLowerCase());
    }

    // Apply location filters
    if (filters.county) activities = activities.filter(a => a.county?.toLowerCase() === filters.county!.toLowerCase());
    if (filters.state) activities = activities.filter(a => a.state?.toLowerCase() === filters.state!.toLowerCase());
    if (filters.countryCode) activities = activities.filter(a => a.countryCode === filters.countryCode);

    const total = activities.length;

    // Apply sorting
    switch (filters.sortBy) {
      case 'price_low':
        activities.sort((a, b) => (parseFloat(a.price || "0")) - (parseFloat(b.price || "0")));
        break;
      case 'price_high':
        activities.sort((a, b) => (parseFloat(b.price || "0")) - (parseFloat(a.price || "0")));
        break;
      case 'rating':
        activities.sort((a, b) => (parseFloat(b.rating || "0")) - (parseFloat(a.rating || "0")));
        break;
      case 'popularity':
        activities.sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0));
        break;
      case 'newest':
        activities.sort((a, b) => new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime());
        break;
      default:
        activities.sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0));
    }

    // Apply pagination
    if (filters.offset) activities = activities.slice(filters.offset);
    if (filters.limit) activities = activities.slice(0, filters.limit);

    return { data: activities, total, fromCache: true };
  }

  // Get available preference tags with counts
  async getAvailablePreferenceTags(itemType: 'hotel' | 'activity'): Promise<Array<{ tag: string; count: number }>> {
    const tagCounts: Record<string, number> = {};
    
    if (itemType === 'hotel') {
      const hotels = await db.select().from(hotelCache).where(gte(hotelCache.expiresAt, new Date()));
      hotels.forEach(h => {
        const tags = Array.isArray(h.preferenceTags) ? h.preferenceTags as string[] : [];
        tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });
    } else {
      const activities = await db.select().from(activityCache).where(gte(activityCache.expiresAt, new Date()));
      activities.forEach(a => {
        const tags = Array.isArray(a.preferenceTags) ? a.preferenceTags as string[] : [];
        tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });
    }
    
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Get available categories with counts
  async getAvailableCategories(): Promise<Array<{ category: string; count: number }>> {
    const activities = await db.select().from(activityCache).where(gte(activityCache.expiresAt, new Date()));
    const categoryCounts: Record<string, number> = {};
    
    activities.forEach(a => {
      if (a.category) {
        categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
      }
    });
    
    return Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }
}

export const cacheService = new CacheService();
