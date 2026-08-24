import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

export interface WelcomePickupsSearchParams {
  destination: string;
  from?: string;
  passengers?: number;
  limit?: number;
}

const POPULAR_AIRPORTS: Record<string, string> = {
  paris: "CDG", london: "LHR", rome: "FCO", barcelona: "BCN",
  amsterdam: "AMS", berlin: "TXL", athens: "ATH", lisbon: "LIS",
  prague: "PRG", vienna: "VIE", budapest: "BUD", madrid: "MAD",
  istanbul: "IST", dubai: "DXB", tokyo: "NRT", bangkok: "BKK",
  singapore: "SIN", "new york": "JFK", "los angeles": "LAX", miami: "MIA",
};

export async function searchWelcomePickups(params: WelcomePickupsSearchParams): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  const city = params.destination.split(",")[0].trim().toLowerCase();
  const airport = POPULAR_AIRPORTS[city] || `${city.toUpperCase().slice(0, 3)} Airport`;
  const fromLabel = params.from || airport;
  const passengers = params.passengers || 2;

  const options = [
    {
      id: "private-sedan",
      icon: "🚗",
      title: `Private Sedan — ${fromLabel} → ${params.destination.split(",")[0]}`,
      desc: `Professional English-speaking driver · Welcome sign · No surge pricing · Up to 3 passengers`,
      price: 35,
      tags: ["sedan", "private", "airport"],
    },
    {
      id: "private-van",
      icon: "🚐",
      title: `Private Van — ${fromLabel} → ${params.destination.split(",")[0]}`,
      desc: `Spacious vehicle for families & groups · Extra luggage space · Up to 6 passengers`,
      price: 55,
      tags: ["van", "group", "airport", "family"],
    },
  ];

  return options.slice(0, params.limit || 2).map((o): CatalogItem => ({
    id: `welcomepickups-${city}-${o.id}`,
    type: "transfer",
    provider: "welcomepickups",
    externalId: o.id,
    title: `${o.icon} ${o.title}`,
    description: o.desc,
    imageUrl: null,
    price: o.price,
    currency: "USD",
    rating: 4.9,
    reviewCount: null,
    destination: params.destination,
    location: null,
    duration: null,
    categories: ["transfer", "airport-transfer", "private"],
    tags: ["welcomepickups", ...o.tags],
    bookingUrl: `https://www.welcomepickups.com/?ref=travelpayouts&destination=${encodeURIComponent(city)}`,
    affiliateUrl: `https://www.welcomepickups.com/?ref=travelpayouts&destination=${encodeURIComponent(city)}`,
    source: "travelpayouts/welcomepickups",
    lastUpdated: new Date(),
  } as CatalogItem));
}
