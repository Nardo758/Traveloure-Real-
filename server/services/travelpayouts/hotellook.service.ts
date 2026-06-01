import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

const HOTELLOOK_CACHE_URL = "https://engine.hotellook.com/api/v2/cache.json";

let cache: Map<string, { data: CatalogItem[]; fetchedAt: number }> = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;

export interface HotellookSearchParams {
  destination: string;
  currency?: string;
  limit?: number;
  language?: string;
}

export async function searchHotellook(params: HotellookSearchParams): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  const cacheKey = `${params.destination}-${params.currency || "USD"}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.data;

  try {
    const url = new URL(HOTELLOOK_CACHE_URL);
    url.searchParams.set("token", token);
    url.searchParams.set("location", params.destination);
    url.searchParams.set("currency", params.currency || "USD");
    url.searchParams.set("limit", String(params.limit || 20));
    url.searchParams.set("language", params.language || "en");

    const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`HotelLook API error ${res.status}`);

    const hotels: any[] = await res.json();

    const items: CatalogItem[] = (Array.isArray(hotels) ? hotels : []).map((h: any): CatalogItem => ({
      id: `hotellook-${h.id || h.hotelId}`,
      type: "hotel",
      provider: "hotellook",
      externalId: String(h.id || h.hotelId),
      title: h.name || h.hotelName || "Hotel",
      description: h.description || `${h.stars || "?"}★ hotel in ${params.destination}`,
      imageUrl: h.photoUrl || h.photo || h.image || null,
      price: h.priceFrom ? parseFloat(h.priceFrom) : null,
      currency: params.currency || "USD",
      rating: h.rating ? parseFloat(h.rating) / 10 : null,
      reviewCount: h.reviewsCount || null,
      destination: params.destination,
      location: h.lat && h.lng ? { lat: parseFloat(h.lat), lng: parseFloat(h.lng) } : null,
      duration: null,
      categories: ["hotel", `${h.stars || 3}-star`],
      tags: [h.propertyType || "hotel", h.stars ? `${h.stars}-star` : "hotel"].filter(Boolean),
      bookingUrl: `https://search.hotellook.com/hotels?destination=${encodeURIComponent(params.destination)}&token=${token}`,
      affiliateUrl: h.link
        ? `${h.link}`
        : `https://search.hotellook.com/hotels?destination=${encodeURIComponent(params.destination)}&token=${token}`,
      source: "travelpayouts/hotellook",
      lastUpdated: new Date(),
    } as CatalogItem));

    cache.set(cacheKey, { data: items, fetchedAt: Date.now() });
    return items;
  } catch (err) {
    console.warn("[HotelLook] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
