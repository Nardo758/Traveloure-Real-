/**
 * TC-3 rides are not marketplace listings (decision-maker, Oct 11, 2026 — ledger `2026-10-11-tc3-ride-seed`,
 * ruling 4). A catalog ride is a `provider_services` row with a `service_transport_facts` row; it is approved
 * and active so the ride recommender finds it, booking_mode 'hidden' so no cart or checkout takes it, and it
 * surfaces ONLY as a ride — never in /services browse, Discover search, the city page or the public
 * provider-services list. ONE predicate, read by every public browse reader beside the concierge-pool
 * exclusion (§18 rule 1). Readers BY ID (the ride insert, the plancard) are deliberately not gated.
 *
 * NEGATIVE SPACE: it gates the four public LIST readers the pool exclusion gates (unifiedSearch,
 * getAllActiveServices, the city view, GET /api/provider-services). A storefront needs a handle and the
 * Traveloure Transport account has none, so it has no storefront to list them on.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { serviceTransportFacts } from "@shared/schema";

/** WHERE clause over a listing's id column: true for every listing that is NOT a catalog ride. */
export function notRideListingSql(serviceIdColumn: SQL | { getSQL(): SQL }): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM ${serviceTransportFacts} WHERE ${serviceTransportFacts.serviceId} = ${serviceIdColumn})`;
}

/** The same exclusion over rows already read. */
export async function withoutRideListings<T>(rows: readonly T[], idOf: (row: T) => string): Promise<T[]> {
  if (rows.length === 0) return [];
  const ids = rows.map(idOf);
  const r = await db.execute(sql`SELECT service_id FROM service_transport_facts WHERE service_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  const rides = new Set((r.rows as Array<{ service_id: string }>).map((x) => x.service_id));
  return rides.size ? rows.filter((row) => !rides.has(idOf(row))) : [...rows];
}
