import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

const KIWI_BASE = "https://api.tequila.kiwi.com";

async function kiwiFetch(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const token = getTravelpayoutsToken();
  if (!token) throw new Error("TRAVELPAYOUTS_TOKEN not configured");

  const url = new URL(path, KIWI_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      "apikey": token,
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kiwi API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export interface KiwiSearchParams {
  flyFrom: string;
  flyTo?: string;
  dateFrom?: string;
  dateTo?: string;
  returnFrom?: string;
  returnTo?: string;
  currency?: string;
  limit?: number;
}

export async function searchKiwiFlights(params: KiwiSearchParams): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  try {
    const queryParams: Record<string, string | number | undefined> = {
      fly_from: params.flyFrom,
      curr: params.currency || "USD",
      limit: params.limit || 10,
      sort: "price",
    };

    if (params.flyTo) queryParams.fly_to = params.flyTo;
    if (params.dateFrom) queryParams.date_from = params.dateFrom;
    if (params.dateTo) queryParams.date_to = params.dateTo;
    if (params.returnFrom) queryParams.return_from = params.returnFrom;
    if (params.returnTo) queryParams.return_to = params.returnTo;

    const data = await kiwiFetch("/v2/search", queryParams);
    const flights = data?.data || [];

    return flights.map((f: any): CatalogItem => ({
      id: `kiwi-${f.id || f.booking_token?.slice(0, 16) || Math.random()}`,
      type: "flight",
      provider: "kiwi",
      externalId: f.id || f.booking_token,
      title: `${f.cityFrom || f.flyFrom} → ${f.cityTo || f.flyTo}`,
      description: `${f.airlines?.join(", ") || "Flight"} · ${f.route?.length || 1} stop(s)`,
      imageUrl: null,
      price: f.price ?? null,
      currency: params.currency || "USD",
      rating: null,
      reviewCount: null,
      destination: f.cityTo || f.flyTo,
      location: f.longitude ? { lat: f.latitude, lng: f.longitude } : null,
      duration: f.fly_duration || null,
      categories: ["flight"],
      tags: f.airlines || [],
      bookingUrl: f.deep_link || null,
      affiliateUrl: f.deep_link || null,
      source: "travelpayouts/kiwi",
      lastUpdated: new Date(),
    } as CatalogItem));
  } catch (err) {
    console.warn("[Kiwi] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export interface NomadParams {
  cities: string[];
  nights_in_dst_from?: number;
  nights_in_dst_to?: number;
  currency?: string;
  limit?: number;
}

export async function searchKiwiNomad(params: NomadParams): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  try {
    const queryParams: Record<string, string | number | undefined> = {
      fly_from: params.cities[0],
      curr: params.currency || "USD",
      nights_in_dst_from: params.nights_in_dst_from || 3,
      nights_in_dst_to: params.nights_in_dst_to || 14,
      limit: params.limit || 5,
      trip_type: "nomad",
    };

    if (params.cities.length > 1) {
      queryParams.fly_to = params.cities.slice(1).join(",");
    }

    const data = await kiwiFetch("/v2/search", queryParams);
    const flights = data?.data || [];

    return flights.map((f: any): CatalogItem => ({
      id: `kiwi-nomad-${f.id || Math.random()}`,
      type: "flight",
      provider: "kiwi",
      externalId: f.id,
      title: `Nomad route: ${params.cities.join(" → ")}`,
      description: f.route?.map((r: any) => `${r.cityFrom}→${r.cityTo}`).join(", ") || "",
      imageUrl: null,
      price: f.price ?? null,
      currency: params.currency || "USD",
      rating: null,
      reviewCount: null,
      destination: params.cities[params.cities.length - 1],
      location: null,
      duration: f.fly_duration || null,
      categories: ["flight", "nomad"],
      tags: ["multi-city", "nomad"],
      bookingUrl: f.deep_link || null,
      affiliateUrl: f.deep_link || null,
      source: "travelpayouts/kiwi",
      lastUpdated: new Date(),
    } as CatalogItem));
  } catch (err) {
    console.warn("[Kiwi Nomad] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
