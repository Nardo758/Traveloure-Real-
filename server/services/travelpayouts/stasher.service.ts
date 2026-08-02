import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";
import { reportProviderResult, outcomeFromHttpStatus } from "../provider-health.service";

const STASHER_API = "https://api.stasher.com/v2";

export interface StasherSearchParams {
  destination: string;
  date?: string;
  days?: number;
  bags?: number;
  limit?: number;
}

export async function searchStasher(params: StasherSearchParams): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  try {
    const city = params.destination.split(",")[0].trim();
    const url = new URL(`${STASHER_API}/locations`);
    url.searchParams.set("near", city);
    url.searchParams.set("limit", String(params.limit || 6));

    const res = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const locations = data?.locations || data?.data || data || [];

      if (Array.isArray(locations) && locations.length > 0) {
        const bags = params.bags || 1;
        const days = params.days || 1;

        reportProviderResult("stasher", "ok");
        return locations.slice(0, params.limit || 6).map((l: any): CatalogItem => ({
          id: `stasher-${l.id || l.place_id}`,
          type: "activity",
          provider: "stasher",
          externalId: String(l.id || l.place_id),
          title: `🧳 Luggage Storage — ${l.name || l.venue_name || city}`,
          description: `${l.address || l.vicinity || city} · Stasher certified · ${bags} bag${bags > 1 ? "s" : ""} · ${days} day${days > 1 ? "s" : ""}`,
          imageUrl: null,
          price: (l.daily_rate || 6) * bags * days,
          currency: "USD",
          rating: l.rating ? parseFloat(l.rating) : null, // §13: no invented rating when the API omits one
          reviewCount: l.review_count || null,
          destination: params.destination,
          location: l.lat && l.lng ? { lat: parseFloat(l.lat), lng: parseFloat(l.lng) } : null,
          duration: `${days} day${days > 1 ? "s" : ""}`,
          categories: ["luggage-storage", "service"],
          tags: ["stasher", "luggage", "storage", city.toLowerCase()],
          bookingUrl: l.booking_url || `https://stasher.com/city/${encodeURIComponent(city.toLowerCase())}?partner=travelpayouts`,
          affiliateUrl: l.booking_url || `https://stasher.com/city/${encodeURIComponent(city.toLowerCase())}?partner=travelpayouts`,
          source: "travelpayouts/stasher",
          lastUpdated: new Date(),
        } as CatalogItem));
      }
      // Real API succeeded with zero locations — honest empty, not an error.
      reportProviderResult("stasher", "empty");
    } else {
      reportProviderResult("stasher", outcomeFromHttpStatus(res.status), `HTTP ${res.status}`);
    }
  } catch (err) {
    reportProviderResult("stasher", "error", err instanceof Error ? err.message : String(err));
  }

  // §13: the fabricated spot-card fallback that used to live here (invented $-rates and a 4.7
  // rating) is REMOVED — a failed or empty live call returns an honest empty list; the
  // provider-health registry carries the failure status for the UI.
  return [];
}
