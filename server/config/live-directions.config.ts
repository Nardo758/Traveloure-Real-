/**
 * TC-4 — the Trip Card's live-directions provider per city (LD 69; ledger `2026-10-11-tc4-live-directions`).
 *
 * LD 69: the Trip Card shows exact times only — fetched at the moment from a timetable source, or a deep link to
 * one. Today every city links to Google Maps directions (decision-maker ruling 2, Oct 11, 2026). This file exists
 * so a city can later name another provider without a code change to the builder; no other provider is
 * configured, and none may be added without a ruling.
 */
export const LIVE_DIRECTIONS_PROVIDERS = ["google_maps"] as const;
export type LiveDirectionsProvider = (typeof LIVE_DIRECTIONS_PROVIDERS)[number];

/** Per-city overrides, keyed by market slug. Empty: every city uses the default. */
const PROVIDER_BY_MARKET: Readonly<Record<string, LiveDirectionsProvider>> = Object.freeze({});

export const DEFAULT_LIVE_DIRECTIONS_PROVIDER: LiveDirectionsProvider = "google_maps";

export function liveDirectionsProviderFor(marketSlug: string | null | undefined): LiveDirectionsProvider {
  return (marketSlug && PROVIDER_BY_MARKET[marketSlug.toLowerCase()]) || DEFAULT_LIVE_DIRECTIONS_PROVIDER;
}
