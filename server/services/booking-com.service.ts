import { db } from "../db";
import { hotelCache } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface BookingComHotel {
  hotel_id: number;
  name: string;
  city: string;
  country: string;
  country_code: string;
  address: string;
  latitude: number;
  longitude: number;
  star_rating?: number;
  review_score?: number;
  review_nr?: number;
  url?: string;
  main_photo_url?: string;
  min_total_price?: number;
  currency_code?: string;
}

const BASE_URL = "https://distribution-xml.booking.com/json";
const AFFILIATE_ID = process.env.BOOKING_COM_AFFILIATE_ID;
const API_KEY = process.env.BOOKING_COM_API_KEY;

class BookingComService {
  private isConfigured(): boolean {
    return !!AFFILIATE_ID;
  }

  private buildAffiliateUrl(cityName: string): string {
    const aid = AFFILIATE_ID || "";
    const encoded = encodeURIComponent(cityName);
    return `https://www.booking.com/searchresults.html?ss=${encoded}&aid=${aid}`;
  }

  private buildHotelUrl(hotelId: number | string): string {
    const aid = AFFILIATE_ID || "";
    return `https://www.booking.com/hotel/${hotelId}.html?aid=${aid}`;
  }

  async searchHotelsByCity(city: string): Promise<BookingComHotel[]> {
    if (!this.isConfigured()) {
      console.log("[BookingCom] Affiliate ID not configured — skipping live fetch");
      return [];
    }

    try {
      const params = new URLSearchParams({
        city_name: city,
        extras: "hotel_info,hotel_photos,hotel_description",
        rows: "50",
        languagecode: "en-us",
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };

      if (API_KEY) {
        headers["Authorization"] = `Basic ${Buffer.from(`${AFFILIATE_ID}:${API_KEY}`).toString("base64")}`;
      }

      const response = await fetch(`${BASE_URL}/bookings.getHotels?${params}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.error(`[BookingCom] API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json() as any;
      const hotels: BookingComHotel[] = Array.isArray(data) ? data : (data.result || []);
      return hotels;
    } catch (error: any) {
      console.error("[BookingCom] Search error:", error.message);
      return [];
    }
  }

  async upsertHotelsToCache(city: string): Promise<number> {
    const hotels = await this.searchHotelsByCity(city);
    if (hotels.length === 0) return 0;

    let upserted = 0;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    for (const hotel of hotels) {
      try {
        const hotelId = `booking_com_${hotel.hotel_id}`;
        const existing = await db.select({ id: hotelCache.id })
          .from(hotelCache)
          .where(eq(hotelCache.hotelId, hotelId))
          .limit(1);

        const bookingUrl = this.buildHotelUrl(hotel.hotel_id);
        const affiliateUrl = this.buildAffiliateUrl(city);

        const values = {
          hotelId,
          cityCode: city.slice(0, 10).toUpperCase(),
          name: hotel.name,
          city: hotel.city || city,
          countryCode: hotel.country_code,
          countryName: hotel.country,
          address: hotel.address,
          latitude: hotel.latitude ? hotel.latitude.toString() : null,
          longitude: hotel.longitude ? hotel.longitude.toString() : null,
          starRating: hotel.star_rating || null,
          rating: hotel.review_score ? hotel.review_score.toString() : null,
          reviewCount: hotel.review_nr || 0,
          provider: "booking_com",
          media: hotel.main_photo_url ? [{ url: hotel.main_photo_url, category: "EXTERIOR" }] : [],
          rawData: { bookingUrl, affiliateUrl, hotelId: hotel.hotel_id },
          expiresAt,
          lastUpdated: new Date(),
        };

        if (existing.length > 0) {
          await db.update(hotelCache).set(values).where(eq(hotelCache.hotelId, hotelId));
        } else {
          await db.insert(hotelCache).values(values);
        }
        upserted++;
      } catch (err: any) {
        console.error(`[BookingCom] Upsert error for hotel ${hotel.hotel_id}:`, err.message);
      }
    }

    console.log(`[BookingCom] Upserted ${upserted} hotels for city: ${city}`);
    return upserted;
  }
}

export const bookingComService = new BookingComService();
