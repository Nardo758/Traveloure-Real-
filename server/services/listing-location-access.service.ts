/**
 * CP-1 — who reads a listing's EXACT location (ledger `2026-10-15-cp1-public-payloads`).
 *
 * The owner, and a traveler holding a booking of this listing in a post-payment status
 * (`EXACT_LOCATION_BOOKING_STATUSES`). Everyone else — anonymous, another member, a traveler whose
 * booking never got past payment — reads the coarse public projection. The viewer comes from the
 * SESSION (§14), never the query string.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { cityNeighborhoods, serviceBookings } from "@shared/schema";
import { EXACT_LOCATION_BOOKING_STATUSES } from "@shared/public-listing-location";

export async function viewerSeesExactLocation(
  serviceId: string,
  ownerUserId: string | null | undefined,
  viewerId: string | null | undefined,
): Promise<boolean> {
  if (!viewerId) return false;
  if (ownerUserId && viewerId === ownerUserId) return true;
  const [row] = await db
    .select({ id: serviceBookings.id })
    .from(serviceBookings)
    .where(
      and(
        eq(serviceBookings.serviceId, serviceId),
        eq(serviceBookings.travelerId, viewerId),
        inArray(serviceBookings.status, EXACT_LOCATION_BOOKING_STATUSES as string[]),
      ),
    )
    .limit(1);
  return !!row;
}

/** A city's neighbourhoods by name and centroid, for naming the area a route starts in. */
export async function cityNeighborhoodNames(city: string): Promise<Array<{ name: string; lat: number; lng: number }>> {
  const rows = await db
    .select({ name: cityNeighborhoods.name, lat: cityNeighborhoods.centroidLat, lng: cityNeighborhoods.centroidLng })
    .from(cityNeighborhoods)
    .where(sql`lower(${cityNeighborhoods.city}) = lower(${city})`);
  return rows
    .map((r) => ({ name: r.name, lat: Number(r.lat), lng: Number(r.lng) }))
    .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng));
}
