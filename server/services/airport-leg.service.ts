/**
 * R-i (surface step 3): the one fact the airport ↔ lodging `LegRow` needs from the server — does a
 * platform private car fit this party? An approved, active `provider_services` listing in the plan's
 * city, in the `private_transportation` category (or `service_type = 'transportation'`), whose
 * `party_size_max` is unstated or at least the party (`listingFitsParty`). Read-only; no price, no
 * minutes (§13 — the leg offers modes, it quotes nothing).
 */
import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "../db";
import { providerServices, serviceCategories, trips } from "@shared/schema";
import { listingFitsParty } from "@shared/airport-leg";

export async function platformCarFits(tripId: string): Promise<boolean> {
  const [trip] = await db
    .select({ destination: trips.destination, adults: trips.adults, kids: trips.kids })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const city = (trip?.destination ?? "").split(",")[0].trim();
  if (!city) return false;
  const party = trip?.adults == null ? null : (trip.adults ?? 0) + (trip.kids ?? 0);
  const rows = await db
    .select({ max: providerServices.partySizeMax })
    .from(providerServices)
    .leftJoin(serviceCategories, eq(providerServices.categoryId, serviceCategories.id))
    .where(
      and(
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "active"),
        ilike(providerServices.city, city),
        or(eq(serviceCategories.categoryKey, "private_transportation"), eq(providerServices.serviceType, "transportation")),
      ),
    )
    .limit(50);
  return rows.some((r) => listingFitsParty(r.max == null ? null : Number(r.max), party));
}
