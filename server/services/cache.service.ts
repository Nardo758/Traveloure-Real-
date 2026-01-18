import { db } from "../db";
import { hotelCache, hotelOfferCache, activityCache, flightCache } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { HotelOffer, AmadeusService } from "./amadeus.service";
import { ViatorProduct, viatorService } from "./viator.service";

const CACHE_DURATION_HOURS = 24;

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

  async cacheHotels(hotels: HotelOffer[], cityCode: string): Promise<void> {
    const expiresAt = getExpirationDate();

    for (const hotelData of hotels) {
      const hotel = hotelData.hotel;
      
      const existingHotel = await db.select()
        .from(hotelCache)
        .where(eq(hotelCache.hotelId, hotel.hotelId))
        .limit(1);

      if (existingHotel.length > 0) {
        await db.update(hotelCache)
          .set({
            name: hotel.name,
            latitude: hotel.latitude?.toString(),
            longitude: hotel.longitude?.toString(),
            address: hotel.address?.lines?.join(", "),
            rating: hotel.rating,
            amenities: hotel.amenities || [],
            media: hotel.media || [],
            rawData: hotelData,
            lastUpdated: new Date(),
            expiresAt,
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
            name: hotel.name,
            latitude: hotel.latitude?.toString(),
            longitude: hotel.longitude?.toString(),
            address: hotel.address?.lines?.join(", "),
            rating: hotel.rating,
            amenities: hotel.amenities || [],
            media: hotel.media || [],
            rawData: hotelData,
            expiresAt,
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
            ...o.rawData,
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

  async cacheActivities(activities: ViatorProduct[], destination: string): Promise<void> {
    const expiresAt = getExpirationDate();

    for (const activity of activities) {
      // Extract coordinates from logistics if available
      let latitude: number | null = null;
      let longitude: number | null = null;
      let meetingPoint: string | null = null;

      if (activity.logistics?.start?.[0]?.location?.coordinates) {
        latitude = activity.logistics.start[0].location.coordinates.latitude;
        longitude = activity.logistics.start[0].location.coordinates.longitude;
        meetingPoint = activity.logistics.start[0].location.name || 
                       activity.logistics.start[0].description || null;
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

      const existing = await db.select()
        .from(activityCache)
        .where(eq(activityCache.productCode, activity.productCode))
        .limit(1);

      if (existing.length > 0) {
        await db.update(activityCache)
          .set({
            destination: destination.toLowerCase(),
            title: activity.title,
            description: activity.description,
            latitude: latitude?.toString(),
            longitude: longitude?.toString(),
            meetingPoint,
            durationMinutes,
            price: activity.pricing?.summary?.fromPrice?.toString(),
            currency: activity.pricing?.currency || "USD",
            rating: activity.reviews?.combinedAverageRating?.toString(),
            reviewCount: activity.reviews?.totalReviews || 0,
            imageUrl,
            flags: activity.flags || [],
            tags: activity.tags || [],
            rawData: activity,
            lastUpdated: new Date(),
            expiresAt,
          })
          .where(eq(activityCache.productCode, activity.productCode));
      } else {
        await db.insert(activityCache)
          .values({
            productCode: activity.productCode,
            destination: destination.toLowerCase(),
            title: activity.title,
            description: activity.description,
            latitude: latitude?.toString(),
            longitude: longitude?.toString(),
            meetingPoint,
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
          
          const isAvailable = availability?.bookableItems?.some(item => item.available) ?? false;
          
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
}

export const cacheService = new CacheService();
