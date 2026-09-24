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
    { cat: "Attraction Tickets", icon: "🎫", desc: `Skip-the-line entry to top attractions in ${city}` },
    { cat: "Day Tours", icon: "🚌", desc: `Guided full-day tours from ${city}` },
    { cat: "Transport Passes", icon: "🚇", desc: `Transit cards & airport transfers in ${city}` },
    { cat: "Food Experiences", icon: "🍜", desc: `Street food tours & cooking classes in ${city}` },
    { cat: "Cultural Shows", icon: "🎎", desc: `Cultural performances & shows in ${city}` },
    { cat: "Theme Parks", icon: "🎡", desc: `Theme park & entertainment tickets in ${city}` },
  ] : [
    { cat: "Attraction Tickets", icon: "🎫", desc: `Tickets & experiences in ${city}` },
    { cat: "Day Tours", icon: "🚌", desc: `Guided day tours from ${city}` },
    { cat: "City Experiences", icon: "🌆", desc: `Unique city experiences in ${city}` },
  ];

  return categories.slice(0, params.limit || 6).map((c, i): CatalogItem => ({
    id: `klook-${city.toLowerCase().replace(/\s+/g, "-")}-${i}`,
    type: "activity",
    provider: "klook",
    externalId: `klook-${city}-${i}`,
    title: `${c.icon} ${c.cat} — ${city}`,
    description: `${c.desc} · Search on Klook`,
    imageUrl: null,
    // §13 (board #1200, ledger `2026-09-23-phase2-honesty`): this card is a search entry point, not a quote — no price or rating was fetched, so none is shown.
    price: null,
    currency: params.currency || "USD",
    rating: null,
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
