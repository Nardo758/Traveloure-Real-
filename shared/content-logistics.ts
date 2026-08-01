// Content logistics envelope (QA_PUNCH_LIST item 20 — decision-maker directive Aug 1, 2026: tag
// every piece of content with location, time available/start, duration, transport-provided incl.
// pickup + dropoff).
//
// ONE vocabulary every Add-panel source maps its own native fields into AT READ TIME — no
// per-surface re-derivation. Consumers: the Workstation canvas map (item 16), the transport-gap
// checker (item 21), and the Trip Card's §18 mode-aware CTA. Additive-nullable homes were added
// where a source had none (migration 166: provider_services.drop_off_point; itinerary_items gains
// transport_provided/pickup_point/drop_off_point — durationMinutes already existed there).
//
// §13 GOVERNING RULE for every mapper in this file: a field the source never actually captured
// MUST come back null, never guessed, never defaulted to a value that implies knowledge the
// source doesn't have. "Unknown" and "known-false" are different states and must stay distinguishable
// (this is why transport.provided is a 3-value 'yes'|'no'|'not_applicable', mirroring
// provider_services.transportProvided, rather than a boolean that would collapse "never asked" into
// "no").

export interface EnvelopeCoords {
  lat: number;
  lng: number;
}

/** Mirrors provider_services.transportProvided's app-layer vocabulary (migration 119's CHECK on
 *  that column; no equivalent DB CHECK on itinerary_items — see migration 166 header). `null` means
 *  the source never captured this fact at all, distinct from the explicit `"not_applicable"` value
 *  a source CAN assert (e.g. a self-guided/remote item where transport genuinely doesn't apply). */
export type TransportProvided = "yes" | "no" | "not_applicable" | null;

/** A single real availability window a source is willing to vouch for (e.g. one
 *  vendor_availability_slots row, or one entry of provider_services.availability jsonb). Never a
 *  fabricated "probably open" guess — see NEVER FABRICATE below. */
export interface EnvelopeAvailabilityWindow {
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface ContentLogisticsEnvelope {
  coords: EnvelopeCoords | null;
  availabilityWindows: EnvelopeAvailabilityWindow[] | null;
  durationMinutes: number | null;
  transport: {
    provided: TransportProvided;
    pickupPoint: string | null;
    dropOffPoint: string | null;
  };
}

export const EMPTY_CONTENT_LOGISTICS_ENVELOPE: ContentLogisticsEnvelope = {
  coords: null,
  availabilityWindows: null,
  durationMinutes: null,
  transport: { provided: null, pickupPoint: null, dropOffPoint: null },
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────────────────────

function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function coordsFrom(lat: unknown, lng: unknown): EnvelopeCoords | null {
  const latN = toFiniteNumber(lat);
  const lngN = toFiniteNumber(lng);
  if (latN === null || lngN === null) return null;
  if (Math.abs(latN) > 90 || Math.abs(lngN) > 180) return null;
  if (latN === 0 && lngN === 0) return null; // "Null Island" sentinel — never a real location.
  return { lat: latN, lng: lngN };
}

function nullIfBlank(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Best-effort free-text duration parse ("2 hours", "45 min", "1.5 hrs", "3 days", "Half day").
 *  Mirrors the established "best-effort, honest null on miss" posture already used for the
 *  Custom-item geocode (#361) — this is an HONEST interpretation of text a human already wrote,
 *  not a fabrication, but a string this doesn't confidently recognize returns null rather than
 *  guessing. Never used for anything beyond a courtesy display / gap-checker fallback signal. */
export function parseDurationTextToMinutes(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;

  if (/half[\s-]?day/.test(t)) return 4 * 60;
  if (/full[\s-]?day/.test(t)) return 8 * 60;

  const dayMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:day|days)\b/);
  if (dayMatch) return Math.round(parseFloat(dayMatch[1]) * 24 * 60);

  const hourMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:hour|hours|hr|hrs|h)\b/);
  const minMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:minute|minutes|min|mins|m)\b/);
  if (hourMatch || minMatch) {
    const hours = hourMatch ? parseFloat(hourMatch[1]) : 0;
    const mins = minMatch ? parseFloat(minMatch[1]) : 0;
    const total = Math.round(hours * 60 + mins);
    return total > 0 ? total : null;
  }

  return null; // unrecognized shape — honest null, never a guess.
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// provider_services mapper
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Narrow input shape — every field a provider_services row (or its GET /api/services JSON
 *  projection) can supply the envelope from. Deliberately NOT the full ProviderService type so
 *  this module has no drizzle/schema dependency and stays importable from the client. */
export interface ProviderServiceLogisticsSource {
  latitude?: string | number | null;
  longitude?: string | number | null;
  meetingPoint?: string | null;
  pickupAvailable?: boolean | null;
  pickupAddress?: string | null;
  dropOffPoint?: string | null;
  transportProvided?: string | null; // yes | no | not_applicable
  deliveryTimeframe?: string | null; // the ServiceForm "Duration" field's real DB home
  availability?: unknown; // jsonb — shape not contractually fixed; read defensively
}

function windowsFromProviderAvailability(raw: unknown): EnvelopeAvailabilityWindow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const windows: EnvelopeAvailabilityWindow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const date = typeof e.date === "string" ? e.date : null;
    const startTime = typeof e.startTime === "string" ? e.startTime : typeof e.start === "string" ? e.start : null;
    const endTime = typeof e.endTime === "string" ? e.endTime : typeof e.end === "string" ? e.end : null;
    if (date || startTime || endTime) windows.push({ date, startTime, endTime });
  }
  return windows.length > 0 ? windows : null;
}

export function envelopeFromProviderService(s: ProviderServiceLogisticsSource): ContentLogisticsEnvelope {
  const provided = s.transportProvided === "yes" || s.transportProvided === "no" || s.transportProvided === "not_applicable"
    ? s.transportProvided
    : null;
  return {
    coords: coordsFrom(s.latitude, s.longitude),
    availabilityWindows: windowsFromProviderAvailability(s.availability),
    durationMinutes: parseDurationTextToMinutes(s.deliveryTimeframe),
    transport: {
      provided,
      // meetingPoint / pickupAddress both describe "where the client meets/gets picked up" —
      // pickupAddress is the more specific of the two when both are set (mirrors the pickers'
      // existing `meetingPoint || location` display precedent of "most specific first").
      pickupPoint: nullIfBlank(s.pickupAddress) ?? nullIfBlank(s.meetingPoint),
      dropOffPoint: nullIfBlank(s.dropOffPoint),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// itinerary_items mapper
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ItineraryItemLogisticsSource {
  latitude?: string | number | null;
  longitude?: string | number | null;
  startTime?: string | null;
  dayNumber?: number | null;
  durationMinutes?: number | null;
  transportProvided?: string | null;
  pickupPoint?: string | null;
  dropOffPoint?: string | null;
}

export function envelopeFromItineraryItem(item: ItineraryItemLogisticsSource): ContentLogisticsEnvelope {
  const provided = item.transportProvided === "yes" || item.transportProvided === "no" || item.transportProvided === "not_applicable"
    ? item.transportProvided
    : null;
  return {
    coords: coordsFrom(item.latitude, item.longitude),
    // An itinerary item's own "availability" IS its scheduled slot — it has already been placed
    // on a day/time, so the envelope reports that placement rather than a source's open windows.
    availabilityWindows: item.startTime ? [{ date: null, startTime: item.startTime, endTime: null }] : null,
    durationMinutes: typeof item.durationMinutes === "number" ? item.durationMinutes : null,
    transport: {
      provided,
      pickupPoint: nullIfBlank(item.pickupPoint ?? null),
      dropOffPoint: nullIfBlank(item.dropOffPoint ?? null),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Partner-feed display item mapper (Travelpayouts-style catalog feeds — §16: never carries an
// affiliate URL, and neither does this mapper's input type)
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface PartnerFeedLogisticsSource {
  location?: { lat: number; lng: number } | null;
  duration?: string | null; // BaseItem.duration (experience-catalog.service.ts) — free text
}

/** Partner-feed items carry NO transport fields structurally (ground truth, QA_PUNCH_LIST item
 *  20) — a network's card tells you name/image/price/description, never who drives you there.
 *  transport is always the honest all-null state; never inferred from category/network. */
export function envelopeFromPartnerFeedItem(item: PartnerFeedLogisticsSource): ContentLogisticsEnvelope {
  return {
    coords: item.location ? coordsFrom(item.location.lat, item.location.lng) : null,
    availabilityWindows: null, // a cached feed's "in stock" claim is a tier-(a)/(b) concern, not this envelope's.
    durationMinutes: parseDurationTextToMinutes(item.duration),
    transport: { provided: null, pickupPoint: null, dropOffPoint: null },
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DMO / custom / registry content mapper — mostly nulls, NEVER FABRICATED (§13)
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface GenericContentLogisticsSource {
  latitude?: string | number | null;
  longitude?: string | number | null;
}

/** DMO research stubs, custom (free-text) items, and generic content_registry rows carry no
 *  duration/transport facts at all — only whatever coordinate they were geocoded or seeded with
 *  (best-effort geocode on Custom add, #361; a DMO stub's real lat/lng when it has one). Every
 *  other envelope field is honestly null rather than guessed. */
export function envelopeFromGenericContent(item: GenericContentLogisticsSource): ContentLogisticsEnvelope {
  return {
    coords: coordsFrom(item.latitude, item.longitude),
    availabilityWindows: null,
    durationMinutes: null,
    transport: { provided: null, pickupPoint: null, dropOffPoint: null },
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Write-side carry helper — the subset of itinerary_items columns an Add-panel source populates
// at item-create time from a source envelope, so the plan retains what the source knew (item 20's
// "write-side carry"). Never overwrites with a guess: an envelope field that's null is simply
// omitted from the payload (the item column stays at its own default/NULL), never coerced to a
// sentinel value.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ItineraryItemLogisticsFields {
  durationMinutes?: number;
  transportProvided?: "yes" | "no" | "not_applicable";
  pickupPoint?: string;
  dropOffPoint?: string;
}

export function envelopeToItineraryItemFields(envelope: ContentLogisticsEnvelope): ItineraryItemLogisticsFields {
  const fields: ItineraryItemLogisticsFields = {};
  if (envelope.durationMinutes !== null) fields.durationMinutes = envelope.durationMinutes;
  if (envelope.transport.provided !== null) fields.transportProvided = envelope.transport.provided;
  if (envelope.transport.pickupPoint !== null) fields.pickupPoint = envelope.transport.pickupPoint;
  if (envelope.transport.dropOffPoint !== null) fields.dropOffPoint = envelope.transport.dropOffPoint;
  return fields;
}
