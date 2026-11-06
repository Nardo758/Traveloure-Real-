/**
 * R4-9 (round 4): `/search` had no route (it fell to Not Found). The catalogue search lives on a city page's one search
 * box, so `/search?q=…` goes to the marquee market's page with the query carried (`/discover/location/<city>?q=…`).
 */
export function catalogueSearchRedirectTarget(search: string, cityName: string): string {
  const q = new URLSearchParams(search).get("q")?.trim() ?? "";
  const base = `/discover/location/${encodeURIComponent(cityName.toLowerCase())}`;
  return q ? `${base}?q=${encodeURIComponent(q)}` : base;
}
