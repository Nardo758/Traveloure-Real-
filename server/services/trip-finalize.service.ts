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
import { resolvePlanBookingPaths } from "./booking-path.service";
import crypto from "crypto";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { trips, itineraryItems, itineraryVariants, itineraryComparisons, tripFinals, type TripFinal } from "@shared/schema";
import { dominantVariant, finalCardDays, type FinalCardMeta, type FrozenFlight } from "@shared/trip-card-final";
import { anchorWallTime } from "@shared/getting-there";
import { platformCarFits as readPlatformCarFits } from "./airport-leg.service";
import { tripLegsShown } from "./routing/plan-routed-legs.service";
import { versionLabel } from "@shared/version-board";
import type { PhotoView } from "@shared/place-photos";
import { logItemTransition } from "./item-transition-log.service";
import { planDayIsPast } from "./routing/plan-legs";

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

/**
 * THE PLAN'S CONTENT HASH (R321, S11-1) — the ONE fingerprint finalize compares against the latest
 * version, exported so the plancard can say whether the working plan differs from the card being
 * shown ("Make it final again"). Pure over the trip row and its raw item rows.
 */
export function planContentHash(trip: Record<string, any>, rawItems: readonly any[]): string {
  const ordered = orderItems([...rawItems] as any[]);
  const fingerprint = {
    trip: pick(trip, SNAPSHOT_TRIP_FIELDS),
    items: ordered.map((it) => pick(it, FINGERPRINT_ITEM_FIELDS)),
  };
  return crypto.createHash("sha256").update(stableStringify(fingerprint)).digest("hex");
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

/** What `freezeAirportFacts` writes. `anchors` is always set on success; `airportLeg` only when a flight froze and its read succeeded. */
export interface FrozenAirportFacts {
  anchors: { flightArrival: FrozenFlight | null; flightDeparture: FrozenFlight | null };
  airportLeg?: { platformCarFits: boolean };
}

/**
 * The three reads the freeze makes. Tests replace a method to inject a failure (the booking-path
 * deps seam). A thrown read is caught by `freezeAirportFacts` and never escapes.
 */
export const airportFactsReads = {
  /** Flight anchors only, inside the caller's savepoint so a SQL error cannot poison finalize. */
  readFlightAnchors: async (tripId: string, tx: any): Promise<any[]> => {
    const result = await tx.execute(sql`
      SELECT id,
             anchor_type AS "anchorType",
             to_char(anchor_datetime, 'YYYY-MM-DD"T"HH24:MI:SS') AS "anchorDatetime",
             location,
             description,
             latitude,
             longitude
        FROM temporal_anchors
       WHERE trip_id = ${tripId}
         AND anchor_type IN ('flight_arrival', 'flight_departure')
       ORDER BY anchor_datetime ASC, id ASC
    `);
    return (result.rows ?? []) as any[];
  },
  /** Existing SHOWN legs. A read of `tripLegsShown` — it does not run the routing engine or write a leg. */
  shownLegs: (tripId: string): Promise<any[]> => tripLegsShown(tripId),
  platformCarFits: (tripId: string): Promise<boolean> => readPlatformCarFits(tripId),
};

/** "HH:MM" via the one wall-clock reader. `to_char` already supplied the T-form stored clock. */
function frozenWallTime(value: unknown): string | null {
  if (value instanceof Date) return anchorWallTime(value);
  if (typeof value !== "string" || value.length === 0) return null;
  return anchorWallTime(value.includes("T") ? value : value.replace(" ", "T"));
}

function blankToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The live GET treats `latitude != null` as "this anchor has a point". */
function anchorHasPoint(row: any): boolean {
  return row?.latitude != null && row.latitude !== "";
}

/**
 * Positive minutes from a SHOWN routed leg touching `anchor:<id>`, the same attachment as
 * `GET /api/trips/:id/anchors` (`tripLegsShown`, then `fromActivityId` / `toActivityId`).
 * Null when this flight has no point, or no shown leg, or the minutes are not a positive number.
 * Never computed here — only read off a leg that already exists.
 */
function airportLegMinutesFor(row: any, shown: readonly any[]): number | null {
  if (!anchorHasPoint(row)) return null;
  const end = `anchor:${row.id}`;
  const leg = shown.find((l) => l?.fromActivityId === end || l?.toActivityId === end);
  const minutes = Number(leg?.estimatedDurationMinutes);
  if (!leg || !Number.isFinite(minutes) || minutes <= 0) return null;
  const rounded = Math.round(minutes);
  return rounded > 0 ? rounded : null;
}

function toFrozenFlight(row: any, shown: readonly any[]): FrozenFlight {
  return {
    time: frozenWallTime(row.anchorDatetime),
    airport: blankToNull(row.location),
    description: blankToNull(row.description),
    airportLegMinutes: airportLegMinutesFor(row, shown),
  };
}

/**
 * Freeze the plan's flight anchors and, when one exists, whether a platform car fits.
 * Returns null when the anchors read failed — the caller then writes neither key (§15b).
 * Never throws. The anchors SELECT runs in a savepoint of `tx`: a SQL error rolls back
 * only that savepoint, so the finalize transaction is not aborted.
 *
 * The live anchors GET is unordered (`getTemporalAnchors` has no ORDER BY). This picks the
 * FIRST of each flight type by `anchor_datetime`, then `id`.
 *
 * Outside `planContentHash` and `SNAPSHOT_TRIP_FIELDS`. Pre-existing finals carry neither
 * key and are never rewritten; a flight added after finalize is not in that version until
 * the plan's content changes and a new version is written.
 */
export async function freezeAirportFacts(tripId: string, tx: any): Promise<FrozenAirportFacts | null> {
  let rows: any[];
  try {
    rows = await tx.transaction(async (sp: any) => airportFactsReads.readFlightAnchors(tripId, sp));
  } catch (err) {
    console.error(
      `[trip-finalize] flight anchors unreadable for ${tripId}; freezing neither key:`,
      (err as Error)?.message ?? err,
    );
    return null;
  }
  // The live GET is unordered, so the order it returns is not a choice. Sort here too, in case
  // a caller hands back rows the SELECT did not order.
  const ordered = [...rows].sort(
    (a, b) => String(a.anchorDatetime ?? "").localeCompare(String(b.anchorDatetime ?? "")) || String(a.id).localeCompare(String(b.id)),
  );
  const arrival = ordered.find((r) => r.anchorType === "flight_arrival") ?? null;
  const departure = ordered.find((r) => r.anchorType === "flight_departure") ?? null;
  let shown: any[] = [];
  if (anchorHasPoint(arrival) || anchorHasPoint(departure)) {
    try {
      shown = await airportFactsReads.shownLegs(tripId);
    } catch (err) {
      // The anchors themselves were read. Minutes stay null rather than dropping the freeze.
      console.error(
        `[trip-finalize] shown airport legs unreadable for ${tripId}; minutes stay null:`,
        (err as Error)?.message ?? err,
      );
      shown = [];
    }
  }
  const anchors = {
    flightArrival: arrival ? toFrozenFlight(arrival, shown) : null,
    flightDeparture: departure ? toFrozenFlight(departure, shown) : null,
  };
  if (anchors.flightArrival == null && anchors.flightDeparture == null) return { anchors };
  try {
    const fits = await airportFactsReads.platformCarFits(tripId);
    if (typeof fits !== "boolean") return { anchors };
    return { anchors, airportLeg: { platformCarFits: fits } };
  } catch (err) {
    console.error(
      `[trip-finalize] airport-leg read failed for ${tripId}; omitting airportLeg:`,
      (err as Error)?.message ?? err,
    );
    return { anchors };
  }
}

/**
 * Finalize `tripId` on behalf of `actorId` (the session user; ownership is enforced by the caller).
 * Idempotent by plan fingerprint. Throws {@link TripNotFoundError} if the trip does not exist.
 */
export async function finalizeTrip(tripId: string, actorId: string): Promise<FinalizeResult> {
  // Step 6: the card's stored photo references are resolved BEFORE the lock — a Commons read is
  // network I/O and must not hold the trip row. Best effort: a failure stores no photos, never fails
  // the finalize (§15b — an ancillary effect may not break the operation that authorizes it).
  const photos = await finalCardPhotos(tripId).catch(() => ({}));
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
    // Step 6 (spec §9): per-day {source_run_id, source_variant_id}, the version the plan was built
    // from, and the stored photo references. Outside the fingerprint (below) by construction.
    const card = await finalCardMeta(tx, tripId, ordered as any[], photos);
    // BP-1 (ledger `2026-10-12-bp1-booking-path`): each item's booking path, frozen with the plan like every other
    // snapshot fact. Outside the fingerprint (below) — it is a derived reading, not the plan's content — and kept
    // as-is by the live-days refresh, which spreads the snapshot. A failed read freezes nothing (§15b): the card
    // then reads the live path, never a guessed one.
    const bookingPaths = await resolvePlanBookingPaths(trip as any, ordered as any[]).then(
      (m) => Object.fromEntries(m),
      () => null,
    );
    // Flight anchors and the airport leg, frozen with the plan like bookingPaths and outside the
    // fingerprint below. A failed anchors read freezes neither key; finalize still succeeds.
    // Pre-existing finals carry neither key and are never rewritten. A flight added after finalize
    // is not in that version until the plan's content changes and a new version is written.
    const airportFacts = await freezeAirportFacts(tripId, tx);
    const snapshot = {
      trip: snapshotTrip,
      items: snapshotItems,
      card,
      ...(bookingPaths ? { bookingPaths } : {}),
      ...(airportFacts
        ? {
            anchors: airportFacts.anchors,
            ...(airportFacts.airportLeg ? { airportLeg: airportFacts.airportLeg } : {}),
          }
        : {}),
    };

    const contentHash = planContentHash(trip as any, ordered as any[]);

    // 3. Idempotent re-final rule: unchanged plan writes no new version. Anchors sit outside
    //    this hash, so adding a flight does not fork a version and does not rewrite the one
    //    already stored.
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

/** Step 6: the card meta a snapshot carries (`@shared/trip-card-final`). */
async function finalCardMeta(tx: any, tripId: string, items: any[], photos: Record<string, PhotoView>): Promise<FinalCardMeta> {
  const days = finalCardDays(items);
  const dom = dominantVariant(days);
  let builtFrom: FinalCardMeta["builtFrom"] = null;
  if (dom) {
    const [variant] = await tx
      .select({ comparisonId: itineraryVariants.comparisonId })
      .from(itineraryVariants)
      .where(eq(itineraryVariants.id, dom.sourceVariantId))
      .limit(1);
    if (variant) {
      const siblings = await tx
        .select({ id: itineraryVariants.id })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.comparisonId, variant.comparisonId))
        .orderBy(asc(itineraryVariants.sortOrder), asc(itineraryVariants.id));
      const idx = siblings.findIndex((v: { id: string }) => v.id === dom.sourceVariantId);
      const runs = await tx
        .select({ id: itineraryComparisons.id })
        .from(itineraryComparisons)
        .where(and(eq(itineraryComparisons.tripId, tripId), isNotNull(itineraryComparisons.optimizedAt)))
        .orderBy(asc(itineraryComparisons.optimizedAt), asc(itineraryComparisons.id));
      const run = runs.findIndex((r: { id: string }) => r.id === variant.comparisonId);
      if (idx >= 0) builtFrom = { versionLabel: versionLabel(idx), runNumber: run >= 0 ? run + 1 : null };
    }
  }
  return { days, builtFrom, photos };
}

/** Step 6 R-aq: one stored photo per day — the day's first located stop (never the stay); stored
 *  sources only (ours / Wikimedia), never a live Google photo. */
async function finalCardPhotos(tripId: string): Promise<Record<string, PhotoView>> {
  const rows = orderItems((await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId))) as any[]);
  const firstByDay = new Map<number, any>();
  for (const r of rows) {
    if (r.dayNumber == null || firstByDay.has(r.dayNumber) || r.itemType === "accommodation") continue;
    firstByDay.set(r.dayNumber, r);
  }
  if (!firstByDay.size) return {};
  const { photosFor, defaultPhotoDeps } = await import("./place-photos.service");
  const { placeRefsForTrip } = await import("./content-facts/place-facts.service");
  const picked = Array.from(firstByDay.values());
  const refs = await placeRefsForTrip(tripId, picked.map((r) => r.id));
  const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const [tripRow] = await db.select({ destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const city = (tripRow?.destination ?? "").split(",")[0].trim() || null;
  const resolved = await photosFor(
    picked.map((r) => ({ id: r.id, name: r.title ?? "", placeId: refs.get(r.id)?.placeId ?? null, lat: refs.get(r.id)?.lat ?? num(r.latitude), lng: refs.get(r.id)?.lng ?? num(r.longitude), ownImage: null, city, otherNames: [r.locationName], itemPlaceId: r.googlePlaceId ?? null })),
    { ...defaultPhotoDeps, googleLive: null },
  );
  const out: Record<string, PhotoView> = {};
  for (const [id, p] of Object.entries(resolved)) if (p && p.source !== "google_live") out[id] = p;
  return out;
}

export interface FinalRefreshResult {
  /** The snapshot row was rewritten (false when no final exists or nothing changed). */
  refreshed: boolean;
  /** Days whose items came from the live plan (every day not yet past). */
  liveDays: number[];
}

/**
 * P0-c item 3 (ledger `2026-10-12-p0c-hotfix`; LD 69): the Trip Card renders the latest final's FROZEN
 * snapshot, so a stop edited after Make final kept its old time on the card (production 330f594a: the
 * item said 17:35, a snapshot taken five days earlier said 17:30). After every plan-legs recompute the
 * latest final's items are regenerated from the live plan for EVERY DAY NOT YET PAST (in the plan's zone,
 * the engine's own `planDayIsPast`); a past day keeps its frozen items, because what happened is not
 * rewritten. An item with no day counts as not past.
 *
 * The second and last writer of `trip_finals` beside `finalizeTrip`, under the same trip-row lock. It
 * rewrites the latest version IN PLACE: no new version, no `finalized_at` flip, no diary row, and the
 * `content_hash` is kept — it fingerprints the plan as it was made final, which is what "Make it final
 * again" and the idempotent re-final rule compare against. The card meta's per-day sources are re-derived
 * from the merged items (`finalCardDays`); the stored photos are kept. IDEMPOTENT: when the merged items
 * equal the stored ones nothing is written. Never on read — called from the engine's debounced recompute.
 */
export async function refreshTripFinalLiveDays(tripId: string, now: Date = new Date()): Promise<FinalRefreshResult> {
  return db.transaction(async (tx) => {
    const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).for("update");
    if (!trip) return { refreshed: false, liveDays: [] };
    const [latest] = await tx
      .select()
      .from(tripFinals)
      .where(eq(tripFinals.tripId, tripId))
      .orderBy(desc(tripFinals.version))
      .limit(1);
    if (!latest) return { refreshed: false, liveDays: [] };
    const start = (trip as any).startDate ? String((trip as any).startDate) : null;
    const tz = (trip as any).timezone ?? null;
    const past = (dayNumber: number | null) => dayNumber != null && planDayIsPast(start, dayNumber, tz, now);
    const snap = (latest.snapshot ?? {}) as { trip?: unknown; items?: any[]; card?: FinalCardMeta };
    const frozen = (snap.items ?? []).filter((it) => past(it.dayNumber ?? null));
    const live = ((await tx.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId))) as any[]).filter(
      (it) => !past(it.dayNumber ?? null),
    );
    const items = orderItems([...frozen, ...live] as any[]);
    const liveDays = Array.from(new Set(live.map((it) => it.dayNumber).filter((d): d is number => typeof d === "number"))).sort((a, b) => a - b);
    if (stableStringify(items) === stableStringify(snap.items ?? [])) return { refreshed: false, liveDays };
    const card: FinalCardMeta = { ...(snap.card ?? { builtFrom: null, photos: {} }), days: finalCardDays(items) } as FinalCardMeta;
    // `{ ...snap, items, card }` keeps every other snapshot key (bookingPaths, anchors, airportLeg).
    // A final that predates those keys stays without them; this rewrite does not add them.
    await tx
      .update(tripFinals)
      .set({ snapshot: { ...snap, items, card } })
      .where(and(eq(tripFinals.id, latest.id), eq(tripFinals.version, latest.version)));
    return { refreshed: true, liveDays };
  });
}
