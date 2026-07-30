/**
 * L27-P3 — the single server-side write path for a provider_services listing's
 * precise location (migration 129's `latitude` / `longitude` / `location_precision`).
 *
 * §13 TRUTHFULNESS RULES ENFORCED HERE (the reason this is one shared helper and
 * not inline per-route logic):
 *
 *  1. `location_precision` is DERIVED SERVER-SIDE, never read from the request.
 *     It is set to `'exact'` only, and exactly, when the request carries a valid
 *     `locationPoint` — the payload the picker sends after the earner pressed
 *     Confirm. A typed address that was never confirmed is not `'exact'`.
 *  2. Raw `latitude` / `longitude` / `locationPrecision` in the body are STRIPPED
 *     and ignored. `insertProviderServiceSchema` exposes those columns (it is
 *     generated from the table), so without this strip a client could assert
 *     `'exact'` with no point, or coordinates with no precision — a fabricated
 *     precision claim. This is the same defensive posture as the F2
 *     `approvalStatus` born-state clamp.
 *  3. NO `locationPoint` key ⇒ NO coordinate columns in the patch at all. On
 *     create the columns stay NULL; on update the existing values are left
 *     exactly as they are — so a migration-129 `'neighborhood_centroid'` row is
 *     never silently upgraded to `'exact'` by an unrelated edit.
 *  4. `locationPoint: null` ⇒ the earner explicitly removed their pin: all three
 *     columns go NULL. NULL is the honest "no point" state — never a city-centre
 *     or centroid fallback (the migration-129 "no fabrication" rule).
 *  5. `city` is NOT touched here. Deriving a city by parsing a geocoded string
 *     would be inference dressed as data; migration 129 sets it only from a real
 *     `city_neighborhoods` match.
 */

/** Values written to the additive-nullable migration-129 columns. */
export interface ServiceLocationPatch {
  latitude?: string | null;
  longitude?: string | null;
  locationPrecision?: string | null;
}

/** `location_precision` for a point the earner confirmed on the map. */
export const LOCATION_PRECISION_EXACT = "exact";

export class ServiceLocationError extends Error {}

/** DECIMAL(10,7) — 7 fractional digits (~1cm), matching the column. */
const toColumnValue = (n: number): string => n.toFixed(7);

function parsePoint(raw: any): { lat: number; lng: number } {
  const lat = typeof raw?.lat === "number" ? raw.lat : parseFloat(String(raw?.lat));
  const lng = typeof raw?.lng === "number" ? raw.lng : parseFloat(String(raw?.lng));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ServiceLocationError("locationPoint must carry numeric lat and lng");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ServiceLocationError("locationPoint is outside valid coordinate range");
  }
  return { lat, lng };
}

/**
 * Split a create/update body into (a) the body the listing schema should parse,
 * with every client-supplied location column removed, and (b) the derived
 * coordinate patch.
 *
 * Throws ServiceLocationError (→ 400) on a malformed `locationPoint`; callers
 * must not fall back to writing a partial point.
 */
export function extractServiceLocation<T extends Record<string, any>>(
  body: T,
): { body: Omit<T, "latitude" | "longitude" | "locationPrecision" | "locationPoint">; patch: ServiceLocationPatch } {
  const {
    latitude: _lat,
    longitude: _lng,
    locationPrecision: _prec,
    locationPoint,
    ...rest
  } = body ?? ({} as T);

  // Rule 3: absent ⇒ no coordinate columns touched.
  if (!Object.prototype.hasOwnProperty.call(body ?? {}, "locationPoint") || locationPoint === undefined) {
    return { body: rest as any, patch: {} };
  }

  // Rule 4: explicit removal.
  if (locationPoint === null) {
    return {
      body: rest as any,
      patch: { latitude: null, longitude: null, locationPrecision: null },
    };
  }

  if (typeof locationPoint !== "object" || Array.isArray(locationPoint)) {
    throw new ServiceLocationError("locationPoint must be an object with lat/lng, or null to clear it");
  }

  // Rule 1: a confirmed point — and only a confirmed point — is 'exact'.
  const { lat, lng } = parsePoint(locationPoint);
  return {
    body: rest as any,
    patch: {
      latitude: toColumnValue(lat),
      longitude: toColumnValue(lng),
      locationPrecision: LOCATION_PRECISION_EXACT,
    },
  };
}
