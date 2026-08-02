import { getTravelpayoutsToken } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";
import { reportProviderResult, outcomeFromHttpStatus } from "../provider-health.service";

const KIWITAXI_API = "https://api.kiwitaxi.com";

export interface KiwiTaxiSearchParams {
  from: string;
  to: string;
  date?: string;
  passengers?: number;
  limit?: number;
  currency?: string;
}

export async function searchKiwiTaxi(params: KiwiTaxiSearchParams): Promise<CatalogItem[]> {
  const token = getTravelpayoutsToken();
  if (!token) return [];

  try {
    const date = params.date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const url = new URL(`${KIWITAXI_API}/transfers`);
    url.searchParams.set("from", params.from);
    url.searchParams.set("to", params.to);
    url.searchParams.set("date", date);
    url.searchParams.set("passengers", String(params.passengers || 2));
    url.searchParams.set("currency", params.currency || "USD");
    url.searchParams.set("api_key", token);

    const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
    if (res.ok) {
      const data = await res.json();
      const transfers = data?.transfers || data?.results || data || [];

      if (Array.isArray(transfers) && transfers.length > 0) {
        reportProviderResult("kiwitaxi", "ok");
        return transfers.slice(0, params.limit || 6).map((t: any): CatalogItem => ({
          id: `kiwitaxi-${t.id || Math.random().toString(36).slice(2)}`,
          type: "transfer",
          provider: "kiwitaxi",
          externalId: String(t.id || ""),
          title: `🚕 ${params.from} → ${params.to}`,
          description: `${t.vehicle?.class || "Standard"} transfer · ${t.passengers || params.passengers} passengers · Meet & greet included`,
          imageUrl: t.vehicle?.image || null,
          price: t.price ? parseFloat(t.price) : null,
          currency: params.currency || "USD",
          rating: null, // §13: Kiwitaxi's API returns no rating — never invent one
          reviewCount: null,
          destination: params.to,
          location: null,
          duration: t.duration ? `${Math.round(t.duration / 60)} min` : null,
          categories: ["transfer", "airport-transfer"],
          tags: ["kiwitaxi", "transfer", t.vehicle?.class?.toLowerCase() || "standard"],
          bookingUrl: t.booking_url || `https://kiwitaxi.com/transfer/${encodeURIComponent(params.from)}/${encodeURIComponent(params.to)}?api_key=${token}`,
          affiliateUrl: t.booking_url || `https://kiwitaxi.com/transfer/${encodeURIComponent(params.from)}/${encodeURIComponent(params.to)}?api_key=${token}`,
          source: "travelpayouts/kiwitaxi",
          lastUpdated: new Date(),
        } as CatalogItem));
      }
      // Real API succeeded with zero transfers — honest empty, not an error.
      reportProviderResult("kiwitaxi", "empty");
    } else {
      reportProviderResult("kiwitaxi", outcomeFromHttpStatus(res.status), `HTTP ${res.status}`);
    }
  } catch (err) {
    reportProviderResult("kiwitaxi", "error", err instanceof Error ? err.message : String(err));
  }

  // §13: the fabricated vehicle-class fallback that used to live here (invented prices and a 4.6
  // rating, rendered whenever the real call failed) is REMOVED — a failed or empty live call
  // returns an honest empty list; the provider-health registry carries the failure status.
  return [];
}
