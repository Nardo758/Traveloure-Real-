/**
 * Flight schedule lookup config ("Getting there", surface step 2; ledger
 * `2026-10-03-surface-step2-tools-tray`). All of it is DEPLOYMENT config — the key never lives in a
 * tracked file. Off unless `FLIGHT_LOOKUP_ENABLED=1` AND a key is set; off ⇒ the sheet takes a
 * manual time instead.
 *
 * Provider: AeroDataBox (via RapidAPI) — its flight-number endpoint takes the number and the local
 * date in the path and answers both airports, both scheduled times and terminals in one call.
 */
function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function flightLookupApiKey(): string | null {
  const k = (process.env.FLIGHT_LOOKUP_API_KEY ?? "").trim();
  return k || null;
}

export function flightLookupEnabled(): boolean {
  return process.env.FLIGHT_LOOKUP_ENABLED === "1" && flightLookupApiKey() !== null;
}

/** Billed lookups allowed per UTC day across the platform (a cache hit costs nothing and is not counted). */
export function flightLookupDailyCap(): number {
  return Math.floor(envNumber("FLIGHT_LOOKUP_DAILY_CAP", 100));
}

/** What one lookup is recorded as costing in `api_usage_logs`, in cents. The operator confirms the plan rate. */
export function flightLookupCostCents(): number {
  return Math.round(envNumber("FLIGHT_LOOKUP_COST_CENTS", 1));
}

/** RapidAPI host for AeroDataBox; overridable for the provider's own API.market host. */
export function flightLookupHost(): string {
  return (process.env.FLIGHT_LOOKUP_HOST ?? "aerodatabox.p.rapidapi.com").trim();
}

/** How long a (flight, date) answer is reused, in hours. Schedules move rarely; status is phase 2. */
export function flightLookupCacheHours(): number {
  return envNumber("FLIGHT_LOOKUP_CACHE_HOURS", 24);
}
