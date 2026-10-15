import { coarsenPoint, LISTING_EXACT_LOCATION_FIELDS } from "@shared/public-listing-location";
import { haversineMeters } from "@shared/geo";

/**
 * public-service-listing.ts — what a PUBLIC service LIST row may carry (ledger
 * `2026-10-07-public-service-ids`; CLAUDE.md Locked Decision 40).
 *
 * `GET /api/services` served `storage.getAllActiveServices` rows as read, so every row carried the
 * owner's `users.id` in `userId`. An earner's public identity is their HANDLE; the listing is
 * addressed by its own id (detail, contact `{ serviceId }`, the service-addressed verification
 * badge). No consumer of this list reads the owner id, so it is removed here and nothing replaces it.
 *
 * `scripts/check-public-user-id.cjs` predicate (3) requires the route to call this projector, because
 * a payload built by passing raw rows through is invisible to its object-literal scan.
 */
export function toPublicServiceListing<T extends { userId?: unknown }>(row: T): Omit<T, "userId"> {
  const { userId: _owner, ...rest } = row;
  return rest;
}

// ─── CP-1: the public listing payload (ledger `2026-10-15-cp1-public-payloads`) ──────────────────


/** Never on any public listing read: the delivered file, the session link, a §18 rate, the owner id. */
export const PUBLIC_LISTING_NEVER_FIELDS = ["userId", "serviceFile", "joinLink", "revenueShareRate"] as const;

/**
 * ONE public projection of a `provider_services` row (CP-1). Always strips the never-fields. Unless
 * `exact` (the owner, or a traveler who booked it — the DETAIL read decides that), it also strips
 * the address-like free text and snaps the pin to ~500 m, flagging `locationApproximate`. A row
 * with no pin stays without one (§13). Lists are never exact.
 */
export function toPublicListing<T extends Record<string, any>>(row: T, opts: { exact?: boolean } = {}): Record<string, any> {
  const out: Record<string, any> = { ...row };
  for (const f of PUBLIC_LISTING_NEVER_FIELDS) delete out[f];
  if (opts.exact) return out;
  for (const f of LISTING_EXACT_LOCATION_FIELDS) delete out[f];
  if ("latitude" in out || "longitude" in out) {
    const coarse = coarsenPoint(out.latitude, out.longitude);
    out.latitude = coarse.latitude;
    out.longitude = coarse.longitude;
    if (coarse.latitude != null) out.locationApproximate = true;
  }
  return out;
}

/**
 * The public stand-in for a listing's route stops: how many there are and the area the first one is
 * in. `firstArea` is the nearest neighbourhood to the first LOCATED stop within `maxMeters`, else the
 * listing's own stated neighbourhood, else null — never a stop name and never a guess (§13).
 */
export function publicRouteSummary(
  points: ReadonlyArray<{ position: number; latitude: unknown; longitude: unknown }>,
  neighborhoods: ReadonlyArray<{ name: string; lat: number; lng: number }>,
  listingNeighborhood: string | null | undefined,
  maxMeters = 3000,
): { routeStopCount: number; routeFirstArea: string | null } {
  const ordered = [...points].sort((a, b) => a.position - b.position);
  let area: string | null = null;
  const first = ordered.find((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) && p.latitude != null && p.longitude != null);
  if (first) area = nearestAreaName(first.latitude, first.longitude, neighborhoods, maxMeters);
  if (!area && typeof listingNeighborhood === "string" && listingNeighborhood.trim()) area = listingNeighborhood.trim();
  return { routeStopCount: ordered.length, routeFirstArea: area };
}


/**
 * CP-1: the name of the neighbourhood whose centroid is nearest a point, within `maxMeters`; null
 * for no point, no neighbourhood near enough, or none at all — never a guess (§13). The ONE rule the
 * listing route summary, the Ready Made preview outline and the share images use (§18 rule 1).
 */
export function nearestAreaName(
  latitude: unknown,
  longitude: unknown,
  neighborhoods: ReadonlyArray<{ name: string; lat: number; lng: number }>,
  maxMeters = 3000,
): string | null {
  if (latitude == null || longitude == null || latitude === "" || longitude === "") return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best = Infinity;
  let name: string | null = null;
  for (const n of neighborhoods) {
    const m = haversineMeters(lat, lng, n.lat, n.lng);
    if (m < best && m <= maxMeters) {
      best = m;
      name = n.name;
    }
  }
  return name;
}
