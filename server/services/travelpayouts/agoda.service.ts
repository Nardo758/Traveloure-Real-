import { getTravelpayoutsToken, getTravelpayoutsMarker } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

export interface AgodaSearchParams {
  destination: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  limit?: number;
}

export async function searchAgoda(params: AgodaSearchParams): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  const city = params.destination.split(",")[0].trim();
  const checkIn = params.checkIn || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const checkOut = params.checkOut || new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const guests = params.guests || 2;

  const baseUrl = `https://www.agoda.com/search?city=${encodeURIComponent(city)}&checkIn=${checkIn}&checkOut=${checkOut}&rooms=1&adults=${guests}`;

  const affiliateBase = `https://www.travelpayouts.com/hotels/agoda?marker=${getTravelpayoutsMarker()}&currency=USD&city=${encodeURIComponent(city)}`;

  // §13 (board #1200, ledger `2026-09-23-phase2-honesty`): this card is a search entry point, not a quote — no price or rating was fetched, so none is shown.
  const tiers = [
    { stars: 5, label: "5-star" },
    { stars: 4, label: "4-star" },
    { stars: 3, label: "3-star" },
    { stars: 2, label: "2-star" },
  ];

  return tiers.slice(0, params.limit || 4).map((t): CatalogItem => ({
    id: `agoda-${city.toLowerCase().replace(/\s+/g, "-")}-${t.stars}star`,
    type: "hotel",
    provider: "agoda",
    externalId: `agoda-${t.stars}`,
    title: `${t.label} hotels in ${city}`,
    description: `Search ${t.label} hotels in ${city} on Agoda. Prices and availability are shown by Agoda for your dates.`,
    imageUrl: null,
    price: null,
    currency: "USD",
    rating: null,
    reviewCount: null,
    destination: params.destination,
    location: null,
    duration: null,
    categories: ["hotel", `${t.stars}-star`],
    tags: ["agoda", `${t.stars}-star`, "hotel"],
    bookingUrl: affiliateBase + `&stars=${t.stars}`,
    affiliateUrl: affiliateBase + `&stars=${t.stars}`,
    source: "travelpayouts/agoda",
    lastUpdated: new Date(),
  } as CatalogItem));
}
