/**
 * EV PR 0 (ledger `2026-10-18-serp-cache-off`): SerpAPI's `google_maps` engine returns Google Maps
 * results — ratings, review counts, opening hours, coordinates, phone, website — and the two SerpAPI
 * services stored them in `serp_cache` for 24 hours. GH-1 stopped storing Google hours in `place_facts`;
 * `serp_cache` sat outside it. The SerpAPI calls, the cache write and every cache read are OFF until an
 * operator sets `SERPAPI_GOOGLE_MAPS_ENABLED=1`. Off ⇒ the services answer empty, exactly as they do with
 * no `SERP_API_KEY`. Rows already in `serp_cache` are kept and never read.
 */
export function serpApiGoogleMapsEnabled(): boolean {
  return process.env.SERPAPI_GOOGLE_MAPS_ENABLED === "1";
}
