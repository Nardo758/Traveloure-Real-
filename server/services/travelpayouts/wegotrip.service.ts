import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";
import { getCachedFeed, setCachedFeed } from "./travelpayouts-cache";

const WEGOTRIP_BASE = "https://wegotrip.com/api/v2";
const BRAND = "wegotrip";

async function wegotripFetch(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const url = new URL(path, WEGOTRIP_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`WeGoTrip API error ${res.status}`);
  }
  return res.json();
}

export interface WeGoTripSearchParams {
  city?: string;
  destination?: string;
  lang?: string;
  limit?: number;
}

export async function searchWeGoTripProducts(params: WeGoTripSearchParams): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  const city = params.city || params.destination || "";
  const lang = params.lang || "en";
  const limit = params.limit || 20;
  const cacheKey = `wegotrip:products:${city.toLowerCase()}:${lang}:${limit}`;

  try {
    const cached = await getCachedFeed(BRAND, cacheKey);
    if (cached !== null) {
      const token = getTravelpayoutsToken();
      return mapWeGoTripProducts(cached, params, token);
    }

    const query: Record<string, string | number | undefined> = { lang, page_size: limit };
    if (city) query.city = city;

    const data = await wegotripFetch("/products/", query);
    const products = data?.results || data || [];
    const items = Array.isArray(products) ? products : [];

    await setCachedFeed(BRAND, cacheKey, items);

    const token = getTravelpayoutsToken();
    return mapWeGoTripProducts(items, params, token);
  } catch (err) {
    console.warn("[WeGoTrip] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

function mapWeGoTripProducts(products: any[], params: WeGoTripSearchParams, token: string | null): CatalogItem[] {
  return products.map((p: any): CatalogItem => ({
    id: `wegotrip-${p.id}`,
    type: "activity",
    provider: "wegotrip",
    externalId: String(p.id),
    title: p.title || p.name || "Quest Tour",
    description: p.description || p.short_description || null,
    imageUrl: p.cover_image || p.image || null,
    price: p.price ? parseFloat(p.price) : null,
    currency: p.currency || "USD",
    rating: p.rating ? parseFloat(p.rating) : null,
    reviewCount: p.reviews_count || null,
    destination: p.city_name || params.city || params.destination || null,
    location: p.lat && p.lng ? { lat: parseFloat(p.lat), lng: parseFloat(p.lng) } : null,
    duration: p.duration ? `${p.duration} min` : null,
    categories: ["quest-tour", "walking-tour", p.category || "activity"].filter(Boolean),
    tags: p.tags || [],
    bookingUrl: p.url ? `${p.url}?marker=${token}` : null,
    affiliateUrl: p.url ? `${p.url}?marker=${token}` : null,
    source: "travelpayouts/wegotrip",
    lastUpdated: new Date(),
  } as CatalogItem));
}

export async function getWeGoTripCities(): Promise<{ id: number; name: string; country: string }[]> {
  const cacheKey = "wegotrip:cities";
  try {
    const cached = await getCachedFeed(BRAND, cacheKey);
    if (cached !== null) {
      return cached.map((c: any) => ({
        id: c.id,
        name: c.name || c.title,
        country: c.country_name || c.country || "",
      }));
    }

    const data = await wegotripFetch("/cities/", { lang: "en", page_size: 100 });
    const cities = data?.results || data || [];
    const items = Array.isArray(cities) ? cities : [];

    await setCachedFeed(BRAND, cacheKey, items);

    return items.map((c: any) => ({
      id: c.id,
      name: c.name || c.title,
      country: c.country_name || c.country || "",
    }));
  } catch (err) {
    console.warn("[WeGoTrip] Cities fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
