/**
 * Custom "build around a location" pin — the typed refusal the Optimize pay gate returns
 * when that pin cannot be placed, and the placed pin a successful payments response may carry.
 *
 * Typed codes only. Traveler copy belongs to the dialog lane.
 *
 * HTTP 409
 * { "error": "custom_location_unplaceable", "reason": <CustomLocationRefusalReason> }
 *
 * Success (payments JSON, present only when a custom pin was placed this call):
 * resolvedPinnedAnchor: { type, name, lat, lng, formattedAddress }
 * formattedAddress is the provider's formatted address when this call geocoded, otherwise null.
 */

export const CUSTOM_LOCATION_UNPLACEABLE = "custom_location_unplaceable" as const;

export const CUSTOM_LOCATION_UNPLACEABLE_STATUS = 409 as const;

export const CUSTOM_LOCATION_REFUSAL_REASONS = [
  "zero_results",
  "ambiguous",
  "imprecise",
  "cap_reached",
  "provider_error",
] as const;

export type CustomLocationRefusalReason = (typeof CUSTOM_LOCATION_REFUSAL_REASONS)[number];

/** The only location_type values precise enough to place a custom pin. Checked with includes. */
export const PRECISE_GEOCODE_LOCATION_TYPES = ["ROOFTOP", "GEOMETRIC_CENTER"] as const;

export function isPreciseGeocodeLocationType(locationType: string | null | undefined): boolean {
  return (
    locationType != null &&
    (PRECISE_GEOCODE_LOCATION_TYPES as readonly string[]).includes(locationType)
  );
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
  type: "hotel" | "neighborhood" | "activity";
  name: string;
  lat: number;
  lng: number;
  formattedAddress: string | null;
}

const PIN_TYPES = new Set(["hotel", "neighborhood", "activity"]);

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
