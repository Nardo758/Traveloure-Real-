/**
 * R2-2's two rules, kept DB-FREE so the no-DB pin lane can execute them.
 *
 * They started inside `location-view.service.ts`, whose module graph opens the database (it imports
 * `../db`), so a unit-pins lane importing the service died on "DATABASE_URL must be set". The rules
 * themselves need nothing but the operating-market table: a country and a cacheability question.
 */

import { OPERATING_MARKETS } from "@shared/operating-markets";
import { resolveMarketSlug } from "./trend-engine/operating-markets";

/**
 * The country a recommendations call needs, when the caller passed no `?country=`.
 *
 * An OPERATING MARKET already knows its own country, so a caller that omits the param is not a
 * caller who lacks the fact. Returns null for a city that is not one of the eight — the honest "not
 * captured" answer, never a nearest-looking guess (§13).
 */
export function marketCountryFor(cityName: string | null | undefined): string | null {
  const market = resolveMarketSlug(cityName);
  if (!market) return null;
  return OPERATING_MARKETS.find((m) => m.marketKey === market)?.country ?? null;
}

/**
 * Is this payload safe to cache?
 *
 * "Never cache an error/timeout result" (the probe found a 12 s events timeout re-served in ~0.2 s
 * for the rest of the window). A section that carries an error is a statement about a FAILED read,
 * not about the city, so caching it freezes the failure. One clean payload is enough to say the read
 * worked; anything else waits for the next request.
 */
export function locationViewCacheable(payload: {
  hero: { error: string | null };
  recommendations: { error: string | null };
  events: { error: string | null };
  neighborhoods: { error: string | null };
  gems: { error: string | null };
  services: { error: string | null };
  externalStubs: { error: string | null };
}): boolean {
  return [
    payload.hero,
    payload.recommendations,
    payload.events,
    payload.neighborhoods,
    payload.gems,
    payload.services,
    payload.externalStubs,
  ].every((section) => section.error === null);
}
