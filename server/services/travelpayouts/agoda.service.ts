import { getTravelpayoutsToken } from "./travelpayouts-client";
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

  const affiliateBase = `https://www.travelpayouts.com/hotels/agoda?marker=405110&currency=USD&city=${encodeURIComponent(city)}`;

  const tiers = [
    { stars: 5, label: "Luxury 5★", priceFrom: 150, priceLabel: "from $150/night" },
    { stars: 4, label: "Superior 4★", priceFrom: 80, priceLabel: "from $80/night" },
    { stars: 3, label: "Comfortable 3★", priceFrom: 45, priceLabel: "from $45/night" },
    { stars: 2, label: "Budget 2★", priceFrom: 25, priceLabel: "from $25/night" },
  ];

  return tiers.slice(0, params.limit || 4).map((t, i): CatalogItem => ({
    id: `agoda-${city.toLowerCase().replace(/\s+/g, "-")}-${t.stars}star`,
    type: "hotel",
    provider: "agoda",
    externalId: `agoda-${t.stars}`,
    title: `${t.label} Hotels in ${city}`,
    description: `${t.priceLabel} · Book on Agoda via Travelpayouts · Best price guarantee`,
    imageUrl: null,
    price: t.priceFrom,
    currency: "USD",
    rating: t.stars >= 4 ? 9.0 - i * 0.3 : 8.0 - i * 0.2,
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
