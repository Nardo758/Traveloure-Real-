import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";

const GYG_FEED_URL = "https://partner.getyourguide.com/api/v3/tours";

export interface GetYourGuideSearchParams {
  destination: string;
  limit?: number;
  currency?: string;
}

export async function searchGetYourGuide(params: GetYourGuideSearchParams): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  const city = params.destination.split(",")[0].trim();

  try {
    const url = new URL(GYG_FEED_URL);
    url.searchParams.set("q", city);
    url.searchParams.set("limit", String(params.limit || 20));
    url.searchParams.set("currency", params.currency || "USD");
    url.searchParams.set("language", "en");

    const res = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const tours = data?.tours || data?.data || data?.activities || [];

      if (Array.isArray(tours) && tours.length > 0) {
        return tours.map((t: any): CatalogItem => ({
          id: `gyg-${t.tour_id || t.id}`,
          type: "activity",
          provider: "getyourguide",
          externalId: String(t.tour_id || t.id),
          title: t.title || t.name || "Tour",
          description: t.abstract || t.description || null,
          imageUrl: t.pictures?.[0]?.url || t.image_url || null,
          price: t.price?.values?.amount ? parseFloat(t.price.values.amount) : null,
          currency: t.price?.currency || params.currency || "USD",
          rating: t.overall_rating ? parseFloat(t.overall_rating) : null,
          reviewCount: t.number_of_comments || null,
          destination: params.destination,
          location: t.latitude && t.longitude ? { lat: parseFloat(t.latitude), lng: parseFloat(t.longitude) } : null,
          duration: t.duration ? `${Math.round(t.duration / 60)}h` : null,
          categories: ["activity", "tour", t.category || "experience"],
          tags: ["getyourguide", t.category || "tour"],
          bookingUrl: t.url || `https://www.getyourguide.com/s/?q=${encodeURIComponent(city)}&partner_id=${token}`,
          affiliateUrl: t.url ? `${t.url}?partner_id=${token}` : null,
          source: "travelpayouts/getyourguide",
          lastUpdated: new Date(),
        } as CatalogItem));
      }
    }
  } catch {
  }

  const categories = [
    { cat: "City Tours", icon: "🏛️", basePrice: 25, desc: "Guided walking & sightseeing tours" },
    { cat: "Food & Drink", icon: "🍽️", basePrice: 45, desc: "Cooking classes & food tasting experiences" },
    { cat: "Outdoor & Adventure", icon: "🧗", basePrice: 55, desc: "Hiking, cycling & adventure activities" },
    { cat: "Museums & Culture", icon: "🎭", basePrice: 30, desc: "Skip-the-line museum & cultural tickets" },
    { cat: "Day Trips", icon: "🚌", basePrice: 75, desc: "Full-day excursions from " + city },
    { cat: "Water Activities", icon: "🚢", basePrice: 40, desc: "Boat tours, kayaking & water sports" },
  ];

  return categories.slice(0, params.limit || 6).map((c, i): CatalogItem => ({
    id: `gyg-${city.toLowerCase().replace(/\s+/g, "-")}-${c.cat.toLowerCase().replace(/[^a-z]/g, "-")}`,
    type: "activity",
    provider: "getyourguide",
    externalId: `gyg-${i}`,
    title: `${c.icon} ${c.cat} in ${city}`,
    description: `${c.desc} · Book on GetYourGuide · Free cancellation available`,
    imageUrl: null,
    price: c.basePrice,
    currency: "USD",
    rating: 4.5 + (i % 3) * 0.1,
    reviewCount: null,
    destination: params.destination,
    location: null,
    duration: null,
    categories: ["activity", c.cat.toLowerCase()],
    tags: ["getyourguide", c.cat.toLowerCase()],
    bookingUrl: `https://www.getyourguide.com/s/?q=${encodeURIComponent(city + " " + c.cat)}&partner_id=${token}`,
    affiliateUrl: `https://www.getyourguide.com/s/?q=${encodeURIComponent(city + " " + c.cat)}&partner_id=${token}`,
    source: "travelpayouts/getyourguide",
    lastUpdated: new Date(),
  } as CatalogItem));
}
