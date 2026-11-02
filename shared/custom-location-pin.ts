/**
 * Custom "build around a location" pin — the typed refusal the Optimize pay gate returns
 * when that pin cannot be placed, and the placed pin a successful payments response may carry.
 *
 * Typed codes only. Traveler copy belongs to the dialog lane.
 *
 * HTTP 409
 * { "error": "custom_location_unplaceable", "reason": <CustomLocationRefusalReason> }
 *
 * A catalog id that does not resolve is a DIFFERENT response, HTTP 400
 * { "error": "pinned_anchor_not_found" }
 * with no reason field. It is not a placement refusal.
 *
 * A pin that names only an anchor type — no free-text place and no catalog id —
 * is HTTP 400 { "error": "pinned_anchor_invalid" }, also with no reason field.
 * It is not auto-anchored and it is not a placement refusal.
 *
 * Success (payments JSON, present only when a custom pin was placed this call):
 * resolvedPinnedAnchor: { type, name, lat, lng, formattedAddress }
 * placement: { lat, lng, source, at, sig }
 * formattedAddress is the provider's formatted address when this call geocoded, otherwise null.
 * `at` is an ISO-8601 UTC timestamp (`Date.toISOString()`). `source` is `google_geocode`.
 * `sig` is an HMAC the server checks; this module does not verify it.
 */

export const CUSTOM_LOCATION_UNPLACEABLE = "custom_location_unplaceable" as const;

export const CUSTOM_LOCATION_UNPLACEABLE_STATUS = 409 as const;

/** Catalog id miss. Not one of CUSTOM_LOCATION_REFUSAL_REASONS. */
export const PINNED_ANCHOR_NOT_FOUND = "pinned_anchor_not_found" as const;

export const PINNED_ANCHOR_NOT_FOUND_STATUS = 400 as const;

/** OPT-A: why an event or day pin does not resolve from the plan. Machine codes; the words are OPT-B's. */
export const PINNED_ANCHOR_NOT_FOUND_DETAILS = ["event_not_anchorable", "day_not_anchorable", "day_nothing_to_rebuild"] as const;
export type PinnedAnchorNotFoundDetail = (typeof PINNED_ANCHOR_NOT_FOUND_DETAILS)[number];

export interface PinnedAnchorNotFoundBody {
  error: typeof PINNED_ANCHOR_NOT_FOUND;
  detail?: PinnedAnchorNotFoundDetail;
}

/**
 * Type-only pin: hotel|neighborhood|activity with no free-text place and no catalog id.
 * Not one of CUSTOM_LOCATION_REFUSAL_REASONS, and not a catalog miss.
 */
export const PINNED_ANCHOR_INVALID = "pinned_anchor_invalid" as const;

export const PINNED_ANCHOR_INVALID_STATUS = 400 as const;

export interface PinnedAnchorInvalidBody {
  error: typeof PINNED_ANCHOR_INVALID;
}

export const CUSTOM_LOCATION_REFUSAL_REASONS = [
  "zero_results",
  "ambiguous",
  "imprecise",
  "cap_reached",
  "provider_error",
] as const;

export type CustomLocationRefusalReason = (typeof CUSTOM_LOCATION_REFUSAL_REASONS)[number];

/** The only location_type values precise enough on their own. Checked with includes. */
export const PRECISE_GEOCODE_LOCATION_TYPES = ["ROOFTOP", "GEOMETRIC_CENTER"] as const;

/**
 * An APPROXIMATE hit is placeable only when its types include one of these and
 * partial_match is false. RANGE_INTERPOLATED is not in this list and is not precise.
 */
export const APPROXIMATE_AREA_TYPES = ["neighborhood", "sublocality", "locality"] as const;

export const CUSTOM_PIN_PLACEMENT_SOURCE = "google_geocode" as const;

/** How long a signed placement may be echoed. */
export const CUSTOM_PIN_PLACEMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isPreciseGeocodeLocationType(locationType: string | null | undefined): boolean {
  return (
    locationType != null &&
    (PRECISE_GEOCODE_LOCATION_TYPES as readonly string[]).includes(locationType)
  );
}

/** True when this one Google hit may be placed. RANGE_INTERPOLATED is refused. */
export function isPlaceableGeocodeHit(hit: {
  locationType: string | null;
  types: readonly string[];
  partialMatch: boolean;
}): boolean {
  if (isPreciseGeocodeLocationType(hit.locationType)) return true;
  if (hit.locationType !== "APPROXIMATE" || hit.partialMatch) return false;
  return hit.types.some((type) => (APPROXIMATE_AREA_TYPES as readonly string[]).includes(type));
}

export interface CustomPinPlacement {
  lat: number;
  lng: number;
  source: typeof CUSTOM_PIN_PLACEMENT_SOURCE;
  /** ISO-8601 UTC (`Date.toISOString()`). */
  at: string;
  /** Hex HMAC-SHA256. Opaque to the client. */
  sig: string;
}

export function isCustomLocationRefusalReason(value: unknown): value is CustomLocationRefusalReason {
  return (
    typeof value === "string" &&
    (CUSTOM_LOCATION_REFUSAL_REASONS as readonly string[]).includes(value)
  );
}

export interface CustomLocationRefusalBody {
  error: typeof CUSTOM_LOCATION_UNPLACEABLE;
  reason: CustomLocationRefusalReason;
}

export function customLocationRefusalBody(reason: CustomLocationRefusalReason): CustomLocationRefusalBody {
  return { error: CUSTOM_LOCATION_UNPLACEABLE, reason };
}

export function isCustomLocationRefusal(
  status: number,
  body: unknown,
): body is CustomLocationRefusalBody {
  if (status !== CUSTOM_LOCATION_UNPLACEABLE_STATUS) return false;
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return record.error === CUSTOM_LOCATION_UNPLACEABLE && isCustomLocationRefusalReason(record.reason);
}

export interface ResolvedCustomPin {
  type: "hotel" | "neighborhood" | "activity" | "event" | "day";
  name: string;
  lat: number;
  lng: number;
  formattedAddress: string | null;
}

const PIN_TYPES = new Set(["hotel", "neighborhood", "activity", "event", "day"]);

export function readResolvedPinnedAnchor(raw: unknown): ResolvedCustomPin | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.type !== "string" || !PIN_TYPES.has(record.type)) return null;
  if (typeof record.name !== "string" || record.name.trim() === "") return null;
  const lat = typeof record.lat === "number" ? record.lat : Number(record.lat);
  const lng = typeof record.lng === "number" ? record.lng : Number(record.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const formattedAddress = typeof record.formattedAddress === "string" && record.formattedAddress.trim() !== ""
    ? record.formattedAddress
    : null;
  return {
    type: record.type as ResolvedCustomPin["type"],
    name: record.name,
    lat,
    lng,
    formattedAddress,
  };
}

/** Structural read of an echoed placement. Does not check the signature. */
export function readCustomPinPlacement(raw: unknown): CustomPinPlacement | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.source !== CUSTOM_PIN_PLACEMENT_SOURCE) return null;
  if (typeof record.at !== "string" || record.at.trim() === "") return null;
  if (typeof record.sig !== "string" || record.sig.trim() === "") return null;
  if (typeof record.lat !== "number" || typeof record.lng !== "number") return null;
  if (!Number.isFinite(record.lat) || !Number.isFinite(record.lng)) return null;
  if (record.lat < -90 || record.lat > 90 || record.lng < -180 || record.lng > 180) return null;
  return {
    lat: record.lat,
    lng: record.lng,
    source: CUSTOM_PIN_PLACEMENT_SOURCE,
    at: record.at,
    sig: record.sig,
  };
}
