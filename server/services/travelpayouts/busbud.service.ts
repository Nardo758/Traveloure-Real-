import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

const BUSBUD_API = "https://www.busbud.com/api";

export interface BusbudSearchParams {
  origin: string;
  destination: string;
  date?: string;
  passengers?: number;
  limit?: number;
  currency?: string;
}

export async function searchBusbud(params: BusbudSearchParams): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  try {
    const date = params.date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const url = new URL(`${BUSBUD_API}/x-departures/${encodeURIComponent(params.origin)}/${encodeURIComponent(params.destination)}/${date}`);
    url.searchParams.set("adult", String(params.passengers || 1));
    url.searchParams.set("currency", params.currency || "USD");
    url.searchParams.set("lang", "en");

    const res = await fetch(url.toString(), {
      headers: {
        "Accept": "application/vnd.busbud+json; version=2; profile=https://schema.busbud.com/v2/",
        "X-Busbud-Token": token,
      },
    });

    if (res.ok) {
      const data = await res.json();
      const departures = data?.departures || [];

      if (Array.isArray(departures) && departures.length > 0) {
        const operators = data?.operators || [];
        return departures.slice(0, params.limit || 10).map((d: any): CatalogItem => {
          const operator = operators.find((o: any) => o.id === d.operator_id);
          return {
            id: `busbud-${d.id}`,
            type: "transport",
            provider: "busbud",
            externalId: String(d.id),
            title: `${params.origin} → ${params.destination}`,
            description: `${operator?.full_name || "Bus"} · Departs ${d.departure_time?.slice(11, 16) || "TBD"} · ${d.duration ? Math.round(d.duration / 60) + "h" : ""}`.trim(),
            imageUrl: operator?.logo_url || null,
            price: d.prices?.total ? d.prices.total / 100 : null,
            currency: params.currency || "USD",
            rating: null,
            reviewCount: null,
            destination: params.destination,
            location: null,
            duration: d.duration ? `${Math.round(d.duration / 60)} hours` : null,
            categories: ["ground-transport", "bus"],
            tags: ["busbud", "bus", operator?.full_name?.toLowerCase() || "bus"],
            bookingUrl: `https://www.busbud.com/en/bus-tickets/${encodeURIComponent(params.origin.toLowerCase())}/${encodeURIComponent(params.destination.toLowerCase())}?ref=${token}`,
            affiliateUrl: d.url || `https://www.busbud.com/en/bus-tickets/${encodeURIComponent(params.origin.toLowerCase())}/${encodeURIComponent(params.destination.toLowerCase())}?ref=${token}`,
            source: "travelpayouts/busbud",
            lastUpdated: new Date(),
          } as CatalogItem;
        });
      }
    }
  } catch {
  }

  const origin = params.origin || "Origin";
  const dest = params.destination || "Destination";
  return [{
    id: `busbud-search-${origin}-${dest}`.replace(/\s+/g, "-").toLowerCase(),
    type: "transport",
    provider: "busbud",
    externalId: `busbud-${origin}-${dest}`,
    title: `🚌 Bus: ${origin} → ${dest}`,
    description: `Find affordable bus tickets · Compare 700+ operators worldwide · Free cancellation on many routes`,
    imageUrl: null,
    price: null,
    currency: "USD",
    rating: 4.4,
    reviewCount: null,
    destination: dest,
    location: null,
    duration: null,
    categories: ["ground-transport", "bus"],
    tags: ["busbud", "bus", "ground-transport"],
    bookingUrl: `https://www.busbud.com/en/bus-tickets/${encodeURIComponent(origin.toLowerCase())}/${encodeURIComponent(dest.toLowerCase())}?ref=${token}`,
    affiliateUrl: `https://www.busbud.com/en/bus-tickets/${encodeURIComponent(origin.toLowerCase())}/${encodeURIComponent(dest.toLowerCase())}?ref=${token}`,
    source: "travelpayouts/busbud",
    lastUpdated: new Date(),
  } as CatalogItem];
}
