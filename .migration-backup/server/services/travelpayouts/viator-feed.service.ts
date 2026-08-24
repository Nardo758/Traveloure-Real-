import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";
import { getCachedFeed, setCachedFeed } from "./travelpayouts-cache";

const VIATOR_FEED_BASE = "https://www.viator.com/orion/";
const BRAND = "viator-feed";

export interface ViatorFeedParams {
  destination?: string;
  limit?: number;
  currency?: string;
}

export async function searchViatorFeedProducts(params: ViatorFeedParams): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  const currency = params.currency || "USD";
  const cacheKey = `viator-feed:${currency}`;

  try {
    const token = getTravelpayoutsToken();
    const limit = params.limit || 20;

    const cached = await getCachedFeed(BRAND, cacheKey);
    if (cached !== null) {
      return filterAndMapFeed(cached, params, token, limit);
    }

    const url = new URL("partner-feed.json", VIATOR_FEED_BASE);
    if (token) url.searchParams.set("mcid", token);
    url.searchParams.set("currency", currency);

    const res = await fetch(url.toString(), {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Viator feed error ${res.status}`);
    }

    const data = await res.json();
    const products = data?.products || data || [];
    const items = Array.isArray(products) ? products : [];

    await setCachedFeed(BRAND, cacheKey, items);

    return filterAndMapFeed(items, params, token, limit);
  } catch (err) {
    console.warn("[Viator Feed] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

function filterAndMapFeed(products: any[], params: ViatorFeedParams, token: string | null, limit: number): CatalogItem[] {
  let filtered = products;

  if (params.destination) {
    const dest = params.destination.toLowerCase();
    filtered = filtered.filter((p: any) =>
      (p.destinationName || "").toLowerCase().includes(dest) ||
      (p.city || "").toLowerCase().includes(dest)
    );
  }

  return filtered.slice(0, limit).map((p: any): CatalogItem => ({
    id: `viator-feed-${p.productCode || p.id}`,
    type: "activity",
    provider: "viator-feed",
    externalId: String(p.productCode || p.id),
    title: p.title || "Activity",
    description: p.description || null,
    imageUrl: p.thumbnailHiResURL || p.thumbnailURL || p.imageUrl || null,
    price: p.price?.amount ? parseFloat(p.price.amount) : p.price ? parseFloat(p.price) : null,
    currency: p.price?.currency || params.currency || "USD",
    rating: p.rating ? parseFloat(p.rating) : null,
    reviewCount: p.reviewCount || null,
    destination: p.destinationName || p.city || params.destination || null,
    location: p.latitude && p.longitude
      ? { lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) }
      : null,
    duration: p.duration?.fixedDurationInMinutes
      ? `${p.duration.fixedDurationInMinutes} min`
      : null,
    categories: p.tags?.map((t: any) => t.tagName || t) || ["activity"],
    tags: ["discounted", "viator"],
    bookingUrl: p.productUrl || null,
    affiliateUrl: p.productUrl ? `${p.productUrl}?mcid=${token}` : null,
    source: "travelpayouts/viator-feed",
    lastUpdated: new Date(),
  } as CatalogItem));
}
