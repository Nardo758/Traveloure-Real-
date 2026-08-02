import type { CatalogItem } from "../experience-catalog.service";
import { reportProviderResult, outcomeFromHttpStatus } from "../provider-health.service";

/**
 * RETIRED SOURCE (flights + nomad) — do not re-enable against TRAVELPAYOUTS_TOKEN.
 *
 * Live probe, 2026-08-02 (production-adjacent Replit environment): every call to Kiwi's Tequila API
 * (`https://api.tequila.kiwi.com/v2/search`) returns `401 Unauthorized` when sent the Travelpayouts
 * token. That is not a transient outage: Tequila is a SEPARATE credential system from Travelpayouts —
 * this code was sending the wrong kind of token — and Kiwi closed Tequila to new partner signups in
 * 2023, so a correct Tequila API key is not currently obtainable to fix this the normal way (same class
 * of dead-end as Hotellook's retired data API — see hotellook.service.ts).
 *
 * `/api/catalog/flights` and `/api/catalog/nomad` (server/routes/content.routes.ts) both silently
 * degraded to 0 results from this source — indistinguishable from "no flights found." Both are now
 * honest about it: `/api/catalog/flights` drops Kiwi from its fan-out (Aviasales-only); `/api/catalog/nomad`
 * (Kiwi-only — nomad routing has no other source) returns `{items: [], total: 0, retired: true}` instead
 * of a bare empty array.
 *
 * Config-pointable revival seam: if Kiwi ever reopens Tequila to new partners (or an existing partner
 * key becomes available), set `KIWI_TEQUILA_API_KEY` — the functions below use it (NOT
 * TRAVELPAYOUTS_TOKEN) and take the real fetch path. Until that env var is set, both functions return
 * `[]` unconditionally and make zero network calls (§13 — never fabricate, never guess).
 */

const KIWI_BASE = "https://api.tequila.kiwi.com";

function getKiwiTequilaKey(): string | null {
  return process.env.KIWI_TEQUILA_API_KEY || null;
}

async function kiwiFetch(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const token = getKiwiTequilaKey();
  if (!token) throw new Error("KIWI_TEQUILA_API_KEY not configured");

  const url = new URL(path, KIWI_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      "apikey": token,
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Kiwi API error ${res.status}: ${text.slice(0, 200)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export interface KiwiSearchParams {
  flyFrom: string;
  flyTo?: string;
  dateFrom?: string;
  dateTo?: string;
  returnFrom?: string;
  returnTo?: string;
  currency?: string;
  limit?: number;
}

/** Retired — see header. Returns [] unconditionally unless KIWI_TEQUILA_API_KEY is set. */
export async function searchKiwiFlights(params: KiwiSearchParams): Promise<CatalogItem[]> {
  const token = getKiwiTequilaKey();
  if (!token) return []; // retired: no reportProviderResult call — the registry's static map already marks this 'retired'.

  try {
    const queryParams: Record<string, string | number | undefined> = {
      fly_from: params.flyFrom,
      curr: params.currency || "USD",
      limit: params.limit || 10,
      sort: "price",
    };

    if (params.flyTo) queryParams.fly_to = params.flyTo;
    if (params.dateFrom) queryParams.date_from = params.dateFrom;
    if (params.dateTo) queryParams.date_to = params.dateTo;
    if (params.returnFrom) queryParams.return_from = params.returnFrom;
    if (params.returnTo) queryParams.return_to = params.returnTo;

    const data = await kiwiFetch("/v2/search", queryParams);
    const flights = data?.data || [];

    const items = flights.map((f: any): CatalogItem => ({
      id: `kiwi-${f.id || f.booking_token?.slice(0, 16) || Math.random()}`,
      type: "flight",
      provider: "kiwi",
      externalId: f.id || f.booking_token,
      title: `${f.cityFrom || f.flyFrom} → ${f.cityTo || f.flyTo}`,
      description: `${f.airlines?.join(", ") || "Flight"} · ${f.route?.length || 1} stop(s)`,
      imageUrl: null,
      price: f.price ?? null,
      currency: params.currency || "USD",
      rating: null,
      reviewCount: null,
      destination: f.cityTo || f.flyTo,
      location: f.longitude ? { lat: f.latitude, lng: f.longitude } : null,
      duration: f.fly_duration || null,
      categories: ["flight"],
      tags: f.airlines || [],
      bookingUrl: f.deep_link || null,
      affiliateUrl: f.deep_link || null,
      source: "travelpayouts/kiwi",
      lastUpdated: new Date(),
    } as CatalogItem));
    reportProviderResult("kiwi", items.length > 0 ? "ok" : "empty");
    return items;
  } catch (err) {
    const status = (err as any)?.status;
    reportProviderResult("kiwi", status ? outcomeFromHttpStatus(status) : "error", err instanceof Error ? err.message : String(err));
    console.warn("[Kiwi] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export interface NomadParams {
  cities: string[];
  nights_in_dst_from?: number;
  nights_in_dst_to?: number;
  currency?: string;
  limit?: number;
}

/** Retired — see header. Returns [] unconditionally unless KIWI_TEQUILA_API_KEY is set. */
export async function searchKiwiNomad(params: NomadParams): Promise<CatalogItem[]> {
  const token = getKiwiTequilaKey();
  if (!token) return []; // retired: no reportProviderResult call — the registry's static map already marks this 'retired'.

  try {
    const queryParams: Record<string, string | number | undefined> = {
      fly_from: params.cities[0],
      curr: params.currency || "USD",
      nights_in_dst_from: params.nights_in_dst_from || 3,
      nights_in_dst_to: params.nights_in_dst_to || 14,
      limit: params.limit || 5,
      trip_type: "nomad",
    };

    if (params.cities.length > 1) {
      queryParams.fly_to = params.cities.slice(1).join(",");
    }

    const data = await kiwiFetch("/v2/search", queryParams);
    const flights = data?.data || [];

    const items = flights.map((f: any): CatalogItem => ({
      id: `kiwi-nomad-${f.id || Math.random()}`,
      type: "flight",
      provider: "kiwi",
      externalId: f.id,
      title: `Nomad route: ${params.cities.join(" → ")}`,
      description: f.route?.map((r: any) => `${r.cityFrom}→${r.cityTo}`).join(", ") || "",
      imageUrl: null,
      price: f.price ?? null,
      currency: params.currency || "USD",
      rating: null,
      reviewCount: null,
      destination: params.cities[params.cities.length - 1],
      location: null,
      duration: f.fly_duration || null,
      categories: ["flight", "nomad"],
      tags: ["multi-city", "nomad"],
      bookingUrl: f.deep_link || null,
      affiliateUrl: f.deep_link || null,
      source: "travelpayouts/kiwi",
      lastUpdated: new Date(),
    } as CatalogItem));
    reportProviderResult("kiwi", items.length > 0 ? "ok" : "empty");
    return items;
  } catch (err) {
    const status = (err as any)?.status;
    reportProviderResult("kiwi", status ? outcomeFromHttpStatus(status) : "error", err instanceof Error ? err.message : String(err));
    console.warn("[Kiwi Nomad] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
