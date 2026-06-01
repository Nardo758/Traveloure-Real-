import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

const TIQETS_BASE = "https://api.tiqets.com/v1";

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

  try {
    const query: Record<string, string | number | undefined> = {
      limit: params.limit || 20,
      currency: params.currency || "USD",
    };

    if (params.city || params.destination) {
      query.city = params.city || params.destination;
    }

    const data = await tiqetsFetch("/products", query);
    const products = data?.data || data?.products || data || [];
    const token = getTravelpayoutsToken();

    return (Array.isArray(products) ? products : []).map((p: any): CatalogItem => ({
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
  } catch (err) {
    console.warn("[Tiqets] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
