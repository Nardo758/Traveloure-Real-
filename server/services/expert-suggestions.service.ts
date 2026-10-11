/**
 * EXPERT SUGGESTIONS (step 7b, R323; surface spec §12 step 3; rulings R-n, R-bd). THE one owner of
 * `expert_suggestions` (migration 354).
 *
 * "Nothing is written to the plan without the traveler's accept." On a traveler's plan every write
 * an expert makes through the item and leg routes is stopped at the point of write and filed here
 * instead — its payload is the FINAL, already-validated write object the route would have applied,
 * so accepting replays the SAME storage write the route makes (§18 rule 1: no second validator, no
 * second shape). On the expert's own authoring build (they are the trip's AUTHOR, not an advisor)
 * writes stay direct; that branch never reaches this module.
 *
 * Lifecycle (app-enforced, no CHECK — `SUGGESTION_STATUSES` in `@shared/handoff`): `pending` →
 * `accepted` | `declined` by the plan's OWNER, or → `superseded` when the thing it changes is gone
 * by the time it is accepted (an honest "this no longer applies", never a silent skip — §13), or
 * when the handoff that produced it ends. Every transition is ONE atomic conditional on
 * `status = 'pending'` (§15): two taps, two tabs or a tap racing "accept all" make one write.
 */
import crypto from "crypto";
import { db } from "../db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { expertSuggestions, itineraryItems } from "@shared/schema";
import {
  SUGGESTION_KINDS,
  HANDOFF_LIVE_STATUSES,
  type SuggestionKind,
} from "@shared/handoff";
import { itineraryItemIsMoneyCommitted } from "@shared/itinerary-item-money";

export type SuggestionPayload =
  | { item: Record<string, unknown> } // add
  | { updates: Record<string, unknown>; title?: string | null } // edit
  | { title?: string | null } // remove
  | { dayNumber: number; itemIds: string[] } // move
  | { legId: string; patch?: Record<string, unknown>; remove?: boolean; label?: string | null }; // leg

export interface FileSuggestionInput {
  tripId: string;
  expertId: string;
  kind: SuggestionKind;
  itemId?: string | null;
  payload: SuggestionPayload;
}

/** The handoff this expert is working on this plan, if any — the suggestion's `request_id`. */
export async function liveHandoffIdFor(tripId: string, expertId: string): Promise<string | null> {
  const r = await db.execute(sql`
    SELECT id FROM expert_requests
    WHERE trip_id = ${tripId} AND assigned_expert_id = ${expertId}
      AND handoff_kind IS NOT NULL
      AND status IN (${sql.join(HANDOFF_LIVE_STATUSES.map((s) => sql`${s}`), sql`, `)})
    ORDER BY created_at DESC LIMIT 1
  `);
  return ((r.rows?.[0] as any)?.id as string | undefined) ?? null;
}

/**
 * File a suggestion. The caller has ALREADY authorized the expert (a §12 WRITE-status advisor on
 * this plan) and validated the write; this records it instead of applying it.
 */
export async function fileExpertSuggestion(input: FileSuggestionInput) {
  if (!(SUGGESTION_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`expert_suggestions: unknown kind ${input.kind}`);
  }
  const requestId = await liveHandoffIdFor(input.tripId, input.expertId);
  const [row] = await db
    .insert(expertSuggestions)
    .values({
      id: crypto.randomUUID(),
      tripId: input.tripId,
      itemId: input.itemId ?? null,
      requestId,
      expertId: input.expertId,
      kind: input.kind,
      payload: input.payload as any,
      status: "pending",
      createdAt: new Date(),
    })
    .returning();
  return row;
}

/** The plan's suggestions, newest first; `pendingOnly` narrows to the ones still waiting. */
export async function listExpertSuggestions(tripId: string, opts: { pendingOnly?: boolean } = {}) {
  const where = opts.pendingOnly
    ? and(eq(expertSuggestions.tripId, tripId), eq(expertSuggestions.status, "pending"))
    : eq(expertSuggestions.tripId, tripId);
  return db.select().from(expertSuggestions).where(where).orderBy(desc(expertSuggestions.createdAt)).limit(500);
}

/** Open suggestions an expert still has on a plan — the deliver gate's count (§12 step 5). */
export async function countOpenSuggestions(tripId: string, expertId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM expert_suggestions
    WHERE trip_id = ${tripId} AND expert_id = ${expertId} AND status = 'pending'
  `);
  return Number((r.rows?.[0] as any)?.n ?? 0);
}

/** A handoff that ends takes its open suggestions with it (never left pending forever — §13). */
export async function supersedeOpenSuggestions(tripId: string, expertId: string): Promise<number> {
  const r = await db.execute(sql`
    UPDATE expert_suggestions SET status = 'superseded', resolved_at = NOW()
    WHERE trip_id = ${tripId} AND expert_id = ${expertId} AND status = 'pending'
    RETURNING id
  `);
  return r.rows?.length ?? 0;
}

/** The storage seam the apply step writes through — the SAME calls the item and leg routes make. */
export interface SuggestionApplyPort {
  createItem(values: Record<string, unknown>): Promise<{ id: string } & Record<string, unknown>>;
  updateItem(itemId: string, updates: Record<string, unknown>): Promise<unknown | null>;
  deleteItem(itemId: string, actor: { actorType: "expert"; actorId: string }): Promise<unknown>;
  resortDay(tripId: string, dayNumber: number | null | undefined): Promise<unknown>;
  reorder(tripId: string, dayNumber: number, itemIds: string[]): Promise<unknown>;
  updateLeg(tripId: string, legId: string, patch: Record<string, unknown>): Promise<unknown | null>;
  deleteLeg(tripId: string, legId: string): Promise<boolean>;
}

async function defaultPort(): Promise<SuggestionApplyPort> {
  const { storage } = await import("../storage");
  const { resortDayByTime } = await import("./day-order.service");
  const { itineraryIntelligenceService } = await import("./itinerary-intelligence.service");
  const legs = await import("./trip-transport-legs.service");
  return {
    createItem: (v) => storage.createItineraryItem(v as any) as any,
    updateItem: (id, u) => storage.updateItineraryItem(id, u as any),
    deleteItem: (id, actor) => storage.deleteItineraryItem(id, actor as any),
    resortDay: (t, d) => resortDayByTime(t, d),
    reorder: (t, d, ids) => itineraryIntelligenceService.reorderItems(t, d, ids),
    updateLeg: (t, l, p) => legs.updateTripTransportLeg(t, l, p as any),
    deleteLeg: (t, l) => legs.deleteTripTransportLeg(t, l),
  };
}

export type ResolveOutcome =
  | { ok: true; status: "accepted" | "declined"; suggestion: any; result?: unknown }
  | { ok: false; status: number; code: "not_found" | "not_pending" | "superseded" | "item_booked"; message: string; suggestion?: any };

async function itemOnTrip(tripId: string, itemId: string) {
  const [row] = await db
    .select()
    .from(itineraryItems)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
    .limit(1);
  return row ?? null;
}

/**
 * Apply an ALREADY-CLAIMED suggestion. Returns `superseded` when the target is gone (the claim is
 * then moved to `superseded`, not left `accepted` over a write that never happened — §13).
 */
async function applySuggestion(row: any, port: SuggestionApplyPort): Promise<
  { ok: true; result: unknown } | { ok: false; code: "superseded" | "item_booked"; message: string }
> {
  const p = (row.payload ?? {}) as any;
  switch (row.kind as SuggestionKind) {
    case "add": {
      const item = await port.createItem({ ...(p.item ?? {}), tripId: row.tripId, origin: "expert", suggestedBy: "expert" });
      return { ok: true, result: item };
    }
    case "edit": {
      const existing = row.itemId ? await itemOnTrip(row.tripId, row.itemId) : null;
      if (!existing) return { ok: false, code: "superseded", message: "That stop is no longer on the plan." };
      const updates = (p.updates ?? {}) as Record<string, unknown>;
      const updated = await port.updateItem(row.itemId, updates);
      if (!updated) return { ok: false, code: "superseded", message: "That stop is no longer on the plan." };
      const timeTouched =
        (updates.startTime !== undefined && updates.startTime !== (existing as any).startTime) ||
        (updates.dayNumber !== undefined && updates.dayNumber !== (existing as any).dayNumber);
      if (timeTouched) await port.resortDay(row.tripId, (updated as any).dayNumber ?? (existing as any).dayNumber);
      return { ok: true, result: updated };
    }
    case "remove": {
      const existing = row.itemId ? await itemOnTrip(row.tripId, row.itemId) : null;
      if (!existing) return { ok: false, code: "superseded", message: "That stop is already gone." };
      // A booked row is money, and no role may delete it — accepting does not change that (§15).
      if (itineraryItemIsMoneyCommitted(existing as any)) {
        return { ok: false, code: "item_booked", message: "This item is booked. Cancel the booking first." };
      }
      await port.deleteItem(row.itemId, { actorType: "expert", actorId: row.expertId });
      return { ok: true, result: { removed: row.itemId } };
    }
    case "move": {
      const ids: string[] = Array.isArray(p.itemIds) ? p.itemIds.map(String) : [];
      const day = Number(p.dayNumber);
      const onDay = await db
        .select({ id: itineraryItems.id })
        .from(itineraryItems)
        .where(and(eq(itineraryItems.tripId, row.tripId), eq(itineraryItems.dayNumber, day)));
      const live = new Set(onDay.map((r) => r.id));
      // The order names the day as it was; if the day's stops changed since, the order no longer
      // describes it — superseded, never a partial reorder (§13).
      if (ids.length !== live.size || ids.some((id) => !live.has(id))) {
        return { ok: false, code: "superseded", message: "That day has changed since this order was suggested." };
      }
      const result = await port.reorder(row.tripId, day, ids);
      return { ok: true, result };
    }
    case "leg": {
      const legId = String(p.legId ?? "");
      if (p.remove) {
        const ok = legId ? await port.deleteLeg(row.tripId, legId) : false;
        if (!ok) return { ok: false, code: "superseded", message: "That leg is no longer on the plan." };
        return { ok: true, result: { removedLeg: legId } };
      }
      const patch = { ...(p.patch ?? {}) } as Record<string, unknown>;
      // R-bf: an expert's confirm stamps the check with the EXPERT's id — the person who checked it.
      if (patch.proposalStatus === "confirmed") patch.stampCheckedBy = row.expertId;
      const leg = legId ? await port.updateLeg(row.tripId, legId, patch) : null;
      if (!leg) return { ok: false, code: "superseded", message: "That leg is no longer on the plan." };
      return { ok: true, result: leg };
    }
    default:
      return { ok: false, code: "superseded", message: "Unknown suggestion." };
  }
}

/**
 * The traveler's answer. The caller has proven the actor is the plan's OWNER; the trip id scopes
 * the row, so a suggestion on another plan is one 404 (LD 40).
 */
export async function resolveExpertSuggestion(
  tripId: string,
  suggestionId: string,
  decision: "accept" | "decline",
  portOverride?: SuggestionApplyPort,
): Promise<ResolveOutcome> {
  const target = decision === "accept" ? "accepted" : "declined";
  const [claimed] = await db
    .update(expertSuggestions)
    .set({ status: target, resolvedAt: new Date() })
    .where(and(eq(expertSuggestions.id, suggestionId), eq(expertSuggestions.tripId, tripId), eq(expertSuggestions.status, "pending")))
    .returning();
  if (!claimed) {
    const [row] = await db
      .select()
      .from(expertSuggestions)
      .where(and(eq(expertSuggestions.id, suggestionId), eq(expertSuggestions.tripId, tripId)))
      .limit(1);
    if (!row) return { ok: false, status: 404, code: "not_found", message: "Suggestion not found" };
    return { ok: false, status: 409, code: "not_pending", message: `This suggestion was already ${row.status}.`, suggestion: row };
  }
  if (decision === "decline") return { ok: true, status: "declined", suggestion: claimed };

  const port = portOverride ?? (await defaultPort());
  let applied: Awaited<ReturnType<typeof applySuggestion>>;
  try {
    applied = await applySuggestion(claimed, port);
  } catch (err) {
    // The write failed: the claim goes back so the traveler can try again (no money moves here).
    await db
      .update(expertSuggestions)
      .set({ status: "pending", resolvedAt: null })
      .where(and(eq(expertSuggestions.id, suggestionId), eq(expertSuggestions.status, "accepted")));
    throw err;
  }
  if (!applied.ok) {
    if (applied.code === "superseded") {
      const [sup] = await db
        .update(expertSuggestions)
        .set({ status: "superseded" })
        .where(and(eq(expertSuggestions.id, suggestionId), eq(expertSuggestions.status, "accepted")))
        .returning();
      return { ok: false, status: 409, code: "superseded", message: applied.message, suggestion: sup ?? claimed };
    }
    // A booked row cannot be removed: the answer stays the traveler's to give again later.
    await db
      .update(expertSuggestions)
      .set({ status: "pending", resolvedAt: null })
      .where(and(eq(expertSuggestions.id, suggestionId), eq(expertSuggestions.status, "accepted")));
    return { ok: false, status: 409, code: applied.code, message: applied.message };
  }
  return { ok: true, status: "accepted", suggestion: claimed, result: applied.result };
}

/** "Accept all" (§12 step 3, full service): every pending suggestion on the plan, oldest first. */
export async function acceptAllExpertSuggestions(tripId: string, portOverride?: SuggestionApplyPort) {
  const pending = await db
    .select({ id: expertSuggestions.id })
    .from(expertSuggestions)
    .where(and(eq(expertSuggestions.tripId, tripId), eq(expertSuggestions.status, "pending")))
    .orderBy(asc(expertSuggestions.createdAt));
  const accepted: string[] = [];
  const skipped: Array<{ id: string; code: string; message: string }> = [];
  for (const { id } of pending) {
    const r = await resolveExpertSuggestion(tripId, id, "accept", portOverride);
    if (r.ok) accepted.push(id);
    else skipped.push({ id, code: r.code, message: r.message });
  }
  return { accepted, skipped };
}

// The one-line summary moved to `@shared/handoff` (slip conformance, Handoff board) so the client's
// board tests read the SAME function the route serves (§18 rule 1). Re-exported for the route.
export { suggestionSummary } from "@shared/handoff";

