/**
 * The operator switches `/api/health` reports (ledger `2026-09-30-health-flags`; decision-maker, Sep 30,
 * 2026: "the /api/health `flags` block (booleans only for PLACE_FACTS_PLACES_ENABLED,
 * AFFILIATE_PAGE_EXTRACT_ENABLED, DMO_INGEST_ENABLED, E2E_AI_STUB; never secret values)").
 *
 * Pure. Each flag is `true` exactly when its env var is the string "1" — the same test every reader of
 * these switches applies — and `false` otherwise (unset included). It reports the SWITCH, not the
 * whole effective state: the Places spine also needs `GOOGLE_MAPS_API_KEY`, and the AI stub is ignored
 * whenever `NODE_ENV` is `production` even if this switch reads true; neither of those is read or
 * reported here. The list is closed: a name is
 * added here deliberately, and only a boolean ever leaves, never an env value.
 */
import { MAPS_CALLER_KEYS, type MapsCallerKey } from "@shared/maps-billing";
import { mapsCallerDailyCap } from "../config/maps-billing.config";

export const HEALTH_FLAG_NAMES = [
  "PLACE_FACTS_PLACES_ENABLED",
  "AFFILIATE_PAGE_EXTRACT_ENABLED",
  "DMO_INGEST_ENABLED",
  "E2E_AI_STUB",
  // Surface step 2's flight schedule lookup (ledger `2026-10-03-surface-step2-tools-tray`). The SWITCH
  // only: `FLIGHT_LOOKUP_API_KEY` is also required and is never read or reported here.
  "FLIGHT_LOOKUP_ENABLED",
  // R-bo (work plan L1-19): expert scrape jobs, admin-only and OFF in production.
  "EXPERT_SCRAPE_JOBS_ENABLED",
  // R299 Maps billing switches and (step 9c D6, `healthMapsCaps`) cap values: configuration only —
  // never credentials, prices, spend or a claim that a provider request succeeded.
  "MAPS_ROUTES_DRIVE_ENABLED",
  "MAPS_ROUTES_MODE_ENABLED",
  "MAPS_ROUTES_TRANSIT_ENABLED",
  "MAPS_ROUTE_MATRIX_ENABLED",
  "MAPS_GEOCODE_ENABLED",
  "MAPS_PLACES_TEXT_SEARCH_ENABLED",
  // Smoke 13 (ledger `2026-10-06-smoke13-handoff-money`): relaxes ONLY the seed-domain clause of the
  // routability predicate (CI's seeded fixtures). Production must read false.
  "SHOW_DEMO_EXPERTS",
  // P0-b item 6 (ledger `2026-10-11-p0b-routing-follow-ups`): the routing engine's switch and the CI stub
  // adapter's switch, so a production read can show whether legs are being routed at all.
  "TRAVEL_TIME_SERVICE_ENABLED",
  "ROUTING_ADAPTER_STUB",
  // PX-1 (ledger `2026-10-18-px1-partner-links`): GetYourGuide is paused unless this is "1".
  "GETYOURGUIDE_ENABLED",
  // VD-1 (ledger `2026-10-18-viator-direct-live`): the live Viator Partner API search is off unless "1".
  "VIATOR_DIRECT_ENABLED",
] as const;

export type HealthFlags = Record<(typeof HEALTH_FLAG_NAMES)[number], boolean>;

// Boot seeder observation only; reading health never sends a geocoder request.
export const healthEgress = { nominatim: "untested" as "ok" | "blocked" | "untested" };

/** What `/api/health` reports for egress: booleans only, read from the cached boot-seeder outcome.
 *  `nominatimChecked` — the boot seeder made at least one eligible lookup; `nominatimReachable` — every
 *  such lookup answered. Never-checked is `{ false, false }`, never a claim of reachability (§13). */
export function healthEgressFlags(state: typeof healthEgress = healthEgress): { nominatimChecked: boolean; nominatimReachable: boolean } {
  return { nominatimChecked: state.nominatim !== "untested", nominatimReachable: state.nominatim === "ok" };
}

/**
 * Step 9c D6 (ledger `2026-10-07-step9c-leg-options`; architect ruling, Oct 7, 2026): each Maps caller's
 * EFFECTIVE daily cap — the integer the R299 gate enforces (`mapsCallerDailyCap`, the env value or the
 * code default) — keyed by caller, beside the switches. Never an env name, never spend or cost (those
 * stay behind the secret on `/internal/jobs/health`). Changing a cap still means the deployment's
 * secrets until FU-9C-3 puts caps on the admin fees/switches screen.
 */
export function healthMapsCaps(env: Record<string, string | undefined> = process.env): Record<MapsCallerKey, number> {
  const out = {} as Record<MapsCallerKey, number>;
  for (const key of MAPS_CALLER_KEYS) out[key] = mapsCallerDailyCap(key, env);
  return out;
}

/**
 * P0-b item 6 (ledger `2026-10-11-p0b-routing-follow-ups`): whether a credential is SET — a boolean and
 * nothing else. Never the value, a prefix, a length or a hash. Present means non-empty after trimming; it
 * says nothing about whether the key is valid or what it is allowed to call.
 */
export const HEALTH_KEY_NAMES = { googleMaps: "GOOGLE_MAPS_API_KEY" } as const;
export function healthKeyPresence(env: Record<string, string | undefined> = process.env): Record<keyof typeof HEALTH_KEY_NAMES, boolean> {
  const out = {} as Record<keyof typeof HEALTH_KEY_NAMES, boolean>;
  for (const [k, name] of Object.entries(HEALTH_KEY_NAMES) as [keyof typeof HEALTH_KEY_NAMES, string][]) {
    out[k] = typeof env[name] === "string" && env[name]!.trim().length > 0;
  }
  return out;
}

export function healthFlags(env: Record<string, string | undefined> = process.env): HealthFlags {
  const out = {} as HealthFlags;
  for (const name of HEALTH_FLAG_NAMES) out[name] = env[name] === "1";
  return out;
}
