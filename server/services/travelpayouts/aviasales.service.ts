import { tpFetch, getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

export interface AviasalesFlightParams {
  origin: string;
  destination?: string;
  departDate?: string;
  returnDate?: string;
  currency?: string;
  limit?: number;
}

export async function searchAviasalesFlights(params: AviasalesFlightParams): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  try {
    const queryParams: Record<string, string | number | boolean | undefined> = {
      origin: params.origin,
      currency: params.currency || "usd",
      limit: params.limit || 10,
      show_to_affiliates: true,
    };

    if (params.destination) queryParams.destination = params.destination;
    if (params.departDate) queryParams.depart_date = params.departDate;
    if (params.returnDate) queryParams.return_date = params.returnDate;

    const data = await tpFetch("/v1/prices/cheap", queryParams);

    const items: CatalogItem[] = [];
    const prices = data?.data || {};

    for (const [dest, routes] of Object.entries(prices as Record<string, any>)) {
      for (const [, flight] of Object.entries(routes as Record<string, any>)) {
        const f = flight as any;
        items.push({
          id: `aviasales-${params.origin}-${dest}-${f.depart_date || "any"}`,
          type: "flight",
          provider: "aviasales",
          externalId: `${params.origin}-${dest}`,
          title: `${params.origin} → ${dest}`,
          description: `Flight from ${params.origin} to ${dest}${f.airline ? ` with ${f.airline}` : ""}`,
          imageUrl: null,
          price: f.price ?? null,
          currency: (params.currency || "usd").toUpperCase(),
          rating: null,
          reviewCount: null,
          destination: dest,
          location: null,
          duration: f.duration ? `${Math.floor(f.duration / 60)}h ${f.duration % 60}m` : null,
          categories: ["flight"],
          tags: f.airline ? [f.airline] : [],
          bookingUrl: `https://www.aviasales.com/search/${params.origin}${f.depart_date?.replace(/-/g, "") || ""}${dest}1?marker=${getTravelpayoutsToken()}`,
          affiliateUrl: `https://www.aviasales.com/search/${params.origin}${f.depart_date?.replace(/-/g, "") || ""}${dest}1?marker=${getTravelpayoutsToken()}`,
          source: "travelpayouts/aviasales",
          lastUpdated: new Date(),
        } as CatalogItem);
      }
    }

    return items;
  } catch (err) {
    console.warn("[Aviasales] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getAviasalesPopularDestinations(origin: string, currency = "usd"): Promise<CatalogItem[]> {
  if (!getTravelpayoutsToken()) return [];

  try {
    const data = await tpFetch("/v1/prices/cheap", {
      origin,
      currency,
      limit: 20,
      show_to_affiliates: true,
    });

    return searchAviasalesFlights({ origin, currency });
  } catch (err) {
    console.warn("[Aviasales] Popular destinations failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
