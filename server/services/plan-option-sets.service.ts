/**
 * PLAN OPTION SETS — THE ONE WRITER (Track A step A3; ledger `2026-09-29-a3-option-sets`; product map
 * §E2/§E3 approved R124–R126, R129; §M1/§M7–M9 ratified `2026-09-29-m7-m9-ratified`).
 *
 * An option is a CANDIDATE. Only the chosen one becomes an `itinerary_items` row (LD 39), through
 * `storage.createItineraryItem` — the writer the add rail uses — so no reader of `itinerary_items`
 * ever sees an unchosen option. Rules held here and nowhere else:
 *   · WHO: read = the plan's read audience (`authorizeTripLogistics`); add / remove / open / close /
 *     promote = owner, delegate or a §12 WRITE advisor (`requireWriteAccess`); CHOOSE = owner or
 *     delegate only (R129 — no mode lets an expert choose). Every refusal of a set or option that is
 *     not this plan's is ONE 404 (LD 40).
 *   · CAP: three options per set; a fourth is a 409, never a clamp (§E2).
 *   · CHOOSE is an atomic claim (`… WHERE status = 'open'`), then the item write, in ONE transaction
 *     (§15). Choosing into an empty slot inserts the stay; choosing a non-incumbent rewrites the
 *     incumbent IN PLACE, guarded in the same statement by `routing_status = 'in_planning' AND
 *     booking_id IS NULL` — a purchased item is never replaced by a candidate.
 *   · ANCHOR ROLE is server-derived (M7): a lodging anchor set is PRIMARY for a lodging-first Trip and
 *     SECONDARY for a schedule-first one; one primary per (trip, stop) is enforced in the transaction.
 *   · PROMOTE (M8): "Build my days around this" on a located, dated item makes it the primary, demotes
 *     the previous primary to secondary, keeps every open set as it is, and records
 *     `slip_anchor_changed`. A finalized plan is refused (Reopen first).
 *   · PROVENANCE (§14/§19): titles, coordinates and prices are copied from the SOURCE ROW server-side;
 *     only a `custom` option's title and pin come from the body, and a half pin is refused.
 */
import crypto from "node:crypto";
import { and, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { storage, stripItineraryItemRoutingFields } from "../storage";
import {
  cityNeighborhoods,
  hotelCache,
  hotelOfferCache,
  itineraryItems,
  planOptionSets,
  planOptions,
  providerServices,
  trips,
  type PlanOption,
  type PlanOptionSet,
} from "@shared/schema";
import { OPTION_SET_CAP, nextOptionPosition, pinPrecision, type AnchorRole } from "@shared/plan-options";
import { experienceGroupFor, tripsAnchorFor } from "@shared/experience-group";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";
import { verifyTripOwnership } from "../utils/trip-ownership";
import { isManagingEaForTrip } from "./ea-plan-delegate.service";
import { readPlanPenOccasionSlug } from "./plan-pen-occasion.service";
import { factPointsForTrip } from "./content-facts/place-facts.service";
import { resolveOccasionForPlan } from "@shared/occasions";
import type { DraftOpenSet } from "@shared/draft-basis";
import { trackFunnelEvent } from "../utils/funnelTracker";
import { loadMarketCentroids, loadMatrixReader } from "./travel-time-matrix.service";
import { WITHIN_WALK_METERS } from "./anchor-scoring";
import {
  PLAN_FIT_VERSION,
  beatsChosen,
  easiestIndex,
  fitBasisKey,
  fitRanks,
  planFitFor,
  toPoint,
  type FitItem,
  type PlanFit,
} from "@shared/plan-fit";
import { snapToCentroid, type Centroid } from "@shared/travel-time";
import { planFitEasierThreshold, slipEventsHourlyCap } from "../config/plan-fit.config";

export const SLIP_OPTION_ADDED_EVENT = "slip_option_added";
export const SLIP_ANCHOR_CHANGED_EVENT = "slip_anchor_changed";
const SLIP_STAGE = "SLIP";

export class OptionSetError extends Error {
  constructor(public status: number, public code: string, message: string, public detail?: Record<string, unknown>) {
    super(message);
  }
}
const notFound = () => new OptionSetError(404, "not_found", "No such option set on this plan");

export type Role = "owner" | "delegate" | "advisor";

/** The actor's standing on the plan, or null. Choose needs owner/delegate; write needs any of three. */
export async function planRole(tripId: string, userId: string | null | undefined, need: "read" | "write" | "choose"): Promise<Role | null> {
  if (!userId) return null;
  if (await verifyTripOwnership(tripId, userId)) return "owner";
  if (await isManagingEaForTrip(tripId, userId)) return "delegate";
  if (need === "choose") return null;
  const denied = await authorizeTripLogistics(tripId, userId, "plan-option-sets", { requireWriteAccess: need === "write" });
  return denied ? null : "advisor";
}

export interface OptionSetView extends PlanOptionSet {
  options: PlanOption[];
}

export async function listOptionSets(tripId: string): Promise<OptionSetView[]> {
  const sets = await db.select().from(planOptionSets).where(eq(planOptionSets.tripId, tripId)).orderBy(planOptionSets.createdAt);
  if (!sets.length) return [];
  const opts = await db.select().from(planOptions).where(inArray(planOptions.setId, sets.map((s) => s.id))).orderBy(planOptions.position);
  return sets.map((s) => ({ ...s, options: opts.filter((o) => o.setId === s.id) }));
}

/** Open sets on a plan — Finalize is refused while any exists (R125). */
export async function openOptionSets(tripId: string): Promise<Array<{ id: string; label: string | null; categoryKey: string | null }>> {
  return db
    .select({ id: planOptionSets.id, label: planOptionSets.label, categoryKey: planOptionSets.categoryKey })
    .from(planOptionSets)
    .where(and(eq(planOptionSets.tripId, tripId), eq(planOptionSets.status, "open")));
}

/** Is this item the slot of an open set? The routing rail refuses to route it until decided (§E3). */
export async function itemHasOpenSet(itemId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: planOptionSets.id })
    .from(planOptionSets)
    .where(and(eq(planOptionSets.itineraryItemId, itemId), eq(planOptionSets.status, "open")))
    .limit(1);
  return !!row;
}

/**
 * M7: the role a new LODGING anchor set takes. Resolved from the plan's recorded occasion (the one
 * the modal chose, `readPlanPenOccasionSlug`) — a Trip whose occasion has `schedule: true` makes
 * lodging SECONDARY. No recorded occasion ⇒ primary (the plain-trip shape, M7's NULL row).
 */
async function lodgingAnchorRole(tripId: string): Promise<AnchorRole> {
  const [trip] = await db.select({ userId: trips.userId }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const slug = await readPlanPenOccasionSlug(trip?.userId, tripId);
  const row = slug ? await storage.getExperienceTypeBySlug(slug) : null;
  if (!row || experienceGroupFor(row as any) !== "trips") return "primary";
  return tripsAnchorFor(row as any).kind === "fixed_item" ? "secondary" : "primary";
}

export async function createOptionSet(input: {
  tripId: string;
  userId: string;
  itineraryItemId?: string | null;
  dayNumber?: number | null;
  userExperienceId?: string | null;
  categoryKey?: string | null;
  label?: string | null;
  anchor?: boolean;
}): Promise<OptionSetView> {
  const role = await planRole(input.tripId, input.userId, "write");
  if (!role) throw notFound();

  let anchorRole: AnchorRole | null = null;
  if (input.anchor) anchorRole = input.categoryKey === "accommodation" ? await lodgingAnchorRole(input.tripId) : "primary";

  return db.transaction(async (tx) => {
    // Serialize anchor decisions per plan (one primary per stop).
    await tx.execute(sql`SELECT id FROM trips WHERE id = ${input.tripId} FOR UPDATE`);
    if (anchorRole === "primary") {
      const [primary] = await tx
        .select({ id: planOptionSets.id })
        .from(planOptionSets)
        .where(and(eq(planOptionSets.tripId, input.tripId), eq(planOptionSets.anchorRole, "primary"), sql`COALESCE(stop_position, 0) = 0`))
        .limit(1);
      if (primary) anchorRole = "secondary";
    }

    let incumbent: typeof itineraryItems.$inferSelect | undefined;
    if (input.itineraryItemId) {
      [incumbent] = await tx
        .select()
        .from(itineraryItems)
        .where(and(eq(itineraryItems.id, input.itineraryItemId), eq(itineraryItems.tripId, input.tripId)))
        .limit(1);
      if (!incumbent) throw new OptionSetError(404, "not_found", "No such item on this plan");
      if ((incumbent as any).routingStatus !== "in_planning" || incumbent.bookingId) {
        throw new OptionSetError(409, "item_not_in_planning", "Only an item still being planned can be compared");
      }
      // One open comparison per item (the partial UNIQUE in migration 332 is the backstop; the trip
      // lock above serializes this read so the answer is a 409, never a constraint 500).
      const [already] = await tx
        .select({ id: planOptionSets.id })
        .from(planOptionSets)
        .where(and(eq(planOptionSets.itineraryItemId, incumbent.id), eq(planOptionSets.status, "open")))
        .limit(1);
      if (already) throw new OptionSetError(409, "set_already_open", "You're already comparing places for this", { setId: already.id });
    }

    const id = crypto.randomUUID();
    const [set] = await tx
      .insert(planOptionSets)
      .values({
        id,
        tripId: input.tripId,
        itineraryItemId: input.itineraryItemId ?? null,
        userExperienceId: input.userExperienceId ?? null,
        dayNumber: incumbent?.dayNumber ?? input.dayNumber ?? null,
        categoryKey: input.categoryKey ?? null,
        label: input.label ?? null,
        status: "open",
        anchorRole,
        stopPosition: anchorRole ? 0 : null,
        createdBy: input.userId,
      })
      .returning();
    const options: PlanOption[] = [];
    if (incumbent) {
      const [opt] = await tx
        .insert(planOptions)
        .values({
          id: crypto.randomUUID(),
          setId: id,
          position: 1,
          sourceKind: "incumbent",
          providerServiceId: incumbent.providerServiceId ?? null,
          title: incumbent.title,
          locationName: incumbent.locationName ?? null,
          latitude: incumbent.latitude ?? null,
          longitude: incumbent.longitude ?? null,
          locationPrecision: incumbent.latitude && incumbent.longitude ? "exact" : null,
          addedByUserId: input.userId,
          addedByRole: role === "advisor" ? "expert" : role === "delegate" ? "delegate" : "traveler",
        })
        .returning();
      options.push(opt);
    }
    return { ...set, options };
  });
}

type OptionSource =
  | { kind: "hotel_cache"; hotelCacheId: string; engine?: boolean }
  | { kind: "listing"; providerServiceId: string }
  | { kind: "custom"; title: string; locationName?: string | null; lat?: unknown; lng?: unknown };

export async function addOption(input: { tripId: string; setId: string; userId: string; source: OptionSource; sourceImpressionId?: string | null }): Promise<PlanOption> {
  const role = await planRole(input.tripId, input.userId, "write");
  if (!role) throw notFound();

  // Resolve the source row BEFORE the claim, server-side (§14): the body names a row, never its facts.
  let values: Omit<typeof planOptions.$inferInsert, "id" | "setId" | "position">;
  const addedBy = { addedByUserId: input.userId, addedByRole: role === "advisor" ? "expert" : role === "delegate" ? "delegate" : "traveler" };
  if (input.source.kind === "hotel_cache") {
    const [h] = await db.select().from(hotelCache).where(eq(hotelCache.id, input.source.hotelCacheId)).limit(1);
    if (!h) throw new OptionSetError(404, "source_not_found", "That place is not available to compare");
    const located = h.latitude != null && h.longitude != null;
    values = {
      sourceKind: input.source.engine ? "engine" : "affiliate",
      hotelCacheId: h.id,
      title: h.name,
      locationName: h.address ?? h.city ?? null,
      latitude: h.latitude ?? null,
      longitude: h.longitude ?? null,
      // R193: for the slice, a hotel_cache row carrying its own coordinates counts as exact.
      locationPrecision: located ? "exact" : null,
      priceSnapshot: null, // hotel_cache states no price; an offer for the plan's dates is A4's to show
      ...addedBy,
      sourceImpressionId: input.sourceImpressionId ?? null,
    };
  } else if (input.source.kind === "listing") {
    const [s] = await db.select().from(providerServices).where(eq(providerServices.id, input.source.providerServiceId)).limit(1);
    if (!s || s.approvalStatus !== "approved" || s.status !== "active") {
      throw new OptionSetError(404, "source_not_found", "That listing is not available to compare");
    }
    const located = (s as any).latitude != null && (s as any).longitude != null;
    values = {
      sourceKind: "listing",
      providerServiceId: s.id,
      title: s.serviceName,
      locationName: (s as any).locationName ?? (s as any).location ?? null,
      latitude: (s as any).latitude ?? null,
      longitude: (s as any).longitude ?? null,
      locationPrecision: located ? ((s as any).locationPrecision ?? "exact") : null,
      priceSnapshot: s.price ?? null,
      ...addedBy,
      sourceImpressionId: input.sourceImpressionId ?? null,
    };
  } else {
    const title = String(input.source.title ?? "").trim();
    if (!title) throw new OptionSetError(400, "title_required", "Give the place a name");
    const pin = pinPrecision(input.source.lat, input.source.lng);
    if (!pin.ok) throw new OptionSetError(400, "half_pin", "A pin needs both a latitude and a longitude");
    values = {
      sourceKind: "custom",
      title: title.slice(0, 255),
      locationName: input.source.locationName ? String(input.source.locationName).slice(0, 255) : null,
      latitude: pin.precision ? String(input.source.lat) : null,
      longitude: pin.precision ? String(input.source.lng) : null,
      locationPrecision: pin.precision,
      ...addedBy,
    };
  }

  const option = await db.transaction(async (tx) => {
    const [set] = await tx
      .select()
      .from(planOptionSets)
      .where(and(eq(planOptionSets.id, input.setId), eq(planOptionSets.tripId, input.tripId)))
      .for("update");
    if (!set) throw notFound();
    if (set.status !== "open") throw new OptionSetError(409, "set_decided", "This comparison is already decided");
    const taken = await tx.select({ position: planOptions.position }).from(planOptions).where(eq(planOptions.setId, set.id));
    const position = nextOptionPosition(taken.map((t) => t.position));
    if (position == null) {
      throw new OptionSetError(409, "set_full", `A comparison holds up to ${OPTION_SET_CAP} places`, { cap: OPTION_SET_CAP });
    }
    const [row] = await tx.insert(planOptions).values({ id: crypto.randomUUID(), setId: set.id, position, ...values }).returning();
    return row;
  });

  // E3 (slip-funnel-events §3.3): written after the commit; the amount is never recorded, only whether one was stated.
  void trackFunnelEvent({
    userId: input.userId,
    tripId: input.tripId,
    eventType: SLIP_OPTION_ADDED_EVENT,
    funnelStage: SLIP_STAGE,
    eventData: {
      setId: input.setId,
      optionId: option.id,
      optionSource: option.sourceKind,
      addedByRole: option.addedByRole,
      position: option.position,
      hasPrice: option.priceSnapshot != null,
      sourceImpressionId: option.sourceImpressionId ?? null,
    },
  });
  return option;
}

export async function removeOption(input: { tripId: string; setId: string; optionId: string; userId: string }): Promise<void> {
  if (!(await planRole(input.tripId, input.userId, "write"))) throw notFound();
  await db.transaction(async (tx) => {
    const [set] = await tx
      .select()
      .from(planOptionSets)
      .where(and(eq(planOptionSets.id, input.setId), eq(planOptionSets.tripId, input.tripId)))
      .for("update");
    if (!set) throw notFound();
    if (set.status !== "open") throw new OptionSetError(409, "set_decided", "This comparison is already decided");
    const [opt] = await tx.select().from(planOptions).where(and(eq(planOptions.id, input.optionId), eq(planOptions.setId, set.id))).limit(1);
    if (!opt) throw notFound();
    if (opt.sourceKind === "incumbent") throw new OptionSetError(409, "incumbent", "The place already on your plan can't be removed here — close the comparison to keep it");
    await tx.delete(planOptions).where(eq(planOptions.id, opt.id));
  });
}

/** §E3 choose — owner or delegate only (R129). One transaction: the claim, then the item write. */
export async function chooseOption(input: { tripId: string; setId: string; optionId: string; userId: string }): Promise<{ set: PlanOptionSet; itemId: string }> {
  const role = await planRole(input.tripId, input.userId, "choose");
  if (!role) throw notFound();
  return db.transaction(async (tx) => {
    const [opt] = await tx.select().from(planOptions).where(and(eq(planOptions.id, input.optionId), eq(planOptions.setId, input.setId))).limit(1);
    if (!opt) throw notFound();
    const [claimed] = await tx
      .update(planOptionSets)
      .set({ status: "chosen", chosenOptionId: opt.id, chosenAt: new Date(), chosenBy: input.userId, chosenVia: "choose" })
      .where(and(eq(planOptionSets.id, input.setId), eq(planOptionSets.tripId, input.tripId), eq(planOptionSets.status, "open")))
      .returning();
    if (!claimed) {
      const [exists] = await tx.select({ id: planOptionSets.id }).from(planOptionSets).where(and(eq(planOptionSets.id, input.setId), eq(planOptionSets.tripId, input.tripId))).limit(1);
      if (!exists) throw notFound();
      throw new OptionSetError(409, "set_decided", "This comparison is already decided");
    }
    const itemFields = {
      title: opt.title,
      locationName: opt.locationName ?? null,
      latitude: opt.latitude ?? null,
      longitude: opt.longitude ?? null,
      providerServiceId: opt.providerServiceId ?? null,
    };
    if (!claimed.itineraryItemId) {
      // Empty slot, origin server-stamped (LD 12 / LD 52 C). A stay sits on the
      // plan's first day (check-in) unless the set was placed on a day.
      // Inside the claim's transaction, through the SAME storage strip `createItineraryItem` applies,
      // so a failed claim can never leave a chosen item behind.
      const [created] = await tx
        .insert(itineraryItems)
        .values(
          stripItineraryItemRoutingFields({
            tripId: input.tripId,
            dayNumber: claimed.dayNumber ?? 1,
            itemType: claimed.categoryKey === "accommodation" ? "accommodation" : "activity",
            userExperienceId: claimed.userExperienceId ?? null,
            origin: role === "delegate" ? "assistant" : "traveler",
            ...itemFields,
          }) as any,
        )
        .returning({ id: itineraryItems.id });
      await tx.update(planOptionSets).set({ itineraryItemId: created.id }).where(eq(planOptionSets.id, claimed.id));
      return { set: { ...claimed, itineraryItemId: created.id }, itemId: created.id };
    }
    // The incumbent is rewritten too: after a reopen (§M9) the item holds the LAST choice, and
    // choosing the original place back must put it back — never a silent no-op.
    const rewritten = await tx
      .update(itineraryItems)
      .set({ ...itemFields, updatedAt: new Date() })
      .where(and(eq(itineraryItems.id, claimed.itineraryItemId), sql`routing_status = 'in_planning'`, sql`booking_id IS NULL`))
      .returning({ id: itineraryItems.id });
    if (!rewritten.length) throw new OptionSetError(409, "item_not_in_planning", "The place on your plan is already being booked");
    return { set: claimed, itemId: claimed.itineraryItemId };
  });
}

export async function closeOptionSet(input: { tripId: string; setId: string; userId: string }): Promise<PlanOptionSet> {
  if (!(await planRole(input.tripId, input.userId, "write"))) throw notFound();
  const [closed] = await db
    .update(planOptionSets)
    .set({ status: "closed" })
    .where(and(eq(planOptionSets.id, input.setId), eq(planOptionSets.tripId, input.tripId), eq(planOptionSets.status, "open")))
    .returning();
  if (closed) return closed;
  const [exists] = await db.select({ id: planOptionSets.id }).from(planOptionSets).where(and(eq(planOptionSets.id, input.setId), eq(planOptionSets.tripId, input.tripId))).limit(1);
  if (!exists) throw notFound();
  throw new OptionSetError(409, "set_decided", "This comparison is already decided");
}

/**
 * M8 — "Build my days around this". The item becomes the primary anchor of stop 0; the previous
 * primary becomes secondary; open sets are untouched. Owner or delegate (a WRITE advisor suggests,
 * never promotes — R129's line). A finalized plan is refused: Reopen first.
 */
export async function promoteAnchor(input: { tripId: string; itemId: string; userId: string }): Promise<{ setId: string; fromCategory: string | null; toCategory: string | null }> {
  if (!(await planRole(input.tripId, input.userId, "choose"))) throw notFound();
  const result = await db.transaction(async (tx) => {
    const [trip] = await tx.select({ finalizedAt: trips.finalizedAt }).from(trips).where(eq(trips.id, input.tripId)).for("update");
    if (!trip) throw notFound();
    if (trip.finalizedAt) throw new OptionSetError(409, "plan_finalized", "Reopen the plan to change what it's built around");
    const [item] = await tx.select().from(itineraryItems).where(and(eq(itineraryItems.id, input.itemId), eq(itineraryItems.tripId, input.tripId))).limit(1);
    if (!item) throw new OptionSetError(404, "not_found", "No such item on this plan");
    if (item.latitude == null || item.longitude == null || item.dayNumber == null) {
      throw new OptionSetError(409, "not_located_or_dated", "Only a located, dated item can anchor the plan");
    }
    const toCategory = item.itemType === "accommodation" ? "accommodation" : (item.itemType ?? null);

    const [prev] = await tx
      .select()
      .from(planOptionSets)
      .where(and(eq(planOptionSets.tripId, input.tripId), eq(planOptionSets.anchorRole, "primary"), sql`COALESCE(stop_position, 0) = 0`))
      .limit(1);
    if (prev?.itineraryItemId === item.id) return { setId: prev.id, fromCategory: prev.categoryKey, toCategory, unchanged: true };
    if (prev) await tx.update(planOptionSets).set({ anchorRole: "secondary" }).where(eq(planOptionSets.id, prev.id));

    const [existing] = await tx.select().from(planOptionSets).where(and(eq(planOptionSets.tripId, input.tripId), eq(planOptionSets.itineraryItemId, item.id))).limit(1);
    let setId: string;
    if (existing) {
      await tx.update(planOptionSets).set({ anchorRole: "primary", stopPosition: 0 }).where(eq(planOptionSets.id, existing.id));
      setId = existing.id;
    } else {
      setId = crypto.randomUUID();
      const optId = crypto.randomUUID();
      await tx.insert(planOptionSets).values({
        id: setId, tripId: input.tripId, itineraryItemId: item.id, dayNumber: item.dayNumber, categoryKey: toCategory,
        status: "chosen", anchorRole: "primary", stopPosition: 0, chosenOptionId: optId, chosenAt: new Date(), chosenBy: input.userId,
        chosenVia: "choose", createdBy: input.userId,
      });
      await tx.insert(planOptions).values({
        id: optId, setId, position: 1, sourceKind: "incumbent", title: item.title, locationName: item.locationName ?? null,
        latitude: item.latitude, longitude: item.longitude, locationPrecision: "exact", providerServiceId: item.providerServiceId ?? null,
        addedByUserId: input.userId, addedByRole: "traveler",
      });
    }
    return { setId, fromCategory: prev?.categoryKey ?? null, toCategory, unchanged: false };
  });
  if (!result.unchanged) {
    // E14 (M8): the funnel row for an anchor change.
    void trackFunnelEvent({
      userId: input.userId,
      tripId: input.tripId,
      eventType: SLIP_ANCHOR_CHANGED_EVENT,
      funnelStage: SLIP_STAGE,
      eventData: { fromCategory: result.fromCategory, toCategory: result.toCategory, stopPosition: 0, derived: false },
    });
  }
  return { setId: result.setId, fromCategory: result.fromCategory, toCategory: result.toCategory };
}

/** Re-open a chosen comparison (§M9's "compare again"): owner or delegate, one atomic flip. */
export async function reopenOptionSet(input: { tripId: string; setId: string; userId: string }): Promise<PlanOptionSet> {
  if (!(await planRole(input.tripId, input.userId, "choose"))) throw notFound();
  const [row] = await db
    .update(planOptionSets)
    .set({ status: "open" })
    .where(and(eq(planOptionSets.id, input.setId), eq(planOptionSets.tripId, input.tripId), eq(planOptionSets.status, "chosen")))
    .returning();
  if (row) return row;
  const [exists] = await db.select({ id: planOptionSets.id }).from(planOptionSets).where(and(eq(planOptionSets.id, input.setId), eq(planOptionSets.tripId, input.tripId))).limit(1);
  if (!exists) throw notFound();
  throw new OptionSetError(409, "set_not_chosen", "Only a decided comparison can be opened again");
}

// ── Plan-fit (§M3) and the M9 entry ─────────────────────────────────────────────────────────

/** The plan's stops plan-fit scores against: every item that is not itself a place to stay. */
async function fitItems(tripId: string): Promise<FitItem[]> {
  const rows = await db
    .select({ id: itineraryItems.id, dayNumber: itineraryItems.dayNumber, lat: itineraryItems.latitude, lng: itineraryItems.longitude })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), ne(itineraryItems.itemType, "accommodation")));
  // A5 (ledger `2026-09-29-a5-draft-open-set`): an item with no coordinates of its own counts as
  // located when an unexpired `location` fact places it (a drafted stop the Places spine found). The
  // fact is never copied onto the item row, where it would outlive Google's 30-day cache.
  const factPoints = rows.some((r) => !toPoint(r.lat, r.lng)) ? await factPointsForTrip(tripId) : new Map();
  return rows.map((r) => {
    const p = toPoint(r.lat, r.lng) ?? factPoints.get(r.id) ?? null;
    return { dayNumber: r.dayNumber ?? null, lat: p?.lat ?? null, lng: p?.lng ?? null };
  });
}

/** ONE scorer for a plan: loads the market's centroids and matrix once (A2's reader). */
async function planScorer(tripId: string) {
  const [trip] = await db.select({ marketSlug: trips.marketSlug }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const market = trip?.marketSlug ?? null;
  const centroids = market ? await loadMarketCentroids(market) : [];
  const travel = await loadMatrixReader(market ?? "", async () => centroids);
  const items = await fitItems(tripId);
  const score = (lat: unknown, lng: unknown): PlanFit =>
    planFitFor({ option: toPoint(lat, lng), items, travel, centroids, walkThresholdMeters: WITHIN_WALK_METERS });
  const located = items.filter((i) => i.lat !== null && i.lng !== null).length;
  return { score, centroids, market, stops: { located, total: items.length } };
}

/**
 * A4: the neighbourhood an EXACT pin sits in, by the same snap A2's reader uses (`snapToCentroid`) —
 * the name comes from `city_neighborhoods`. A centroid-precision pin, or one outside every radius,
 * names no neighbourhood (§13: an area is never guessed for a place).
 */
async function neighborhoodNamer(market: string | null, centroids: readonly Centroid[]) {
  if (!market || !centroids.length) return () => null as string | null;
  const rows = await db
    .select({ slug: cityNeighborhoods.slug, name: cityNeighborhoods.name })
    .from(cityNeighborhoods)
    .where(inArray(cityNeighborhoods.slug, centroids.map((c) => c.slug)));
  const names = new Map(rows.map((r) => [r.slug, r.name]));
  return (lat: unknown, lng: unknown, precision: string | null): string | null => {
    if (precision !== "exact") return null;
    const p = toPoint(lat, lng);
    const c = p ? snapToCentroid(p, centroids) : null;
    return c ? names.get(c.slug) ?? null : null;
  };
}

export interface DatedPrice {
  /** The cached offer's TOTAL for the stay, as the provider stated it (`hotel_offer_cache.price`). */
  amount: string;
  currency: string;
  nights: number;
}

/**
 * A4: a `hotel_cache` place's price FOR THIS PLAN'S DATES — the cheapest unexpired cached offer whose
 * check-in and check-out are exactly the plan's own dates. Only when the dates were CHOSEN
 * (`trips.dates_confirmed_at`, LD 30): a price for a placeholder window is a price for dates nobody
 * picked. No match ⇒ absent, and the view says "price from the hotel" — never a typed or estimated
 * number, never "$0" (§13).
 */
async function datedPrices(tripId: string, hotelCacheIds: string[]): Promise<Map<string, DatedPrice>> {
  const out = new Map<string, DatedPrice>();
  if (!hotelCacheIds.length) return out;
  const [trip] = await db
    .select({ start: trips.startDate, end: trips.endDate, confirmed: trips.datesConfirmedAt })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip?.confirmed || !trip.start || !trip.end) return out;
  const start = String(trip.start).slice(0, 10);
  const end = String(trip.end).slice(0, 10);
  const nights = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  if (!(nights > 0)) return out;
  const rows = await db
    .select({ hotelCacheId: hotelOfferCache.hotelCacheId, price: hotelOfferCache.price, currency: hotelOfferCache.currency })
    .from(hotelOfferCache)
    .where(
      and(
        inArray(hotelOfferCache.hotelCacheId, hotelCacheIds),
        eq(hotelOfferCache.checkInDate, start),
        eq(hotelOfferCache.checkOutDate, end),
        sql`${hotelOfferCache.expiresAt} > now()`,
        sql`${hotelOfferCache.price} > 0`,
      ),
    )
    .orderBy(hotelOfferCache.price);
  for (const r of rows) {
    if (!out.has(r.hotelCacheId) && r.price != null) {
      out.set(r.hotelCacheId, { amount: String(r.price), currency: r.currency ?? "USD", nights });
    }
  }
  return out;
}

export interface OptionFitView {
  fit: PlanFit;
  /** A4 — every field below is the SERVER's (§E4); the view computes nothing. */
  fitRank: number | null;
  easiest: boolean;
  neighborhood: string | null;
  datedPrice: DatedPrice | null;
  /** On a CHOSEN set: how many fewer minutes a day this place would take than the choice, when it beats it (M9). */
  easierByMinutes: number | null;
}
export interface OptionSetWithFit extends OptionSetView {
  options: Array<PlanOption & OptionFitView>;
  /** §M9: on a CHOSEN set only — how many unchosen options beat the choice by the threshold. */
  easierCount: number | null;
  /** The plan's stops every fit on this set was scored against ("based on 9 of 12"). */
  stops: { located: number; total: number };
}

/** The plan's comparisons with each option's plan-fit derived server-side (§E4: the client computes nothing). */
export async function listOptionSetsWithFit(tripId: string): Promise<OptionSetWithFit[]> {
  const sets = await listOptionSets(tripId);
  if (!sets.length) return [];
  const { score, centroids, market, stops } = await planScorer(tripId);
  const nameOf = await neighborhoodNamer(market, centroids);
  const hotelIds = Array.from(new Set(sets.flatMap((s) => s.options.map((o) => o.hotelCacheId).filter((x): x is string => !!x))));
  const prices = await datedPrices(tripId, hotelIds);
  const threshold = planFitEasierThreshold();
  return sets.map((set) => {
    const fits = set.options.map((o) => score(o.latitude, o.longitude));
    const ranks = fitRanks(fits);
    const best = easiestIndex(fits);
    const chosenIdx = set.status === "chosen" && set.chosenOptionId ? set.options.findIndex((o) => o.id === set.chosenOptionId) : -1;
    const chosenFit = chosenIdx >= 0 ? fits[chosenIdx] : null;
    const options = set.options.map((o, i) => {
      const fit = fits[i];
      const beats = chosenFit && i !== chosenIdx && beatsChosen(fit, chosenFit, threshold);
      return {
        ...o,
        fit,
        fitRank: ranks[i],
        easiest: best === i,
        neighborhood: nameOf(o.latitude, o.longitude, o.locationPrecision),
        datedPrice: o.hotelCacheId ? prices.get(o.hotelCacheId) ?? null : null,
        easierByMinutes:
          beats && fit.scored && chosenFit!.scored ? chosenFit!.minutesPerDay - fit.minutesPerDay : null,
      };
    });
    const easierCount = chosenIdx >= 0 ? options.filter((o) => o.easierByMinutes != null).length : null;
    return { ...set, options, easierCount, stops };
  });
}

export const SLIP_PLAN_FIT_SHOWN_EVENT = "slip_plan_fit_shown";

/**
 * E4 (slip-funnel-events §3.4): the compare view rendered an option's plan-fit. The client says only
 * WHICH option it showed, where and at what width; the fit VALUE is recomputed here through the one
 * derivation and recorded only when it answers. A set or option that is not this plan's is ONE 404
 * (LD 40). Past the per-(user, trip) hourly cap the view is not recorded — silently, because a
 * dropped impression must never break the page (§15b).
 */
export async function recordPlanFitShown(input: {
  tripId: string;
  userId: string;
  setId: string;
  optionId: string;
  surface: "compare_view" | "anchor_question";
  viewport: "narrow" | "wide";
  viewId: string;
}): Promise<{ recorded: boolean }> {
  if (!(await planRole(input.tripId, input.userId, "read"))) throw notFound();
  const sets = await listOptionSetsWithFit(input.tripId);
  const set = sets.find((s) => s.id === input.setId);
  const option = set?.options.find((o) => o.id === input.optionId);
  if (!set || !option) throw notFound();
  const [{ n }] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM funnel_events
     WHERE user_id = ${input.userId} AND trip_id = ${input.tripId}
       AND event_type = ${SLIP_PLAN_FIT_SHOWN_EVENT} AND created_at > now() - interval '1 hour'
  `)).rows as Array<{ n: number }>;
  if (n >= slipEventsHourlyCap()) return { recorded: false };
  const fit = option.fit;
  await trackFunnelEvent({
    userId: input.userId,
    tripId: input.tripId,
    eventType: SLIP_PLAN_FIT_SHOWN_EVENT,
    funnelStage: SLIP_STAGE,
    eventData: {
      setId: set.id,
      optionId: option.id,
      fitBasis: fitBasisKey(fit),
      fitVersion: PLAN_FIT_VERSION,
      rank: option.fitRank,
      coverageOmitted: !fit.scored || fit.coverage === null,
      surface: input.surface,
      viewport: input.viewport,
      viewId: input.viewId,
      burdenMinutes: fit.scored ? fit.minutesPerDay : null,
      coverage: fit.scored ? fit.coverage : null,
    },
  });
  return { recorded: true };
}

/** `hotel_cache` rows for the plan's own city — never another city's (§M9 honesty). */
export async function hotelCacheForPlanCity(tripId: string, opts: { q?: string; limit: number; locatedOnly?: boolean }) {
  const [trip] = await db.select({ destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const city = (trip?.destination ?? "").split(",")[0].trim();
  if (!city) return { city: null as string | null, rows: [] as Array<typeof hotelCache.$inferSelect> };
  const conds = [or(ilike(hotelCache.city, city), ilike(hotelCache.cityCode, city))];
  if (opts.q) conds.push(ilike(hotelCache.name, `%${opts.q.replace(/[%_\\]/g, (c: string) => `\\${c}`)}%`));
  if (opts.locatedOnly) conds.push(sql`${hotelCache.latitude} IS NOT NULL AND ${hotelCache.longitude} IS NOT NULL`);
  const rows = await db.select().from(hotelCache).where(and(...conds)).orderBy(hotelCache.name).limit(opts.limit);
  return { city, rows };
}

/** Bounded work for M9's ranking: at most this many located rows are scored per request. */
const SUGGEST_CANDIDATE_LIMIT = 200;

/**
 * §M9 "Suggest places that fit these days". Allowed when the plan's lodging comparison is EMPTY (no
 * open lodging set, or one with no options) and the plan has ≥ PLAN_FIT_MIN_LOCATED located stops.
 * Ranks located `hotel_cache` rows for the plan's city by plan-fit ONLY (never price or commission,
 * §8) and adds the top three as `engine` options to an open set. Nothing is chosen.
 */
export async function suggestLodging(input: { tripId: string; userId: string }): Promise<OptionSetView> {
  const role = await planRole(input.tripId, input.userId, "write");
  if (!role) throw notFound();
  const [open] = await db
    .select()
    .from(planOptionSets)
    .where(and(eq(planOptionSets.tripId, input.tripId), eq(planOptionSets.categoryKey, "accommodation"), eq(planOptionSets.status, "open")))
    .limit(1);
  if (open) {
    const [has] = await db.select({ id: planOptions.id }).from(planOptions).where(eq(planOptions.setId, open.id)).limit(1);
    if (has) throw new OptionSetError(409, "set_not_empty", "You're already comparing places to stay");
  }
  const { score } = await planScorer(input.tripId);
  const probe = score(0, 0);
  if (!probe.scored && probe.reason === "too_few_located") {
    throw new OptionSetError(409, "too_few_located", "Add a few located stops to your days first", { located: probe.located });
  }
  const { rows } = await hotelCacheForPlanCity(input.tripId, { limit: SUGGEST_CANDIDATE_LIMIT, locatedOnly: true });
  const ranked = rows
    .map((h) => ({ h, fit: score(h.latitude, h.longitude) }))
    .filter((r) => r.fit.scored)
    .sort((a, b) => {
      const fa = a.fit as Extract<PlanFit, { scored: true }>;
      const fb = b.fit as Extract<PlanFit, { scored: true }>;
      return fa.minutesPerDay - fb.minutesPerDay || (fb.coverage ?? 0) - (fa.coverage ?? 0) || a.h.name.localeCompare(b.h.name);
    })
    .slice(0, OPTION_SET_CAP);
  if (!ranked.length) throw new OptionSetError(409, "no_candidates", "No places to suggest yet");
  const set = open ?? (await createOptionSet({ tripId: input.tripId, userId: input.userId, categoryKey: "accommodation", label: "Where you'll stay", anchor: true }));
  for (const r of ranked) {
    await addOption({ tripId: input.tripId, setId: set.id, userId: input.userId, source: { kind: "hotel_cache", hotelCacheId: r.h.id, engine: true } });
  }
  const [view] = (await listOptionSets(input.tripId)).filter((x) => x.id === set.id);
  return view;
}

// ── A5: what the free draft is built around (ledger `2026-09-29-a5-draft-open-set`) ─────────────

/**
 * The inputs `decideDraftBasis` (shared/draft-basis.ts) reads, from the plan's own rows:
 *   · lodgingAnchored — the plan is a Trip (§B2) whose anchor is lodging (M7). The occasion row is
 *     resolved by the SAME `resolveOccasionForPlan` the slip uses (events → recorded occasion → event
 *     type), so the draft and the slip can never disagree about what the plan is (§18 rule 1).
 *   · hasStay — the plan holds an accommodation item.
 *   · openSets — every OPEN set with its options and each option's server plan-fit rank.
 */
export async function draftBasisInputs(tripId: string): Promise<{ lodgingAnchored: boolean; hasStay: boolean; openSets: DraftOpenSet[] }> {
  const [trip] = await db.select({ userId: trips.userId, eventType: trips.eventType }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const [events, penSlug, occasions] = await Promise.all([
    storage.getUserExperiencesByTrip(tripId),
    readPlanPenOccasionSlug(trip?.userId, tripId),
    storage.getExperienceTypes(),
  ]);
  const row = resolveOccasionForPlan({ events: events as any, penSlug, eventType: trip?.eventType ?? null, occasions });
  const group = experienceGroupFor(row as any, trip?.eventType ?? null);
  const lodgingAnchored = group === "trips" && tripsAnchorFor(row as any).kind === "lodging";
  const [stay] = await db
    .select({ id: itineraryItems.id })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.itemType, "accommodation")))
    .limit(1);
  const sets = (await listOptionSetsWithFit(tripId)).filter((s) => s.status === "open");
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const openSets: DraftOpenSet[] = sets.map((s) => ({
    id: s.id,
    categoryKey: s.categoryKey,
    dayNumber: s.dayNumber,
    anchorRole: s.anchorRole,
    options: s.options.map((o) => ({
      title: o.title,
      neighborhood: o.neighborhood,
      latitude: num(o.latitude),
      longitude: num(o.longitude),
      fitRank: o.fitRank,
    })),
  }));
  return { lodgingAnchored, hasStay: !!stay, openSets };
}
