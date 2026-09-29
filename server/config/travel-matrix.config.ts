/**
 * The launch-city travel-time matrix's prices and limits (Track A step A2; ledger
 * `2026-09-29-a2-travel-time-matrix`; product map §M4, R186). Config, never a literal at a call site.
 *
 * PRICES are Google Routes **Compute Route Matrix** list prices per 1,000 elements, as ruled in §M4:
 *   · walking bills as **Essentials** — $5.00 / 1,000, first 10,000 elements a month free;
 *   · transit bills as **Pro** — $10.00 / 1,000, first 5,000 elements a month free, and a transit
 *     request may carry at most 100 elements, so transit is batched.
 * The planning CEILING is $10.00 / 1,000 for every element with no free caps. A run records the
 * prices it was costed at on its own row; the operator confirms the billed rate in the Google Cloud
 * console after the first refresh (R186). Each is env-overridable for when Google's list price moves.
 */
function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/** USD per 1,000 elements, Essentials SKU (walking / driving). */
export function essentialsPricePer1000(): number {
  return envNumber("TRAVEL_MATRIX_ESSENTIALS_PRICE_PER_1000", 5);
}
/** USD per 1,000 elements, Pro SKU (transit). */
export function proPricePer1000(): number {
  return envNumber("TRAVEL_MATRIX_PRO_PRICE_PER_1000", 10);
}
/** The planning ceiling per 1,000 elements, any SKU, no free cap — a run above it is refused. */
export function ceilingPricePer1000(): number {
  return envNumber("TRAVEL_MATRIX_CEILING_PRICE_PER_1000", 10);
}
/** Monthly free elements per SKU (Google's own caps; recorded, never relied on to refuse a run). */
export function essentialsFreeElementsPerMonth(): number {
  return envNumber("TRAVEL_MATRIX_ESSENTIALS_FREE_PER_MONTH", 10_000);
}
export function proFreeElementsPerMonth(): number {
  return envNumber("TRAVEL_MATRIX_PRO_FREE_PER_MONTH", 5_000);
}
/** Google's per-request element caps: 100 for transit, 625 otherwise. */
export function transitElementsPerRequest(): number {
  return envNumber("TRAVEL_MATRIX_TRANSIT_ELEMENTS_PER_REQUEST", 100);
}
export function otherElementsPerRequest(): number {
  return envNumber("TRAVEL_MATRIX_OTHER_ELEMENTS_PER_REQUEST", 625);
}
/** How old a complete refresh may be before another is due, when the centroids have not changed. */
export function refreshAfterDays(): number {
  return envNumber("TRAVEL_MATRIX_REFRESH_AFTER_DAYS", 30);
}
/**
 * The largest single refresh the job will run, in list-price USD at the ceiling rate. A run whose
 * ceiling cost exceeds this is refused before any call — a mis-seeded city with 400 centroids must
 * not bill $3,200 on one signal. §M4's own planning ceiling for Kyoto is $72 (60 centroids, 2 modes).
 */
export function maxRefreshCeilingUsd(): number {
  return envNumber("TRAVEL_MATRIX_MAX_REFRESH_CEILING_USD", 100);
}
/** Local departure time transit is routed at ("HH:MM", on the next weekday) — a matrix built at 3am has no trains. */
export function transitDepartureLocalTime(): string {
  const raw = (process.env.TRAVEL_MATRIX_TRANSIT_DEPARTURE_LOCAL || "").trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : "10:00";
}
