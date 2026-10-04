/**
 * Photo sources (R-aq; step 6 — ledger `2026-10-04-step6-trip-card`). Deployment config by name;
 * nothing here is a price literal for code (the cost is what a call is RECORDED as costing).
 *   PLACE_PHOTOS_WIKIMEDIA_ENABLED  — Commons lookups (free, cached); on unless set to "0"
 *   PLACE_PHOTOS_RECHECK_DAYS       — how long a Commons answer (hit or miss) is reused (default 30)
 *   PLACE_PHOTOS_DAILY_CAP          — live Google Place Photo calls per UTC day (default 0 = OFF until
 *                                     the operator verifies Place Photo pricing and sets it)
 *   PLACE_PHOTOS_COST_CENTS         — what one live photo call is recorded as costing (default 0)
 * Google also needs the Places spine on (`PLACE_FACTS_PLACES_ENABLED=1` + `GOOGLE_MAPS_API_KEY`).
 */
function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return process.env[name] != null && process.env[name] !== "" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function placePhotosWikimediaEnabled(): boolean {
  return process.env.PLACE_PHOTOS_WIKIMEDIA_ENABLED !== "0";
}

export function placePhotosRecheckDays(): number {
  return Math.max(1, Math.floor(envNumber("PLACE_PHOTOS_RECHECK_DAYS", 30)));
}

export function placePhotosDailyCap(): number {
  return Math.floor(envNumber("PLACE_PHOTOS_DAILY_CAP", 0));
}

export function placePhotosCostCents(): number {
  return envNumber("PLACE_PHOTOS_COST_CENTS", 0);
}

export function placePhotosGoogleEnabled(): boolean {
  return placePhotosDailyCap() > 0 && process.env.PLACE_FACTS_PLACES_ENABLED === "1" && !!process.env.GOOGLE_MAPS_API_KEY;
}

/** Commons asks for a polite, identifying user agent. */
export const WIKIMEDIA_USER_AGENT = "Traveloure/1.0 (place photos; https://traveloure.com)";
