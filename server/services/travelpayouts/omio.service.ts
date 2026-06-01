import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";
import { getCachedFeed, setCachedFeed } from "./travelpayouts-cache";

const OMIO_FEED_URL = "https://www.travelpayouts.com/omio/destinations.json";
const BRAND = "omio";
const CACHE_KEY = "omio:feed";

async function fetchOmioDestinations(): Promise<any[]> {
  const cached = await getCachedFeed(BRAND, CACHE_KEY);
  if (cached !== null) return cached;

  const token = getTravelpayoutsToken();
  if (!token) return [];

  const url = new URL(OMIO_FEED_URL);
  url.searchParams.set("token", token);

  const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Omio feed error ${res.status}`);

  const data = await res.json();
  const items = Array.isArray(data) ? data : data?.destinations || data?.data || [];
  await setCachedFeed(BRAND, CACHE_KEY, items);
  return items;
}

export interface OmioSearchParams {
  origin?: string;
  destination?: string;
  limit?: number;
}

export async function searchOmioRoutes(params: OmioSearchParams): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  try {
    const destinations = await fetchOmioDestinations();
    const token = getTravelpayoutsToken();

    const destLower = (params.destination || "").toLowerCase();
    const originLower = (params.origin || "").toLowerCase();

    let filtered = destinations;
    if (destLower) {
      filtered = destinations.filter((d: any) =>
        (d.destination || d.city_to || d.to || "").toLowerCase().includes(destLower) ||
        (d.origin || d.city_from || d.from || "").toLowerCase().includes(originLower)
      );
    }

    return filtered.slice(0, params.limit || 10).map((d: any): CatalogItem => ({
      id: `omio-${d.id || `${d.origin || d.from}-${d.destination || d.to}`}`,
      type: "transport",
      provider: "omio",
      externalId: d.id || `${d.origin || ""}-${d.destination || ""}`,
      title: `${d.origin || d.city_from || d.from || "Origin"} → ${d.destination || d.city_to || d.to || "Destination"}`,
      description: "Train, bus or ferry — compare ground transport routes",
      imageUrl: null,
      price: d.price ? parseFloat(d.price) : null,
      currency: d.currency || "EUR",
      rating: null,
      reviewCount: null,
      destination: d.destination || d.city_to || d.to || null,
      location: null,
      duration: d.duration || null,
      categories: ["ground-transport", "train", "bus"],
      tags: ["omio", "train", "bus"],
      bookingUrl: `https://www.omio.com/results/${encodeURIComponent(d.origin || d.from || "")}/${encodeURIComponent(d.destination || d.to || "")}?ref=${token}`,
      affiliateUrl: `https://www.omio.com/results/${encodeURIComponent(d.origin || d.from || "")}/${encodeURIComponent(d.destination || d.to || "")}?ref=${token}`,
      source: "travelpayouts/omio",
      lastUpdated: new Date(),
    } as CatalogItem));
  } catch (err) {
    console.warn("[Omio] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
