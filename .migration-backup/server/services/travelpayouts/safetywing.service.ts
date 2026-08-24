import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

export interface SafetyWingSearchParams {
  destination?: string;
  travelers?: number;
  limit?: number;
}

const PLANS = [
  {
    id: "nomad-insurance",
    title: "Nomad Insurance",
    icon: "🌍",
    description: "Medical coverage for travelers & digital nomads · $250 deductible · Covers COVID-19",
    price: 42,
    period: "4 weeks",
    coverage: "Worldwide (excl. home country)",
    highlights: ["Emergency medical", "Trip interruption", "Travel delay", "Personal liability"],
    url: "https://safetywing.com/nomad-insurance?referenceID=travelpayouts&utm_source=travelpayouts",
    commission: "10% recurring",
  },
  {
    id: "remote-health",
    title: "Remote Health",
    icon: "🏥",
    description: "Full health insurance for remote workers & expats · No deductible option · Direct billing",
    price: 150,
    period: "month",
    coverage: "Worldwide",
    highlights: ["Full medical", "Dental & vision", "Mental health", "Maternity coverage"],
    url: "https://safetywing.com/remote-health?referenceID=travelpayouts&utm_source=travelpayouts",
    commission: "10% recurring",
  },
  {
    id: "safe-travels-usa",
    title: "Safe Travels USA",
    icon: "🇺🇸",
    description: "Visitor insurance for travelers TO the USA · Meets US health standards",
    price: 35,
    period: "month",
    coverage: "USA (visitors only)",
    highlights: ["Emergency medical", "Hospitalization", "Prescription drugs", "Medical evacuation"],
    url: "https://safetywing.com/safe-travels-usa?referenceID=travelpayouts&utm_source=travelpayouts",
    commission: "10% recurring",
  },
];

export async function searchSafetyWingPlans(params: SafetyWingSearchParams = {}): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  const isUSA = (params.destination || "").toLowerCase().includes("usa") ||
    (params.destination || "").toLowerCase().includes("united states") ||
    (params.destination || "").toLowerCase().includes("america");

  const plans = isUSA
    ? PLANS
    : PLANS.filter(p => p.id !== "safe-travels-usa");

  return plans.slice(0, params.limit || 3).map((p): CatalogItem => ({
    id: `safetywing-${p.id}`,
    type: "activity",
    provider: "safetywing",
    externalId: p.id,
    title: `${p.icon} ${p.title}`,
    description: p.description,
    imageUrl: null,
    price: p.price,
    currency: "USD",
    rating: 4.8,
    reviewCount: null,
    destination: params.destination || null,
    location: null,
    duration: `per ${p.period}`,
    categories: ["insurance", "travel-insurance"],
    tags: ["safetywing", "insurance", p.id, p.coverage.toLowerCase().replace(/\s+/g, "-")],
    bookingUrl: p.url,
    affiliateUrl: p.url,
    source: "travelpayouts/safetywing",
    lastUpdated: new Date(),
  } as CatalogItem));
}
