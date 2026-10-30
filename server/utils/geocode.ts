// Single source for server-side address → {lat,lng} geocoding (Google Geocoding
// API). Both GET /api/geocode (content.routes) and the PlanCard resolve-on-write
// coordinate backfill (plancard.routes) go through geocodeAddress, so those callers
// keep exactly one server geocode path — the client must not geocode independently.
//
// geocodeAddressDetailed is the custom-pin path (ledger 2026-10-25-custom-location-geocode).
// It classifies the raw Google payload into a typed refusal. geocodeAddress is unchanged
// for its other callers and does not apply that precision check.

import { mapsCallerDailyCap } from "../config/maps-billing.config";
import {
  isPlaceableGeocodeHit,
  type CustomLocationRefusalReason,
} from "@shared/custom-location-pin";

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  locationType?: string;
  types?: string[];
}

export interface GeocodeHit {
  lat: number;
  lng: number;
  formattedAddress: string;
  locationType: string | null;
  types: string[];
  /** Google `partial_match`. Absent on the payload is false. */
  partialMatch: boolean;
}

export type GeocodeDetailed =
  | { ok: true; results: GeocodeHit[]; chosen: GeocodeHit }
  | { ok: false; reason: CustomLocationRefusalReason; results: GeocodeHit[] };

interface GoogleGeocodePayload {
  status?: string;
  results?: Array<{
    formatted_address?: unknown;
    types?: unknown;
    partial_match?: unknown;
    geometry?: {
      location?: { lat?: unknown; lng?: unknown };
      location_type?: unknown;
    };
  }>;
}

type GateRefusal = "disabled" | "no_api_key" | "paused";

export interface GeocodeDetailedDeps {
  gate?: (
    call: (apiKey: string) => Promise<{ value: GoogleGeocodePayload }>,
  ) => Promise<{ value: GoogleGeocodePayload } | { refused: GateRefusal }>;
  /** Today's cap for the geocode caller. Default reads MAPS_GEOCODE_DAILY_CAP. */
  dailyCap?: () => number;
  /** Billable geocode calls since UTC midnight. null = the counter could not be read. */
  countToday?: () => Promise<number | null>;
  /** Invoked only when a refused call is the daily cap. Must not change the refusal. */
  onCapReached?: (info: { used: number | null; cap: number }) => Promise<void>;
  /** Row 220: invoked only when a made call failed (never on a gate refusal). Must not change the result. */
  onProviderError?: () => Promise<void>;
  fetchImpl?: typeof fetch;
}

//
// R299 (Maps billing audit): Geocoding has one tier (Essentials). The call runs behind the Maps
// billing gate (`geocode` in `@shared/maps-billing`) — its own switch, a daily cap and a recorded
// cost; refused ⇒ null, the same "no location" every caller already handles.
// The billing module opens a database pool, so it is imported only when a call actually runs.

async function gatedGeocode<T>(
  call: (apiKey: string) => Promise<{ value: T; units?: number; success?: boolean }>,
): Promise<{ value: T } | { refused: GateRefusal }> {
  const { gatedMapsCall } = await import("../services/maps-billing/maps-billing.service");
  return gatedMapsCall("geocode", call);
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address || !address.trim()) return null;
  const out = await gatedGeocode(async (apiKey) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const resp = await fetch(url);
    const data: any = await resp.json();
    if (data.status === "ZERO_RESULTS") return { value: null };
    if (!resp.ok || data.status !== "OK") {
      throw new Error(`Google geocoding failed: ${data.status || resp.status}`);
    }
    const loc = data.results?.[0]?.geometry?.location;
    if (!loc) return { value: null };
    return {
      value: {
        lat: loc.lat,
        lng: loc.lng,
        formattedAddress: data.results[0].formatted_address,
        locationType: data.results[0].geometry?.location_type,
        types: Array.isArray(data.results[0].types) ? data.results[0].types : [],
      } as GeocodeResult,
    };
  });
  return "refused" in out ? null : out.value;
}

function hitsFromPayload(payload: GoogleGeocodePayload): GeocodeHit[] {
  const rows = Array.isArray(payload.results) ? payload.results : [];
  const hits: GeocodeHit[] = [];
  for (const row of rows) {
    const lat = row?.geometry?.location?.lat;
    const lng = row?.geometry?.location?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const locationType = typeof row.geometry?.location_type === "string" ? row.geometry.location_type : null;
    const formattedAddress = typeof row.formatted_address === "string" ? row.formatted_address : "";
    const types = Array.isArray(row.types) ? row.types.filter((t): t is string => typeof t === "string") : [];
    const partialMatch = row.partial_match === true;
    hits.push({ lat, lng, formattedAddress, locationType, types, partialMatch });
  }
  return hits;
}

async function readGooglePayload(fetchImpl: typeof fetch, address: string, apiKey: string): Promise<GoogleGeocodePayload> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const resp = await fetchImpl(url);
  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    throw new Error("geocode response was not json");
  }
  if (!resp.ok || !data || typeof data !== "object") {
    throw new Error(`geocode http ${resp.status}`);
  }
  const status = typeof (data as { status?: unknown }).status === "string" ? (data as { status: string }).status : "";
  if (status !== "OK" && status !== "ZERO_RESULTS") {
    throw new Error(`geocode status ${status || "unknown"}`);
  }
  return data as GoogleGeocodePayload;
}

/**
 * A paused gate is the cap when the cap is closed (cap <= 0) or today's count is at it.
 * An unreadable counter, or a re-read that is under the cap, is a provider failure —
 * the same shape as a disabled caller — and does not raise the cap alert.
 */
async function classifyPaused(
  deps: GeocodeDetailedDeps,
): Promise<{ reason: "cap_reached" | "provider_error"; used: number | null; cap: number }> {
  const cap = deps.dailyCap ? deps.dailyCap() : mapsCallerDailyCap("geocode");
  let used: number | null = null;
  try {
    if (deps.countToday) used = await deps.countToday();
    else {
      const { defaultMapsGateDeps } = await import("../services/maps-billing/maps-billing.service");
      used = await defaultMapsGateDeps.countToday("geocode");
    }
  } catch {
    used = null;
  }
  if (cap <= 0 || (used !== null && used >= cap)) {
    return { reason: "cap_reached", used, cap };
  }
  return { reason: "provider_error", used, cap };
}

async function notifyCap(deps: GeocodeDetailedDeps, info: { used: number | null; cap: number }): Promise<void> {
  try {
    if (deps.onCapReached) {
      await deps.onCapReached(info);
      return;
    }
    const { recordGeocodeCapAlert } = await import("../services/geocode-cap-alert.service");
    await recordGeocodeCapAlert(info);
  } catch {
    // The refusal stands whether or not the alert was recorded.
  }
}

/** Row 220: a made call failed — one staff alert per UTC day. The result stands whether or not it was recorded. */
async function notifyProviderError(deps: GeocodeDetailedDeps): Promise<void> {
  try {
    if (deps.onProviderError) {
      await deps.onProviderError();
      return;
    }
    const { recordGeocodeProviderErrorAlert } = await import("../services/geocode-cap-alert.service");
    await recordGeocodeProviderErrorAlert();
  } catch {
    // never throws
  }
}

/**
 * Every finite Google result, plus one typed reason. A single placeable hit is the only success.
 * More than one hit is ambiguous even when one of them is placeable. Placeability lives in
 * `isPlaceableGeocodeHit` — this function does not restate the location types.
 */
export async function geocodeAddressDetailed(
  address: string,
  deps: GeocodeDetailedDeps = {},
): Promise<GeocodeDetailed> {
  if (!address || !address.trim()) {
    return { ok: false, reason: "zero_results", results: [] };
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const gate = deps.gate ?? gatedGeocode;
  let out: { value: GoogleGeocodePayload } | { refused: GateRefusal };
  try {
    out = await gate(async (apiKey) => ({ value: await readGooglePayload(fetchImpl, address.trim(), apiKey) }));
  } catch {
    // The call was made and failed (the gate recorded success = false). A refusal below makes no call.
    await notifyProviderError(deps);
    return { ok: false, reason: "provider_error", results: [] };
  }
  if ("refused" in out) {
    if (out.refused === "paused") {
      const classified = await classifyPaused(deps);
      if (classified.reason === "cap_reached") {
        await notifyCap(deps, { used: classified.used, cap: classified.cap });
      }
      return { ok: false, reason: classified.reason, results: [] };
    }
    return { ok: false, reason: "provider_error", results: [] };
  }
  const hits = hitsFromPayload(out.value);
  if (out.value.status === "ZERO_RESULTS" || hits.length === 0) {
    return { ok: false, reason: "zero_results", results: hits };
  }
  if (hits.length > 1) {
    return { ok: false, reason: "ambiguous", results: hits };
  }
  const only = hits[0];
  if (!isPlaceableGeocodeHit(only)) {
    return { ok: false, reason: "imprecise", results: hits };
  }
  return { ok: true, results: hits, chosen: only };
}
