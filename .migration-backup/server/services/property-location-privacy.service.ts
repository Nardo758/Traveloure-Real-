/**
 * property-location-privacy.service.ts — S8 (Gate G2, docs/briefs/WAVE3_SCHEMA_PROPOSALS.md,
 * ledger row 102) privacy-circle jitter for a property's confirmed pin.
 *
 * RATIFIED POSTURE (docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md, Gate G2, DM Aug 12 2026): "the
 * property is placed by the same confirm-gated PIN-DROP as every other location write — the pin is
 * authoritative … and travelers see an approximate neighborhood circle pre-booking with the exact
 * pin revealed after booking (labeled privacy treatment, never a fake location)."
 *
 * ZERO SCHEMA CHANGE. This reuses the EXACT jitter technique
 * `server/services/ready-made-teaser-map.service.ts` already ships for a different surface: a
 * deterministic PRNG (mulberry32, seeded by FNV-1a hash) displaces a REAL confirmed point by a
 * bounded, reproducible offset. "Never fabrication, only bounded displacement of a real point"
 * (§13) — the same doc comment, restated here because this is a second, independent caller of the
 * technique, not a shared import (the teaser-map module is scoped to the Ready Made teaser SVG and
 * seeds per-ITEM; this one seeds per-LISTING and uses a wider radius for a privacy circle rather
 * than a rendered dot).
 *
 * RADIUS: ~500m (vs. the teaser map's ~250m) — wide enough that the circle does not pinpoint a
 * single building on a dense city block, matching the "approximate neighborhood circle" wording.
 *
 * SCOPE: called ONLY for `productShape === 'property' | 'property_room'` rows. Every other product
 * shape (in_person tours, meeting-point services, etc.) keeps its exact stored pin on every public
 * read — this module is never invoked for them, so `routePoints`/`serviceRadius` rendering (ruling
 * 22) is untouched.
 */

const JITTER_RADIUS_METERS = 500;

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface JitteredPoint {
  latitude: string;
  longitude: string;
  locationApproximate: true;
}

/**
 * Jitters a real [lat, lon] up to ~500m in a random (but deterministic-per-listing) direction.
 * The SAME listing id produces the SAME approximate circle on every read (stable across page
 * loads — a reshuffling map reads as broken, not as privacy-preserving, the teaser-map module's
 * own rationale). Seeded on the listing id ALONE (unlike the teaser map's per-item seed) because
 * a property has exactly one pin to jitter, not a set of stops.
 *
 * Returns 7-decimal-place strings to match the `decimal(precision:10, scale:7)` column shape the
 * raw (unjittered) value already carries on the wire.
 */
export function jitterPropertyPin(lat: number, lon: number, listingId: string): JitteredPoint {
  const rng = mulberry32(hashSeed(`property-privacy:${listingId}`));
  const angle = rng() * 2 * Math.PI;
  const magnitudeMeters = rng() * JITTER_RADIUS_METERS;
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const dLat = (magnitudeMeters * Math.sin(angle)) / metersPerDegLat;
  const dLon = metersPerDegLon > 1e-6 ? (magnitudeMeters * Math.cos(angle)) / metersPerDegLon : 0;
  return {
    latitude: (lat + dLat).toFixed(7),
    longitude: (lon + dLon).toFixed(7),
    locationApproximate: true,
  };
}

/**
 * Applies the privacy jitter to a service row IN PLACE OF its exact coordinates, for
 * `productShape === 'property' | 'property_room'` rows only. Returns the row unchanged (no
 * `locationApproximate` flag) for every other shape, and unchanged when the row carries no
 * coordinates at all (§13 — never fabricate a pin that was never placed).
 *
 * `fallbackLat`/`fallbackLon` implement the room-standalone-read fallback (S8-Q3, absolute pin
 * inheritance): a `property_room` row never writes its own pin, so when its own latitude/longitude
 * are NULL the caller passes the PARENT property's raw coordinates here — jittered exactly as if
 * they were the room's own, at READ TIME ONLY. Nothing is written back to either row.
 */
export function applyPropertyLocationPrivacy<
  T extends { id: string; productShape?: string | null; latitude?: unknown; longitude?: unknown },
>(service: T, opts?: { fallbackLat?: unknown; fallbackLon?: unknown }): T & { locationApproximate?: true } {
  if (service.productShape !== "property" && service.productShape !== "property_room") {
    return service;
  }
  const rawLat = service.latitude != null ? service.latitude : opts?.fallbackLat;
  const rawLon = service.longitude != null ? service.longitude : opts?.fallbackLon;
  const lat = rawLat != null ? Number(rawLat) : NaN;
  const lon = rawLon != null ? Number(rawLon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    // Honest absence — no pin placed yet (on this row OR its parent). Never invent one.
    return { ...service, latitude: null, longitude: null } as T & { locationApproximate?: true };
  }
  const jittered = jitterPropertyPin(lat, lon, service.id);
  return { ...service, ...jittered };
}
