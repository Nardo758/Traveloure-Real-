/**
 * A bundle's market-page city (Phase 3, decision-maker Sep 24, 2026: listings with no meeting place
 * must still reach their city page). `provider_services.city` is only ever server-derived
 * (server/utils/service-city.ts), and a bundle has no neighborhood of its own, so every bundle was
 * absent from every city page. It is derived from its COMPONENTS: the one city they all share, or
 * NULL when any component has none or they disagree — a mixed bundle is never filed under a guessed
 * city (§13). Pure.
 */
export function deriveBundleCity(components: readonly { city?: string | null }[]): string | null {
  const cities = components.map((c) => (c.city ?? "").trim());
  if (cities.length === 0 || cities.some((c) => c === "")) return null;
  const first = cities[0];
  return cities.every((c) => c.toLowerCase() === first.toLowerCase()) ? first : null;
}
