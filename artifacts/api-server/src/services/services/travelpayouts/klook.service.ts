import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

export interface KlookSearchParams {
  destination: string;
  limit?: number;
  currency?: string;
}

const ASIA_KEYWORDS = ["tokyo", "osaka", "kyoto", "seoul", "bangkok", "bali", "singapore", "hong kong",
  "taipei", "beijing", "shanghai", "hanoi", "ho chi minh", "kuala lumpur", "jakarta", "phuket",
  "chiang mai", "siem reap", "colombo", "mumbai", "delhi", "dubai", "maldives", "kathmandu"];

export async function searchKlook(params: KlookSearchParams): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  const city = params.destination.split(",")[0].trim();
  const isAsia = ASIA_KEYWORDS.some(k => city.toLowerCase().includes(k));

  const categories = isAsia ? [
    { cat: "Attraction Tickets", icon: "🎫", basePrice: 18, desc: `Skip-the-line entry to top attractions in ${city}` },
    { cat: "Day Tours", icon: "🚌", basePrice: 55, desc: `Guided full-day tours from ${city}` },
    { cat: "Transport Passes", icon: "🚇", basePrice: 12, desc: `Transit cards & airport transfers in ${city}` },
    { cat: "Food Experiences", icon: "🍜", basePrice: 35, desc: `Street food tours & cooking classes in ${city}` },
    { cat: "Cultural Shows", icon: "🎎", basePrice: 40, desc: `Cultural performances & shows in ${city}` },
    { cat: "Theme Parks", icon: "🎡", basePrice: 65, desc: `Theme park & entertainment tickets in ${city}` },
  ] : [
    { cat: "Attraction Tickets", icon: "🎫", basePrice: 22, desc: `Tickets & experiences in ${city}` },
    { cat: "Day Tours", icon: "🚌", basePrice: 60, desc: `Guided day tours from ${city}` },
    { cat: "City Experiences", icon: "🌆", basePrice: 35, desc: `Unique city experiences in ${city}` },
  ];

  return categories.slice(0, params.limit || 6).map((c, i): CatalogItem => ({
    id: `klook-${city.toLowerCase().replace(/\s+/g, "-")}-${i}`,
    type: "activity",
    provider: "klook",
    externalId: `klook-${city}-${i}`,
    title: `${c.icon} ${c.cat} — ${city}`,
    description: `${c.desc} · Instant booking on Klook · Mobile voucher`,
    imageUrl: null,
    price: c.basePrice,
    currency: params.currency || "USD",
    rating: 4.6,
    reviewCount: null,
    destination: params.destination,
    location: null,
    duration: null,
    categories: ["activity", c.cat.toLowerCase()],
    tags: ["klook", isAsia ? "asia" : "global", c.cat.toLowerCase().replace(/\s+/g, "-")],
    bookingUrl: `https://www.klook.com/en-US/search/?query=${encodeURIComponent(city)}${isAsia ? "&aff_code=travelpayouts" : ""}`,
    affiliateUrl: `https://www.klook.com/en-US/search/?query=${encodeURIComponent(city + " " + c.cat)}&aff_code=travelpayouts`,
    source: "travelpayouts/klook",
    lastUpdated: new Date(),
  } as CatalogItem));
}
