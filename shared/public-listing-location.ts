/**
 * CP-1 — what a PUBLIC listing read may say about WHERE a service happens (architect ruling,
 * Oct 15, 2026; ledger `2026-10-15-cp1-public-payloads`).
 *
 * Public reads carry a COARSE location only: the neighbourhood name and a point rounded to about
 * 500 m — enough for browse and the map planner. The exact meeting pin, the pickup address and the
 * route stops are for the OWNER and for a traveler who has BOOKED the listing. Start-time windows
 * and weekly patterns stay public: they are how a traveler books.
 *
 * Pure: no db, no request. The server projector (`server/utils/public-service-listing.ts`) and the
 * signed-out test read these, so the field list and the rounding exist once (§18 rule 1).
 */

/** Grid step in degrees of latitude: 0.0045° ≈ 500 m. */
export const COARSE_LAT_STEP_DEG = 0.0045;

/**
 * Free-text location fields that name a place more precisely than a neighbourhood. Never on a
 * public read; the owner and a booked traveler see them.
 */
export const LISTING_EXACT_LOCATION_FIELDS = [
  "meetingPoint",
  "pickupAddress",
  "dropOffPoint",
  "accessNotes",
  "whatToBring",
] as const;

/**
 * Snap a point to a ~500 m grid. Longitude's step widens with latitude so a cell stays about
 * 500 m wide away from the equator. A missing or unreadable coordinate stays NULL — never a guessed
 * point (§13). Deterministic: the same pin always lands in the same cell.
 */
export function coarsenPoint(
  latitude: unknown,
  longitude: unknown,
): { latitude: string | null; longitude: string | null } {
  const lat = latitude == null || latitude === "" ? NaN : Number(latitude);
  const lng = longitude == null || longitude === "" ? NaN : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { latitude: null, longitude: null };
  }
  const snap = (v: number, step: number) => Math.round(v / step) * step;
  const snappedLat = snap(lat, COARSE_LAT_STEP_DEG);
  // The longitude step is taken at the SNAPPED latitude, so every pin in a cell shares one step.
  const cos = Math.max(Math.cos((snappedLat * Math.PI) / 180), 0.01);
  const lngStep = COARSE_LAT_STEP_DEG / cos;
  return {
    latitude: snappedLat.toFixed(4),
    longitude: snap(lng, lngStep).toFixed(4),
  };
}

/**
 * Booking statuses that let a traveler see the exact location of the listing they bought: every
 * status after payment. Not `payment_pending`, `pending`, `failed`, `cancelled` or `refunded`.
 */
export const EXACT_LOCATION_BOOKING_STATUSES: readonly string[] = [
  "confirmed",
  "deposit_paid",
  "completion_declared",
  "awaiting_acceptance",
  "revision_requested",
  "partially_completed",
  "completed",
];
