/**
 * The operator switches `/api/health` reports (ledger `2026-09-30-health-flags`; decision-maker, Sep 30,
 * 2026: "the /api/health `flags` block (booleans only for PLACE_FACTS_PLACES_ENABLED,
 * AFFILIATE_PAGE_EXTRACT_ENABLED, DMO_INGEST_ENABLED, E2E_AI_STUB; never secret values)").
 *
 * Pure. Each flag is `true` exactly when its env var is the string "1" — the same test every reader of
 * these switches applies — and `false` otherwise (unset included). It reports the SWITCH, not the
 * whole effective state: the Places spine also needs `GOOGLE_MAPS_API_KEY`, and the AI stub also needs a
 * non-production environment; neither of those is read or reported here. The list is closed: a name is
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

export function healthFlags(env: Record<string, string | undefined> = process.env): HealthFlags {
  const out = {} as HealthFlags;
  for (const name of HEALTH_FLAG_NAMES) out[name] = env[name] === "1";
  return out;
}
