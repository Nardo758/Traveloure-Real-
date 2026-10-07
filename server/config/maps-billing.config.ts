/**
 * Google Maps Platform callers — the switches, caps and recorded costs (R299, ledger
 * `2026-10-04-maps-billing-audit`). Deployment config by name only; the key never lives in a tracked
 * file. Each caller's env names are on its row in `@shared/maps-billing`:
 *   <enabledEnv>   — "1" turns the caller on (also needs `GOOGLE_MAPS_API_KEY`); OFF otherwise
 *   <dailyCapEnv>  — billable calls per UTC day across the platform (0 = none)
 *   <costEnv>      — what one call is RECORDED as costing (the row's unit); the operator confirms
 *                    the billed rate on the Google Cloud invoice
 */
import { MAPS_CALLERS, type MapsCallerKey } from "@shared/maps-billing";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function mapsApiKey(): string | null {
  const k = (process.env.GOOGLE_MAPS_API_KEY ?? "").trim();
  return k || null;
}

export function mapsCallerEnabled(key: MapsCallerKey): boolean {
  return process.env[MAPS_CALLERS[key].enabledEnv] === "1";
}

export function mapsCallerDailyCap(key: MapsCallerKey): number {
  const c = MAPS_CALLERS[key];
  return Math.floor(envNumber(c.dailyCapEnv, c.defaultDailyCap));
}

/** The recorded cost of `units` billable events, in TENTHS of a cent (an integer column holds sub-cent calls). */
export function mapsCallerCostTenthsOfCent(key: MapsCallerKey, units: number): number {
  const c = MAPS_CALLERS[key];
  const v = envNumber(c.costEnv, c.defaultCost);
  const centsPerUnit = c.costUnit === "usd_per_1000" ? (v * 100) / 1000 : v;
  return Math.round(centsPerUnit * 10 * units);
}

/**
 * The cost a gate row records (step 9a ruling 7, ledger `2026-10-07-step9a-routing-engine`): a FAILED
 * call records 0 — it still counts toward the cap through its row's `request_count`; a caller whose cost
 * lives on another table (`costRecordedOn` ≠ api_usage_logs) records 0 so a reader never sums twice.
 */
export function mapsCallRecordedTenths(key: MapsCallerKey, units: number, success: boolean): number {
  if (!success || MAPS_CALLERS[key].costRecordedOn !== "api_usage_logs") return 0;
  return mapsCallerCostTenthsOfCent(key, units);
}
