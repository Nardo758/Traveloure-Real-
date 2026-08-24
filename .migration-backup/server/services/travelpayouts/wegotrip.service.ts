import { getTravelpayoutsMarker } from "./travelpayouts-client";
import type { CatalogItem } from "../experience-catalog.service";
import { getCachedFeed, setCachedFeed } from "./travelpayouts-cache";
import { reportProviderResult } from "../provider-health.service";

/**
 * WeGoTrip (tours & audio guides) — Travelpayouts program #150.
 *
 * API (verified against WeGoTrip's affiliate API docs, linked from the Travelpayouts
 * help-center article "WeGoTrip affiliate program API"):
 *   • Base: https://wegotrip.com/api/v2 (app.wegotrip.com serves the same API).
 *   • City lookup: GET /search/?query=<name> → results[] with {id, name, slug, type:"city"}.
 *     (GET /products/ with a `city` param is NOT valid — it returns "Bad products id format";
 *     the product listing endpoint is /products/popular/.)
 *   • Products: GET /products/popular/?city=<cityId>&lang=en&currency=USD&page=N
 *     → data.results[] with {id, title, slug, preview, price, currencyCode, rating,
 *        reviewsCount, category, duration, city:{id,name,slug}}.
 *
 * Affiliate attribution (verified format, per the same docs):
 *   Travelpayouts partners append `?sub_id=<MARKER>` to the product URL:
 *     https://wegotrip.com/{city-slug}-d{cityId}/{product-slug}-p{productId}/?sub_id=<MARKER>
 *   where <MARKER> is the Travelpayouts account marker (getTravelpayoutsMarker()).
 */

const WEGOTRIP_BASE = "https://wegotrip.com/api/v2";
const BRAND = "wegotrip";

async function wegotripFetch(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const url = new URL(`${WEGOTRIP_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json", "Accept-Language": "en" },
  });
  if (!res.ok) {
    throw new Error(`WeGoTrip API error ${res.status}`);
  }
  const json = await res.json();
  if (json?.errors?.length) {
    throw new Error(`WeGoTrip API error: ${json.errors[0]?.message || "unknown"}`);
  }
  return json;
}

interface WeGoTripCity { id: number; name: string; slug: string }

/** Resolve a free-text city name to a WeGoTrip city via /search/. Cached. Null if not covered. */
async function resolveCity(city: string): Promise<WeGoTripCity | null> {
  const q = city.trim();
  if (q.length < 3) return null;
  const cacheKey = `wegotrip:cityresolve:${q.toLowerCase()}`;
  try {
    const cached = await getCachedFeed(BRAND, cacheKey);
    if (cached !== null) return cached[0] ?? null;

    const data = await wegotripFetch("/search/", { query: q });
    const results: any[] = data?.data?.results || [];
    const match = results.find(
      (r) => r.type === "city" && typeof r.name === "string" && r.name.toLowerCase() === q.toLowerCase(),
    ) || results.find((r) => r.type === "city");
    const resolved = match ? [{ id: match.id, name: match.name, slug: match.slug }] : [];
    await setCachedFeed(BRAND, cacheKey, resolved);
    return resolved[0] ?? null;
  } catch (err) {
    console.warn("[WeGoTrip] City resolve failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export interface WeGoTripSearchParams {
  city?: string;
  destination?: string;
  lang?: string;
  currency?: string;
  limit?: number;
}

export async function searchWeGoTripProducts(params: WeGoTripSearchParams): Promise<CatalogItem[]> {
  // NOTE: the WeGoTrip catalog API is public — no Travelpayouts API token is needed to fetch
  // products. Attribution comes solely from the ?sub_id=<marker> link parameter (see header),
  // and getTravelpayoutsMarker() always has a value. So no token gate here.
  const cityName = (params.city || params.destination || "").trim();
  if (!cityName) return [];
  const lang = params.lang || "en";
  const currency = params.currency || "USD";
  const limit = params.limit || 20;
  const cacheKey = `wegotrip:products:${cityName.toLowerCase()}:${lang}:${currency}`;

  try {
    const cached = await getCachedFeed(BRAND, cacheKey);
    if (cached !== null) {
      return mapWeGoTripProducts(cached, params).slice(0, limit);
    }

    const city = await resolveCity(cityName);
    if (!city) {
      // City not covered by WeGoTrip — honest empty result, cached to avoid re-probing.
      await setCachedFeed(BRAND, cacheKey, []);
      return [];
    }

    const data = await wegotripFetch("/products/popular/", { city: city.id, lang, currency });
    const products: any[] = data?.data?.results || [];
    const items = Array.isArray(products) ? products : [];

    await setCachedFeed(BRAND, cacheKey, items);
    const mapped = mapWeGoTripProducts(items, params).slice(0, limit);
    reportProviderResult("wegotrip", mapped.length > 0 ? "ok" : "empty");
    return mapped;
  } catch (err) {
    reportProviderResult("wegotrip", "error", err instanceof Error ? err.message : String(err));
    console.warn("[WeGoTrip] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Build the tracked outbound product URL (verified Travelpayouts format):
 *   https://wegotrip.com/{city-slug}-d{cityId}/{product-slug}-p{productId}/?sub_id=<MARKER>
 */
export function buildWeGoTripUrl(p: any): string | null {
  const citySlug = p?.city?.slug;
  const cityId = p?.city?.id;
  if (!p?.slug || !p?.id || !citySlug || !cityId) return null;
  return `https://wegotrip.com/${citySlug}-d${cityId}/${p.slug}-p${p.id}/?sub_id=${encodeURIComponent(getTravelpayoutsMarker())}`;
}

export function mapWeGoTripProducts(products: any[], params: WeGoTripSearchParams): CatalogItem[] {
  return products.map((p: any): CatalogItem => {
    const url = buildWeGoTripUrl(p);
    return {
      id: `wegotrip-${p.id}`,
      type: "activity",
      provider: "wegotrip",
      externalId: String(p.id),
      title: p.title || p.name || "Audio Tour",
      description: p.description || p.short_description || null,
      imageUrl: p.preview || p.cover || null,
      price: typeof p.price === "number" ? p.price : p.price ? parseFloat(p.price) : null,
      currency: p.currencyCode || "USD",
      rating: typeof p.rating === "number" ? p.rating : p.rating ? parseFloat(p.rating) : null,
      reviewCount: p.reviewsCount ?? null,
      destination: p.city?.name || params.city || params.destination || null,
      location: p.lat && p.lng ? { lat: parseFloat(p.lat), lng: parseFloat(p.lng) } : null,
      duration: p.duration || (p.durationMin ? `${p.durationMin} min` : null),
      categories: ["audio-tour", "walking-tour", p.category || "activity"].filter(Boolean),
      tags: p.tags && typeof p.tags === "object" && !Array.isArray(p.tags)
        ? Object.keys(p.tags).filter((k) => p.tags[k] === true)
        : p.tags || [],
      bookingUrl: url,
      affiliateUrl: url,
      source: "travelpayouts/wegotrip",
      lastUpdated: new Date(),
    } as CatalogItem;
  });
}

export async function getWeGoTripCities(): Promise<{ id: number; name: string; country: string }[]> {
  const cacheKey = "wegotrip:cities";
  try {
    const cached = await getCachedFeed(BRAND, cacheKey);
    if (cached !== null) {
      return cached.map((c: any) => ({
        id: c.id,
        name: c.name || c.title,
        country: typeof c.country === "string" ? c.country : c.country?.name || c.country_name || "",
      }));
    }

    const data = await wegotripFetch("/cities/", { lang: "en" });
    const cities = data?.data?.results || [];
    const items = Array.isArray(cities) ? cities : [];

    await setCachedFeed(BRAND, cacheKey, items);

    return items.map((c: any) => ({
      id: c.id,
      name: c.name || c.title,
      country: typeof c.country === "string" ? c.country : c.country?.name || c.country_name || "",
    }));
  } catch (err) {
    console.warn("[WeGoTrip] Cities fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
