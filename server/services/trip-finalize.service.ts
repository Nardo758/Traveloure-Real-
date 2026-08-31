/**
 * TRIP FINALIZE — the versioned, immutable plan snapshot behind "Make final".
 * Trip Card rebuild Phase 1 (ledger 2026-08-31-two-surfaces-one-handoff, migration 269).
 *
 * ONE handoff, ONE author (§18 rule 1): the existing owner-gated `POST /api/trips/:tripId/finalize`
 * (routing.routes.ts) delegates to `finalizeTrip` here — there is no second finalize path. The
 * service does everything in ONE transaction on a row-locked trip:
 *   1. lock the trip row (SELECT … FOR UPDATE) so concurrent finalizes serialize per trip;
 *   2. build the plan SNAPSHOT (trip-level fields + the ordered itinerary items) and its
 *      FINGERPRINT hash;
 *   3. the IDEMPOTENT RE-FINAL RULE — if the latest final's hash equals the new one, write NO new
 *      version (the plan is unchanged); otherwise insert version = latest + 1;
 *   4. flip `trips.finalized_at` NULL → now() atomically (the render-primary signal, ruling R-F) and
 *      write the `plan_finalized` diary row in the SAME tx — ONLY on the NULL→now flip, exactly as
 *      the route did before this service existed (contract preserved).
 *
 * The fingerprint EXCLUDES live booking status (routing_status / booking_id / booking_status /
 * actual_cost / confirmation / references) and volatile timestamps, so buying a stop after Finalize
 * is not a plan edit and never forks a spurious version. The card renders the frozen snapshot joined
 * to LIVE booking rows (Phase 2), never a stale money blob.
 *
 * `flipped` (did finalized_at go NULL→now) and `finalCreated` (did a new version get written) are
 * INDEPENDENT: reopen→re-finalize with no edits flips (diary + notify) but writes no new version;
 * an edit while already-finalized writes a new version without a flip.
 */
import crypto from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { trips, itineraryItems, tripFinals, type TripFinal } from "@shared/schema";
import { logItemTransition } from "./item-transition-log.service";

/** Trip-level plan fields frozen into the snapshot and folded into the fingerprint. */
const SNAPSHOT_TRIP_FIELDS = [
  "id", "title", "destination", "startDate", "endDate", "eventType",
  "numberOfTravelers", "adults", "kids", "experienceType", "specialRequests",
  "expertTravelerNote",
] as const;

/** Item fields that DEFINE the plan (drive the fingerprint). Live booking status and volatile
 *  timestamps are deliberately omitted — see the file header. */
const FINGERPRINT_ITEM_FIELDS = [
  "title", "description", "itemType", "dayNumber", "sortOrder", "startTime", "endTime",
  "durationMinutes", "isFlexible", "locationName", "locationAddress", "latitude", "longitude",
  "googlePlaceId", "estimatedCost", "currency", "costPerPerson", "providerServiceId",
  "affiliateProductId", "dmoExtractedPlaceId", "expertNote", "origin", "suggestedBy",
] as const;

/** Deterministic JSON: object keys sorted recursively, so the hash is stable across row/key order. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, function replacer(this: any, _key, val) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce((acc: Record<string, unknown>, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

function pick<T extends Record<string, any>>(row: T, fields: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) out[f] = row[f] ?? null;
  return out;
}

/** Stable ordering for snapshot items and the fingerprint: day, then sort_order, then start_time,
 *  then id as the final tiebreaker so equal plans always serialize identically. */
function orderItems<T extends { dayNumber: number | null; sortOrder: number | null; startTime: string | null; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (a.dayNumber ?? 0) - (b.dayNumber ?? 0) ||
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    String(a.startTime ?? "").localeCompare(String(b.startTime ?? "")) ||
    a.id.localeCompare(b.id),
  );
}

export interface FinalizeResult {
  final: TripFinal;      // the latest final (existing one on an idempotent re-final, or the new row)
  version: number;       // its version
  finalCreated: boolean; // a NEW version row was written
  flipped: boolean;      // finalized_at went NULL → now() on this call
  finalizedAt: Date;     // the trip's finalized_at after this call
  itemCount: number;     // items captured in the snapshot
}

export class TripNotFoundError extends Error {
  constructor(public readonly tripId: string) {
    super(`Trip ${tripId} not found`);
    this.name = "TripNotFoundError";
  }
}

/** The latest final for a trip (highest version), or null if it has never been finalized. Read by
 *  the Trip Card assembler (Phase 2 snapshot-only render) and by the auto-refinalize helper. */
export async function getLatestTripFinal(tripId: string): Promise<TripFinal | null> {
  const [row] = await db
    .select()
    .from(tripFinals)
    .where(eq(tripFinals.tripId, tripId))
    .orderBy(desc(tripFinals.version))
    .limit(1);
  return row ?? null;
}

/**
 * Auto-capture a just-accepted change as a NEW final version — but ONLY when the trip is CURRENTLY
 * finalized (`finalized_at` set). The snapshot-rendered Trip Card shows the latest final, so a
 * suggestion accepted on a finalized trip must advance the version or it would stay invisible until
 * the next manual finalize (ledger 2026-08-31-two-surfaces-one-handoff). A REOPENED trip
 * (`finalized_at` NULL, a final exists) is deliberately left alone: its edits are the revision the
 * traveler is making on the slip, captured when they re-finalize. finalizeTrip is idempotent, so if
 * the accept did not actually change the plan fingerprint no new version is written. Best-effort by
 * contract — the caller treats a failure here as non-fatal (the accept already committed); returns
 * the new version when one was written, else null.
 */
export async function reFinalizeIfCurrentlyFinal(tripId: string, actorId: string): Promise<number | null> {
  const [trip] = await db
    .select({ finalizedAt: trips.finalizedAt })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip || !trip.finalizedAt) return null;
  const result = await finalizeTrip(tripId, actorId);
  return result.finalCreated ? result.version : null;
}

/**
 * Finalize `tripId` on behalf of `actorId` (the session user; ownership is enforced by the caller).
 * Idempotent by plan fingerprint. Throws {@link TripNotFoundError} if the trip does not exist.
 */
export async function finalizeTrip(tripId: string, actorId: string): Promise<FinalizeResult> {
  return db.transaction(async (tx) => {
    // 1. Serialize per-trip finalizes: lock the trip row for the whole transaction.
    const [trip] = await tx
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .for("update");
    if (!trip) throw new TripNotFoundError(tripId);

    // 2. Build the snapshot (trip fields + ordered items) and the plan fingerprint.
    const rawItems = await tx.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
    const ordered = orderItems(rawItems as any[]);

    const snapshotTrip = pick(trip as any, SNAPSHOT_TRIP_FIELDS);
    // Snapshot stores the FULL item rows (render fidelity — Phase 2 joins live booking rows by id),
    // deterministically ordered so the stored blob is stable for equal plans.
    const snapshotItems = ordered;
    const snapshot = { trip: snapshotTrip, items: snapshotItems };

    const fingerprint = {
      trip: snapshotTrip,
      items: ordered.map((it) => pick(it, FINGERPRINT_ITEM_FIELDS)),
    };
    const contentHash = crypto.createHash("sha256").update(stableStringify(fingerprint)).digest("hex");

    // 3. Idempotent re-final rule: unchanged plan writes no new version.
    const [latest] = await tx
      .select()
      .from(tripFinals)
      .where(eq(tripFinals.tripId, tripId))
      .orderBy(desc(tripFinals.version))
      .limit(1);

    let final: TripFinal;
    let finalCreated: boolean;
    if (latest && latest.contentHash === contentHash) {
      final = latest;
      finalCreated = false;
    } else {
      const nextVersion = (latest?.version ?? 0) + 1;
      const [inserted] = await tx
        .insert(tripFinals)
        .values({
          tripId,
          version: nextVersion,
          snapshot,
          contentHash,
          finalizedBy: actorId,
        })
        .returning();
      final = inserted;
      finalCreated = true;
    }

    // 4. Flip finalized_at NULL → now() (render-primary signal, R-F) + diary row on the flip only.
    const flippedRows = await tx
      .update(trips)
      .set({ finalizedAt: new Date() })
      .where(and(eq(trips.id, tripId), isNull(trips.finalizedAt)))
      .returning({ finalizedAt: trips.finalizedAt });
    const flipped = flippedRows.length > 0;

    if (flipped) {
      await logItemTransition(tx, {
        tripId,
        itemId: null,
        eventType: "plan_finalized",
        actorType: "traveler",
        actorId,
      });
    }

    const finalizedAt = flipped
      ? (flippedRows[0].finalizedAt as Date)
      : ((trip as any).finalizedAt as Date);

    return {
      final,
      version: final.version,
      finalCreated,
      flipped,
      finalizedAt,
      itemCount: ordered.length,
    };
  });
}
