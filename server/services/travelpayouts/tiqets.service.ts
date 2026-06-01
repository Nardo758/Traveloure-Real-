import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";
import { getCachedFeed, setCachedFeed } from "./travelpayouts-cache";

const TIQETS_BASE = "https://api.tiqets.com/v1";
const BRAND = "tiqets";

async function tiqetsFetch(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const token = getTravelpayoutsToken();
  if (!token) throw new Error("TRAVELPAYOUTS_TOKEN not configured");

  const url = new URL(path, TIQETS_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Tiqets API error ${res.status}`);
  }
  return res.json();
}

export interface TiqetsSearchParams {
  city?: string;
  destination?: string;
  limit?: number;
  currency?: string;
}

export async function searchTiqetsProducts(params: TiqetsSearchParams): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  const city = params.city || params.destination || "";
  const currency = params.currency || "USD";
  const limit = params.limit || 20;
  const cacheKey = `tiqets:products:${city.toLowerCase()}:${currency}:${limit}`;

  try {
    const cached = await getCachedFeed(BRAND, cacheKey);
    if (cached !== null) {
      const token = getTravelpayoutsToken();
      return mapTiqetsProducts(cached, params, token);
    }

    const query: Record<string, string | number | undefined> = { limit, currency };
    if (city) query.city = city;

    const data = await tiqetsFetch("/products", query);
    const products = data?.data || data?.products || data || [];
    const items = Array.isArray(products) ? products : [];

    await setCachedFeed(BRAND, cacheKey, items);

    const token = getTravelpayoutsToken();
    return mapTiqetsProducts(items, params, token);
  } catch (err) {
    console.warn("[Tiqets] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

function mapTiqetsProducts(products: any[], params: TiqetsSearchParams, token: string | null): CatalogItem[] {
  return products.map((p: any): CatalogItem => ({
    id: `tiqets-${p.id || p.product_id}`,
    type: "activity",
    provider: "tiqets",
    externalId: String(p.id || p.product_id),
    title: p.title || p.name || "Attraction",
    description: p.description || p.summary || null,
    imageUrl: p.cover_image_url || p.image_url || p.image || null,
    price: p.min_price ? parseFloat(p.min_price) : p.price ? parseFloat(p.price) : null,
    currency: params.currency || "USD",
    rating: p.rating ? parseFloat(p.rating) : null,
    reviewCount: p.review_count || p.reviews_count || null,
    destination: p.city || params.city || params.destination || null,
    location: p.lat && p.lng
      ? { lat: parseFloat(p.lat), lng: parseFloat(p.lng) }
      : p.latitude && p.longitude
      ? { lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) }
      : null,
    duration: null,
    categories: ["attraction", "ticket", p.category || "activity"].filter(Boolean),
    tags: p.tags || [],
    bookingUrl: p.url ? `${p.url}?partner_id=${token}` : `https://www.tiqets.com/en/s/?q=${encodeURIComponent(p.title || "")}`,
    affiliateUrl: p.url ? `${p.url}?partner_id=${token}` : null,
    source: "travelpayouts/tiqets",
    lastUpdated: new Date(),
  } as CatalogItem));
}
