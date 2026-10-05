/**
 * R-be (work plan L1-6): where a buyer's copy came from. DERIVED, never stored — the copy is the
 * `ready_made_purchases.clone_trip_id` of exactly one purchase (that column is the clone's
 * idempotency anchor), and the purchase names the listing, which names its author. No new column:
 * the plan's optional migration 347 (`trips.source_ready_made_trip_id`) is NOT added, because the
 * join already answers the question and a stored copy would be a second author of it (§18 rule 1).
 *
 * Read by the plancard handler, behind its own gate, and never by the assembler that also serves the
 * public share/teaser channels.
 *
 * §13 / LD 40:
 *  · a trip that is no purchase's clone ⇒ `null` (not a copy) — never an empty object;
 *  · the author is named by display name and handle only, never by `users.id`;
 *  · `authorDisplayName` is the author's first name, else `null` — never "an expert";
 *  · `lastVerifiedAt` is the listing's own `last_verified_at`, `null` when never checked (its writer
 *    is bulk verify, L1-11) — never the purchase date.
 *
 * Every purchase status counts, refunded and revoked included: provenance is a fact about where the
 * plan's contents came from, and a refund does not change it. (The revision entitlement on
 * `GET /api/ready-made/purchases/by-clone/:tripId` is a different question and keeps its own filter.)
 */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { readyMadePurchases, readyMadeTrips, users } from "@shared/schema";

export type ReadyMadeProvenance = {
  sourceReadyMadeTripId: string;
  listingTitle: string;
  authorDisplayName: string | null;
  authorHandle: string | null;
  lastVerifiedAt: string | null;
  /** R-bf / R-be (R323): the latest check stamp on this copy's confirmed legs — null when none (§13). */
  legsCheckedAt: string | null;
};

export async function readyMadeProvenanceForTrip(tripId: string): Promise<ReadyMadeProvenance | null> {
  const [row] = await db
    .select({
      sourceReadyMadeTripId: readyMadeTrips.id,
      listingTitle: readyMadeTrips.title,
      lastVerifiedAt: readyMadeTrips.lastVerifiedAt,
      authorFirstName: users.firstName,
      authorHandle: users.handle,
    })
    .from(readyMadePurchases)
    .innerJoin(readyMadeTrips, eq(readyMadeTrips.id, readyMadePurchases.readyMadeTripId))
    .leftJoin(users, eq(users.id, readyMadeTrips.authorId))
    .where(eq(readyMadePurchases.cloneTripId, tripId))
    .orderBy(desc(readyMadePurchases.purchasedAt))
    .limit(1);
  if (!row) return null;
  const firstName = row.authorFirstName?.trim();
  const checked = await db.execute(sql`
    SELECT max(checked_at) AS at FROM transport_legs
    WHERE trip_id = ${tripId} AND variant_id IS NULL AND proposal_status = 'confirmed' AND checked_at IS NOT NULL
  `);
  const legsAt = (checked.rows?.[0] as any)?.at;
  return {
    sourceReadyMadeTripId: row.sourceReadyMadeTripId,
    listingTitle: row.listingTitle,
    authorDisplayName: firstName ? firstName : null,
    authorHandle: row.authorHandle ?? null,
    lastVerifiedAt: row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toISOString() : null,
    legsCheckedAt: legsAt ? new Date(legsAt).toISOString() : null,
  };
}
