import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

const AIRALO_FEED_URL = "https://www.travelpayouts.com/esim/prices/v1/esim-prices.json";

let cache: { data: any[]; fetchedAt: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function fetchAiraloFeed(): Promise<any[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.data;
  }

  const token = getTravelpayoutsToken();
  if (!token) return [];

  const url = new URL(AIRALO_FEED_URL);
  url.searchParams.set("token", token);

  const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Airalo feed error ${res.status}`);

  const data = await res.json();
  const items = Array.isArray(data) ? data : data?.data || data?.plans || [];
  cache = { data: items, fetchedAt: Date.now() };
  return items;
}

export interface AiraloSearchParams {
  country?: string;
  countryCode?: string;
  limit?: number;
}

export async function searchAiraloEsim(params: AiraloSearchParams): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  try {
    const feed = await fetchAiraloFeed();
    const token = getTravelpayoutsToken();

    let filtered = feed;

    if (params.country || params.countryCode) {
      const countryLower = (params.country || "").toLowerCase();
      const codeLower = (params.countryCode || "").toLowerCase();
      filtered = feed.filter((p: any) =>
        (p.country || "").toLowerCase().includes(countryLower) ||
        (p.country_code || "").toLowerCase() === codeLower ||
        (p.region || "").toLowerCase().includes(countryLower)
      );
    }

    return filtered.slice(0, params.limit || 10).map((p: any): CatalogItem => ({
      id: `airalo-${p.id || p.plan_id || Math.random().toString(36).slice(2)}`,
      type: "esim",
      provider: "airalo",
      externalId: String(p.id || p.plan_id || ""),
      title: `${p.operator || "Airalo"} eSIM — ${p.country || p.region || ""}`,
      description: `${p.data || p.data_gb ? `${p.data || p.data_gb}GB` : ""} · Valid ${p.validity || p.validity_days || "?"} days`.trim(),
      imageUrl: null,
      price: p.price ? parseFloat(p.price) : null,
      currency: p.currency || "USD",
      rating: null,
      reviewCount: null,
      destination: p.country || p.region || null,
      location: null,
      duration: p.validity_days ? `${p.validity_days} days` : p.validity || null,
      categories: ["esim", "connectivity"],
      tags: [p.operator || "airalo", p.country_code || ""].filter(Boolean),
      bookingUrl: `https://www.airalo.com/?referral_code=${token}`,
      affiliateUrl: `https://www.airalo.com/?referral_code=${token}`,
      source: "travelpayouts/airalo",
      lastUpdated: new Date(),
    } as CatalogItem));
  } catch (err) {
    console.warn("[Airalo] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
