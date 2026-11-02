/**
 * Place a custom "build around a location" pin before any Optimize charge
 * (ledger 2026-10-25-custom-location-geocode).
 *
 * A custom pin is a hotel|neighborhood|activity choice with a name and no catalog id,
 * or an id that starts with `custom:`. A non-custom id is a catalog key: the gate
 * looks it up and returns 400 `pinned_anchor_not_found` when it does not resolve
 * to a located row or stop. Client lat/lng is not a fallback. That 400 is not the
 * 409 placement refusal.
 *
 * A pin that names only the anchor type — no free-text place and no catalog id —
 * returns 400 `pinned_anchor_invalid` here, before geocode and before the caller
 * reaches the pay gate. It is not treated as "no pin" (that would auto-anchor a
 * place the traveler never picked). Omitting the pin entirely is still "no pin".
 *
 * Coordinates are trusted only when `pinnedAnchor.placement` verifies (HMAC, not in the
 * future, at most 24h old). The signature covers the anchor name, so it cannot be reused
 * for another place. A bare lat/lng, a missing signature, a tampered field, or a stale
 * timestamp is re-geocoded. There is no in-process handoff: another instance verifies the
 * same signature from SESSION_SECRET.
 *
 * A successful place writes lat/lng onto the same request object the later
 * `resolveOptimizerPinnedAnchor(rawPinnedAnchor, baselineItems)` call already reads.
 * `parsePinnedAnchorInput` still returns only { type, id, name, lat, lng }.
 */

import {
  CUSTOM_LOCATION_UNPLACEABLE_STATUS,
  PINNED_ANCHOR_INVALID,
  PINNED_ANCHOR_INVALID_STATUS,
  PINNED_ANCHOR_NOT_FOUND,
  PINNED_ANCHOR_NOT_FOUND_STATUS,
  customLocationRefusalBody,
  type CustomLocationRefusalBody,
  type CustomLocationRefusalReason,
  type CustomPinPlacement,
  type PinnedAnchorInvalidBody,
  type PinnedAnchorNotFoundBody,
  type PinnedAnchorNotFoundDetail,
  type ResolvedCustomPin,
} from "@shared/custom-location-pin";
import {
  nonCustomCatalogId,
  parsePinnedAnchorInput,
  type NamedStop,
  type PinnedAnchorInput,
} from "./anchor-candidates-map";
import { signCustomPinPlacement, verifyCustomPinPlacement } from "./custom-pin-placement";
import {
  loadPlanAnchorContext,
  resolveDayAnchor,
  resolveEventAnchor,
  tripDayCount,
  type PlanAnchorContext,
} from "./plan-anchors.service";
import { geocodeAddressDetailed, type GeocodeDetailed } from "../utils/geocode";

export interface PlaceCustomPinInput {
  rawPin: unknown;
  userId: string;
  tripId?: string | null;
  now?: () => number;
  geocode?: (address: string) => Promise<GeocodeDetailed>;
  /** Test seam. Production reads SESSION_SECRET. */
  secret?: string;
  /**
   * The same stops `resolveOptimizerPinnedAnchor` will score. Activity ids are
   * matched against this list. Hotel and neighborhood ids use the catalog.
   */
  activityStops?: NamedStop[];
  /** Test seam. Production calls `locateCatalogPinnedAnchor`. */
  catalogPinExists?: (pin: PinnedAnchorInput, stops: NamedStop[]) => Promise<boolean>;
  /** Test seam (OPT-A). Production reads the trip's dates and items from the database. */
  planAnchorContext?: (tripId: string) => Promise<PlanAnchorContext | null>;
}

export type PlaceCustomPinResult =
  | { ok: true; resolved: ResolvedCustomPin | null; placement: CustomPinPlacement | null }
  | { ok: false; status: typeof CUSTOM_LOCATION_UNPLACEABLE_STATUS; body: CustomLocationRefusalBody }
  | { ok: false; status: typeof PINNED_ANCHOR_NOT_FOUND_STATUS; body: PinnedAnchorNotFoundBody }
  | { ok: false; status: typeof PINNED_ANCHOR_INVALID_STATUS; body: PinnedAnchorInvalidBody };

function refusal(reason: CustomLocationRefusalReason): PlaceCustomPinResult {
  return { ok: false, status: CUSTOM_LOCATION_UNPLACEABLE_STATUS, body: customLocationRefusalBody(reason) };
}

function notFound(detail?: PinnedAnchorNotFoundDetail): PlaceCustomPinResult {
  return {
    ok: false,
    status: PINNED_ANCHOR_NOT_FOUND_STATUS,
    body: detail ? { error: PINNED_ANCHOR_NOT_FOUND, detail } : { error: PINNED_ANCHOR_NOT_FOUND },
  };
}

function invalid(): PlaceCustomPinResult {
  return { ok: false, status: PINNED_ANCHOR_INVALID_STATUS, body: { error: PINNED_ANCHOR_INVALID } };
}

async function defaultCatalogPinExists(pin: PinnedAnchorInput, stops: NamedStop[]): Promise<boolean> {
  const { locateCatalogPinnedAnchor } = await import("./anchor-candidates");
  return (await locateCatalogPinnedAnchor(pin, stops)) != null;
}

function writeCoords(raw: unknown, lat: number, lng: number): void {
  if (!raw || typeof raw !== "object") return;
  const record = raw as { lat?: number; lng?: number };
  record.lat = lat;
  record.lng = lng;
}

function clearCoords(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const record = raw as { lat?: number; lng?: number };
  delete record.lat;
  delete record.lng;
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

function rawPlacement(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  return (raw as { placement?: unknown }).placement;
}

async function placeCustomPin(input: PlaceCustomPinInput): Promise<PlaceCustomPinResult> {
  const parsed = parsePinnedAnchorInput(input.rawPin);
  if (!parsed) return { ok: true, resolved: null, placement: null };
  // A non-custom id never reaches geocode. The wrapper already 400s a miss;
  // this backstop refuses rather than trusting lat/lng if that check is skipped.
  if (nonCustomCatalogId(parsed)) {
    clearCoords(input.rawPin);
    return notFound();
  }
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  // Type only: an anchor kind with no place and no catalog id. Returning ok/null
  // here is what let the optimizer auto-anchor a place the traveler never picked.
  if (!name) {
    clearCoords(input.rawPin);
    return invalid();
  }

  const now = input.now ?? Date.now;
  const verified = verifyCustomPinPlacement({
    name,
    placement: rawPlacement(input.rawPin),
    now: now(),
    secret: input.secret,
  });
  if (verified) {
    writeCoords(input.rawPin, verified.lat, verified.lng);
    return {
      ok: true,
      resolved: resolvedFrom(parsed.type, name, verified.lat, verified.lng, null),
      placement: verified,
    };
  }

  clearCoords(input.rawPin);
  const geocode = input.geocode ?? geocodeAddressDetailed;
  let detailed: GeocodeDetailed;
  try {
    detailed = await geocode(name);
  } catch {
    return refusal("provider_error");
  }
  if (!detailed.ok) return refusal(detailed.reason);
  const formatted = detailed.chosen.formattedAddress.trim() ? detailed.chosen.formattedAddress : null;
  const atMs = now();
  const placement = signCustomPinPlacement({
    name,
    lat: detailed.chosen.lat,
    lng: detailed.chosen.lng,
    now: atMs,
    secret: input.secret,
  });
  writeCoords(input.rawPin, placement.lat, placement.lng);
  return {
    ok: true,
    resolved: resolvedFrom(parsed.type, name, placement.lat, placement.lng, formatted),
    placement,
  };
}

function writeName(raw: unknown, name: string): void {
  if (!raw || typeof raw !== "object") return;
  (raw as { name?: string }).name = name;
}

/**
 * OPT-A: an event or day pin resolves ONLY from the plan's own items — never a geocode, the catalog
 * or a signed placement. The server writes the point (event: the item's; day: the centroid of that
 * day's located stops) and the name onto the request so the later resolver reads them.
 */
async function placePlanAnchorPin(input: PlaceCustomPinInput, parsed: PinnedAnchorInput): Promise<PlaceCustomPinResult> {
  clearCoords(input.rawPin);
  const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
  if (!id) return invalid();
  if (!input.tripId) return notFound();
  const context = await (input.planAnchorContext ?? loadPlanAnchorContext)(input.tripId);
  if (!context) return notFound();
  const result =
    parsed.type === "event"
      ? resolveEventAnchor(context.items, id)
      : resolveDayAnchor(context.items, id, tripDayCount(context.startDate, context.endDate));
  if (!result.ok) return notFound(result.detail);
  writeCoords(input.rawPin, result.lat, result.lng);
  writeName(input.rawPin, result.name);
  return { ok: true, resolved: null, placement: null };
}

export async function placeCustomPinBeforeCharge(input: PlaceCustomPinInput): Promise<PlaceCustomPinResult> {
  const parsed = parsePinnedAnchorInput(input.rawPin);
  if (parsed && (parsed.type === "event" || parsed.type === "day")) {
    return placePlanAnchorPin(input, parsed);
  }
  if (parsed && nonCustomCatalogId(parsed)) {
    const stops = input.activityStops ?? [];
    const found = input.catalogPinExists
      ? await input.catalogPinExists(parsed, stops)
      : await defaultCatalogPinExists(parsed, stops);
    clearCoords(input.rawPin);
    if (!found) return notFound();
    return { ok: true, resolved: null, placement: null };
  }
  try {
    return await placeCustomPin(input);
  } catch {
    return refusal("provider_error");
  }
}
