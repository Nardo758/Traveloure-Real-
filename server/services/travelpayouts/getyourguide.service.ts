import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";
import { reportProviderResult, outcomeFromHttpStatus } from "../provider-health.service";

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
        reportProviderResult("getyourguide", "ok");
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
      // Real API succeeded with zero tours — honest empty, not an error.
      reportProviderResult("getyourguide", "empty");
    } else {
      reportProviderResult("getyourguide", outcomeFromHttpStatus(res.status), `HTTP ${res.status}`);
    }
  } catch (err) {
    reportProviderResult("getyourguide", "error", err instanceof Error ? err.message : String(err));
  }

  // §13: the fabricated category-card fallback that used to live here (invented ratings/prices,
  // rendered whenever the real call failed) is REMOVED — a failed or empty live call returns an
  // honest empty list; the provider-health registry carries the failure status for the UI.
  return [];
}
