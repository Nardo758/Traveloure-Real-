/**
 * Place a custom "build around a location" pin before any Optimize charge
 * (ledger 2026-10-25-custom-location-geocode).
 *
 * A custom pin is a hotel|neighborhood|activity choice with a name and no catalog id
 * and no already-valid coordinate pair. Selected candidates (a non-empty id) are not
 * geocoded; the existing resolver keeps them. A valid lat/lng pair is the traveler's
 * placement and is not sent to Google again.
 *
 * The geocode result is written onto the same request object the later
 * `resolveOptimizerPinnedAnchor(rawPinnedAnchor, baselineItems)` call already reads,
 * and remembered in this process for a short time so the comparisons request — which
 * still arrives name-only until the dialog forwards coordinates — does not geocode
 * a second time. The memory is per process; another instance geocodes again.
 */

import {
  CUSTOM_LOCATION_UNPLACEABLE_STATUS,
  customLocationRefusalBody,
  type CustomLocationRefusalBody,
  type CustomLocationRefusalReason,
  type ResolvedCustomPin,
} from "@shared/custom-location-pin";
import { parsePinnedAnchorInput } from "./anchor-candidates-map";
import { geocodeAddressDetailed, type GeocodeDetailed } from "../utils/geocode";

export const CUSTOM_PIN_HANDOFF_TTL_MS = 30 * 60 * 1000;

interface HandoffEntry {
  type: ResolvedCustomPin["type"];
  name: string;
  lat: number;
  lng: number;
  formattedAddress: string | null;
  at: number;
}

const handoff = new Map<string, HandoffEntry>();

export function resetCustomPinHandoffForTests(): void {
  handoff.clear();
}

export interface PlaceCustomPinInput {
  rawPin: unknown;
  userId: string;
  tripId?: string | null;
  now?: () => number;
  geocode?: (address: string) => Promise<GeocodeDetailed>;
}

export type PlaceCustomPinResult =
  | { ok: true; resolved: ResolvedCustomPin | null }
  | { ok: false; status: typeof CUSTOM_LOCATION_UNPLACEABLE_STATUS; body: CustomLocationRefusalBody };

function refusal(reason: CustomLocationRefusalReason): PlaceCustomPinResult {
  return { ok: false, status: CUSTOM_LOCATION_UNPLACEABLE_STATUS, body: customLocationRefusalBody(reason) };
}

function placedPair(lat: number | null | undefined, lng: number | null | undefined): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function writeCoords(raw: unknown, lat: number, lng: number): void {
  if (!raw || typeof raw !== "object") return;
  const record = raw as { lat?: number; lng?: number };
  record.lat = lat;
  record.lng = lng;
}

function handoffKey(userId: string, tripId: string | null | undefined, type: string, name: string): string {
  return `${userId}\0${tripId ?? ""}\0${type}\0${name.trim().toLowerCase()}`;
}

function resolvedFrom(
  type: ResolvedCustomPin["type"],
  name: string,
  lat: number,
  lng: number,
  formattedAddress: string | null,
): ResolvedCustomPin {
  return { type, name, lat, lng, formattedAddress };
}

async function placeCustomPin(input: PlaceCustomPinInput): Promise<PlaceCustomPinResult> {
  const parsed = parsePinnedAnchorInput(input.rawPin);
  if (!parsed) return { ok: true, resolved: null };
  if (typeof parsed.id === "string" && parsed.id.trim() !== "") {
    return { ok: true, resolved: null };
  }
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const coords = placedPair(parsed.lat, parsed.lng);
  const now = input.now ?? Date.now;
  if (coords) {
    if (name) {
      handoff.set(handoffKey(input.userId, input.tripId, parsed.type, name), {
        type: parsed.type,
        name: parsed.name ?? name,
        lat: coords.lat,
        lng: coords.lng,
        formattedAddress: null,
        at: now(),
      });
    }
    return {
      ok: true,
      resolved: name
        ? resolvedFrom(parsed.type, parsed.name ?? name, coords.lat, coords.lng, null)
        : null,
    };
  }
  if (!name) return { ok: true, resolved: null };

  const key = handoffKey(input.userId, input.tripId, parsed.type, name);
  const cached = handoff.get(key);
  const at = now();
  if (cached && at - cached.at < CUSTOM_PIN_HANDOFF_TTL_MS && cached.type === parsed.type) {
    writeCoords(input.rawPin, cached.lat, cached.lng);
    return {
      ok: true,
      resolved: resolvedFrom(parsed.type, parsed.name ?? name, cached.lat, cached.lng, cached.formattedAddress),
    };
  }
  if (cached) handoff.delete(key);

  const geocode = input.geocode ?? geocodeAddressDetailed;
  let detailed: GeocodeDetailed;
  try {
    detailed = await geocode(name);
  } catch {
    return refusal("provider_error");
  }
  if (!detailed.ok) return refusal(detailed.reason);
  const formatted = detailed.chosen.formattedAddress.trim() ? detailed.chosen.formattedAddress : null;
  writeCoords(input.rawPin, detailed.chosen.lat, detailed.chosen.lng);
  handoff.set(key, {
    type: parsed.type,
    name: parsed.name ?? name,
    lat: detailed.chosen.lat,
    lng: detailed.chosen.lng,
    formattedAddress: formatted,
    at,
  });
  return {
    ok: true,
    resolved: resolvedFrom(parsed.type, parsed.name ?? name, detailed.chosen.lat, detailed.chosen.lng, formatted),
  };
}

export async function placeCustomPinBeforeCharge(input: PlaceCustomPinInput): Promise<PlaceCustomPinResult> {
  try {
    return await placeCustomPin(input);
  } catch {
    return refusal("provider_error");
  }
}
