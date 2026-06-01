import { db } from "../db";
import { restaurantCache } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface OpenTableRestaurant {
  id: number;
  name: string;
  address: string;
  city: string;
  state?: string;
  country?: string;
  postal_code?: string;
  phone?: string;
  price?: number;
  cuisine?: string;
  cuisines?: string[];
  neighborhood?: string;
  lat?: number;
  lng?: number;
  image_url?: string;
  reserve_url?: string;
  mobile_reserve_url?: string;
  rating?: number;
  reviews_count?: number;
  experiences?: string[];
}

const OPENTABLE_API_KEY = process.env.OPENTABLE_API_KEY;
const OPENTABLE_CLIENT_ID = process.env.OPENTABLE_CLIENT_ID;

class OpenTableService {
  private isConfigured(): boolean {
    return !!(OPENTABLE_API_KEY || OPENTABLE_CLIENT_ID);
  }

  private buildReserveUrl(restaurantId: number): string {
    return `https://www.opentable.com/r/${restaurantId}`;
  }

  async searchRestaurantsByCity(city: string, limit = 50): Promise<OpenTableRestaurant[]> {
    if (!this.isConfigured()) {
      console.log("[OpenTable] API key not configured — skipping live fetch");
      return [];
    }

    try {
      const params = new URLSearchParams({
        city,
        per_page: limit.toString(),
        lang: "en-US",
      });

      const headers: Record<string, string> = {
        "Accept": "application/json",
        "Content-Type": "application/json",
      };

      if (OPENTABLE_API_KEY) {
        headers["Authorization"] = `Bearer ${OPENTABLE_API_KEY}`;
      } else if (OPENTABLE_CLIENT_ID) {
        params.set("client_id", OPENTABLE_CLIENT_ID);
      }

      const url = `https://platform.otable.com/v1/restaurants?${params}`;
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.error(`[OpenTable] API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json() as any;
      const restaurants: OpenTableRestaurant[] = data.restaurants || data.items || (Array.isArray(data) ? data : []);
      return restaurants;
    } catch (error: any) {
      console.error("[OpenTable] Search error:", error.message);
      return [];
    }
  }

  async upsertRestaurantsToCache(city: string): Promise<number> {
    const restaurants = await this.searchRestaurantsByCity(city);
    if (restaurants.length === 0) return 0;

    let upserted = 0;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    for (const restaurant of restaurants) {
      try {
        const externalId = `opentable_${restaurant.id}`;
        const existing = await db.select({ id: restaurantCache.id })
          .from(restaurantCache)
          .where(eq(restaurantCache.externalId, externalId))
          .limit(1);

        const bookingUrl = restaurant.reserve_url || this.buildReserveUrl(restaurant.id);
        const cuisines = restaurant.cuisines || (restaurant.cuisine ? [restaurant.cuisine] : []);

        const values = {
          externalId,
          name: restaurant.name,
          description: restaurant.neighborhood || null,
          cuisine: cuisines.join(", ") || null,
          priceLevel: restaurant.price ? restaurant.price.toString() : null,
          rating: restaurant.rating ? restaurant.rating.toString() : null,
          reviewCount: restaurant.reviews_count || 0,
          latitude: restaurant.lat ? restaurant.lat.toString() : null,
          longitude: restaurant.lng ? restaurant.lng.toString() : null,
          city: restaurant.city || city,
          bookingUrl,
          imageUrl: restaurant.image_url || null,
          lastUpdated: new Date(),
          expiresAt,
        };

        if (existing.length > 0) {
          await db.update(restaurantCache).set(values).where(eq(restaurantCache.externalId, externalId));
        } else {
          await db.insert(restaurantCache).values(values);
        }
        upserted++;
      } catch (err: any) {
        console.error(`[OpenTable] Upsert error for restaurant ${restaurant.id}:`, err.message);
      }
    }

    console.log(`[OpenTable] Upserted ${upserted} restaurants for city: ${city}`);
    return upserted;
  }
}

export const openTableService = new OpenTableService();
