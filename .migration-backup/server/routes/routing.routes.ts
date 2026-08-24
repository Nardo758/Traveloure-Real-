/**
 * PER-ITEM ROUTING TRANSITIONS (W1) — Trip-Canon Lane 1 (Reconcile), Phase 1b.
 *
 * Governing docs: docs/briefs/RECONCILE_PHASE1_SCOPE.md (§1 W1, §3 Phase 1b, §4),
 * docs/briefs/ROUTING_STATE_CONTRACT.md (§1 state machine, §2 contract matrix, §4 enforcement).
 *
 * ONE endpoint: POST /api/trips/:tripId/items/:itemId/route  body { to: <RoutingStatus> }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATE MACHINE THIS ENDPOINT MAY DRIVE (contract §1, as drawn)
 * ─────────────────────────────────────────────────────────────────────────────
 *     in_planning ──► with_expert ──► in_planning         (expert return)
 *          │
 *          └────────► ready_for_checkout ──► purchased
 *                             │                  │
 *                             ▼                  ▼
 *                       in_planning        in_planning    (refund/cancel reversal)
 *
 * This endpoint owns the FOUR traveler/expert edges only:
 *     in_planning        → with_expert
 *     with_expert        → in_planning        (un-route, or the expert-return edge)
 *     in_planning        → ready_for_checkout
 *     ready_for_checkout → in_planning
 *
 * It does NOT own, and REFUSES:
 *   • `→ purchased` — checkout is its SOLE writer (contract §2), atomic with the booking
 *     write. Accepting it here would let a client mark an unpaid item purchased. 403.
 *   • `purchased → in_planning` — the refund/cancellation path is its SOLE writer, atomic
 *     with the refund. A traveler must not be able to un-purchase a paid item by hand. 409.
 *   • `with_expert → ready_for_checkout` — NOT AN EDGE ON THE MACHINE. The item must return
 *     to `in_planning` first. Skipping the return would let purchase intent be set on an item
 *     the expert still holds, which is precisely the "expert receives a purchase list"
 *     pollution the audit found live. 409.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROLE ENFORCEMENT — IN CODE, NOT CONVENTION (contract §4)
 * ─────────────────────────────────────────────────────────────────────────────
 *   → ready_for_checkout : TRIP OWNER ONLY. Purchase intent is traveler-only; the contract
 *                          matrix marks the expert workspace **NEVER** on this state.
 *   → with_expert        : trip owner only (the traveler sends work to the expert).
 *   → in_planning        : trip owner (un-route) OR — only when the item currently sits in
 *                          `with_expert` — the assigned expert (the expert-return edge, the
 *                          single cell where the expert workspace has WRITES).
 *
 * Owner resolution deliberately does NOT go through `getTripRole` (scope §4 forbids routing
 * new mutations through it; L10 records that it never reads `trips`, so a trip's own owner
 * gets no role from it). We resolve the owner the way `authorizeTripLogistics` does — the
 * canonical `verifyTripOwnership` on `trips.userId` — PLUS an explicit `trip_collaborators`
 * role='owner' row, which is the other half of the same principal (createTrip writes both;
 * the three raw-SQL minters write only the `trips` row). Either one is the owner.
 *
 * The expert branch uses the canonical `isTripAdvisor` predicate (server/utils/trip-advisor.ts):
 * pending|accepted|assigned PASS, rejected DENIES, unknown DENIES. Never a bespoke query.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONCURRENCY
 * ─────────────────────────────────────────────────────────────────────────────
 * The flip is an ATOMIC CONDITIONAL UPDATE — `WHERE id = :item AND trip_id = :trip AND
 * routing_status = :expectedFrom`, with `expectedFrom` taken from the read this request
 * validated against. 0 rows updated ⇒ someone else moved the item between our read and our
 * write ⇒ 409, never a blind overwrite. The state transition IS the concurrency guard (§15
 * discipline applied to a non-money state machine).
 *
 * After a successful flip the projection is reconciled (`syncItemProjection`). Projection
 * failure never fails the transition: the routing status is the source of truth, the cart is
 * the derived view, and the reconciler is re-runnable.
 */
import { Router } from "express";
import { getUserId } from "../utils/auth";
import { z } from "zod";
import { and, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, notifications, tripCollaborators, trips, ROUTING_STATUSES, type RoutingStatus } from "@shared/schema";
import { isAuthenticated } from "../replit_integrations/auth";
import { storage } from "../storage";
import { verifyTripOwnership } from "../utils/trip-ownership";
import { isTripAdvisor } from "../utils/trip-advisor";
import { syncItemProjection } from "../services/cart-projection.service";
import { logItemTransition } from "../services/item-transition-log.service";
import { logger } from "../infrastructure/logger";

const router = Router();

function sessionUserId(req: any): string | undefined {
  return getUserId(req)!;
}

/**
 * States this endpoint may set. `purchased` is deliberately absent from the accepted set —
 * it is rejected with an explanation rather than silently 400'd as "invalid", because it IS
 * a valid routing status, just not one this caller owns.
 */
const TRANSITIONABLE = ["in_planning", "with_expert", "ready_for_checkout"] as const;

const routeBodySchema = z.object({
  // Validated against the canonical ROUTING_STATUSES (shared/schema.ts) so the endpoint and
  // the column can never drift; the owner check on `purchased` happens after parsing.
  to: z.enum(ROUTING_STATUSES as unknown as [RoutingStatus, ...RoutingStatus[]]),
});

/** The legal `from` states for each `to` this endpoint may drive (contract §1 as drawn). */
const LEGAL_FROM: Record<(typeof TRANSITIONABLE)[number], readonly RoutingStatus[]> = {
  with_expert: ["in_planning"],
  ready_for_checkout: ["in_planning"],
  in_planning: ["with_expert", "ready_for_checkout"],
};

/** True when `userId` is the trip's owner — trips.userId OR a trip_collaborators owner row. */
async function isTripOwner(tripId: string, userId: string): Promise<boolean> {
  if (await verifyTripOwnership(tripId, userId)) return true;
  const [row] = await db
    .select({ role: tripCollaborators.role })
    .from(tripCollaborators)
    .where(
      and(
        eq(tripCollaborators.tripId, tripId),
        eq(tripCollaborators.userId, userId),
        eq(tripCollaborators.role, "owner"),
      ),
    )
    .limit(1);
  return !!row;
}

router.post("/api/trips/:tripId/items/:itemId/route", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { tripId, itemId } = req.params;

    const parsed = routeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: `"to" must be one of: ${TRANSITIONABLE.join(", ")}`,
        validRoutingStatuses: ROUTING_STATUSES,
      });
    }
    const to = parsed.data.to;

    // `purchased` is checkout-only (contract §2). Not a 400 — the value is valid, the CALLER
    // is not authorized to write it, and the reversal off it is refund-only.
    if (to === "purchased") {
      return res.status(403).json({
        message:
          "routing_status 'purchased' is written only by the checkout confirm path, atomically with the booking (ROUTING_STATE_CONTRACT §2); the reversal off it is refund-only.",
      });
    }

    // Read the item scoped to the trip in the URL — an item id from another trip must not be
    // reachable by pairing it with a trip the caller happens to own.
    const [item] = await db
      .select({
        id: itineraryItems.id,
        tripId: itineraryItems.tripId,
        routingStatus: itineraryItems.routingStatus,
      })
      .from(itineraryItems)
      .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
      .limit(1);

    if (!item) return res.status(404).json({ message: "Itinerary item not found on this trip" });

    const from = item.routingStatus as RoutingStatus;

    // ── Role gate (contract §4, enforced in code) ──────────────────────────────────────
    const owner = await isTripOwner(tripId, userId);
    let actor: "owner" | "expert";
    if (owner) {
      actor = "owner";
    } else if (to === "in_planning" && from === "with_expert" && (await isTripAdvisor(tripId, userId))) {
      // The ONE cell where the expert workspace has WRITES: returning a refined item to the
      // traveler's plan. An expert may not un-route a `ready_for_checkout` item, and may not
      // send an item to themselves.
      actor = "expert";
    } else {
      return res.status(403).json({
        message:
          to === "ready_for_checkout"
            ? "Only the traveler who owns this trip can mark an item for checkout (purchase intent is traveler-only)."
            : "Not authorized to route items on this trip",
      });
    }

    // ── Idempotent no-op: already in the requested state. Not a transition, so no edge is
    // traversed and no 409 is warranted; a double-clicked button must not error. Still
    // reconciles the projection so a divergent cart self-heals.
    if (from === to) {
      const projection = await safeSync(itemId);
      return res.json({ itemId, tripId, from, to, changed: false, actor, projection });
    }

    // ── Legal-edge validation (contract §1 state machine, as drawn) ────────────────────
    const legalFrom = LEGAL_FROM[to];
    if (!legalFrom.includes(from)) {
      return res.status(409).json({
        message: illegalEdgeMessage(from, to),
        from,
        to,
        legalFrom,
      });
    }

    // ── Atomic conditional flip + diary row, ONE transaction (Lane S, ruling 18). The
    // `expectedFrom` CAS is unchanged: if the row moved underneath us the UPDATE matches 0 rows
    // and we 409 rather than clobber (and write no diary row — no edge was traversed). On a
    // traveler/expert edge a diary failure MAY fail the request (500, transition rolled back) —
    // the money-path swallow contract applies only to checkout/refund, not here.
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(itineraryItems)
        .set({ routingStatus: to, updatedAt: new Date() })
        .where(
          and(
            eq(itineraryItems.id, itemId),
            eq(itineraryItems.tripId, tripId),
            eq(itineraryItems.routingStatus, from),
          ),
        )
        .returning({ id: itineraryItems.id, routingStatus: itineraryItems.routingStatus });

      if (rows.length > 0) {
        await logItemTransition(tx, {
          tripId,
          itemId,
          eventType: "status_transition",
          fromStatus: from,
          toStatus: to,
          actorType: actor === "owner" ? "traveler" : "expert",
          actorId: userId,
        });
      }
      return rows;
    });

    if (updated.length === 0) {
      return res.status(409).json({
        message: "Item routing state changed concurrently; re-read and retry.",
        expectedFrom: from,
      });
    }

    // ── W2: reconcile the cart projection with the new state. Never fails the transition.
    const projection = await safeSync(itemId);

    return res.json({ itemId, tripId, from, to, changed: true, actor, projection });
  } catch (err) {
    logger.error({ err }, "routing transition failed");
    return res.status(500).json({ message: "Failed to route item" });
  }
});

function illegalEdgeMessage(from: RoutingStatus, to: RoutingStatus): string {
  if (from === "purchased") {
    return "A purchased item is returned to planning only by the refund/cancellation path, atomically with the refund (ROUTING_STATE_CONTRACT §1).";
  }
  if (from === "with_expert" && to === "ready_for_checkout") {
    return "with_expert → ready_for_checkout is not an edge on the state machine: return the item to in_planning first (ROUTING_STATE_CONTRACT §1).";
  }
  return `Illegal transition ${from} → ${to} (ROUTING_STATE_CONTRACT §1).`;
}

/** Reconcile the projection without ever failing the (already-committed) transition. */
async function safeSync(itemId: string) {
  try {
    return await syncItemProjection(itemId);
  } catch (err) {
    logger.error({ err, itemId }, "cart projection sync failed after routing transition (re-runnable)");
    return { action: "error" as const };
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TRIP CARD DELIVERY — FINALIZE / REOPEN (Console Realign ruling R-F)
 * ─────────────────────────────────────────────────────────────────────────────
 * Governing doc: docs/briefs/CONSOLE_REALIGN_BRIEF.md, R-F.
 *
 * `POST /api/trips/:tripId/finalize` — owner-gated (the canonical `verifyTripOwnership`, per
 * R-F, not the extended owner-or-collaborator check above — Finalize is a traveler-only handover,
 * not a shared routing edge). Atomic conditional flip `finalized_at: NULL -> now()`; already-set
 * is NOT an error — idempotent 200 `{ alreadyFinalized: true }`. Writes a trip-scoped
 * (`itemId: null`) diary row `plan_finalized` in the SAME transaction as the flip (Lane S ruling
 * 18/16 pattern — mirrors `variant_applied` in plancard.routes.ts). Fires a best-effort
 * `trip_card_ready` notification (never fails the already-committed finalize). Reports
 * `stagedCount` — items in `ready_for_checkout` — for the client to WARN on, never to block: this
 * is a rendering flip, not a money event (R-F).
 *
 * `POST /api/trips/:tripId/reopen` — same owner gate; atomic conditional flip `finalized_at: SET
 * -> NULL`; already-open is idempotent 200. Diary row `plan_reopened`. No notification (R-F).
 *
 * Both use the SAME diary vocabulary/module as the per-item routing edges above (one append-only
 * log), but neither touches `itinerary_items.routing_status` — this is trip-level state only.
 */

router.post("/api/trips/:tripId/finalize", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { tripId } = req.params;

    const trip = await storage.getTrip(tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (!(await verifyTripOwnership(tripId, userId))) {
      return res.status(403).json({ message: "Only the trip owner can finalize this plan" });
    }

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(trips)
        .set({ finalizedAt: new Date() })
        .where(and(eq(trips.id, tripId), isNull(trips.finalizedAt)))
        .returning({ id: trips.id, finalizedAt: trips.finalizedAt });

      if (rows.length > 0) {
        await logItemTransition(tx, {
          tripId,
          itemId: null,
          eventType: "plan_finalized",
          actorType: "traveler",
          actorId: userId,
        });
      }
      return rows;
    });

    if (updated.length === 0) {
      // Already finalized — double-click / retry. Idempotent, not an error (R-F).
      return res.json({
        alreadyFinalized: true,
        finalizedAt: trip.finalizedAt ? String(trip.finalizedAt as any) : null,
      });
    }

    // Best-effort notification — the finalize above already committed; a notify failure must
    // never turn a successful finalize into a 500. Same traveler-facing deep-link shape the rest
    // of the codebase uses (booking-actions.ts, trips.routes.ts): `workspacePath` starting
    // "/trip/" is what makes `resolveNotificationLink` (client/src/lib/notification-icons.tsx)
    // resolve to `/plans/:tripId` instead of the expert-workspace fallback.
    //
    // Dedup against the T-48h auto-handover scheduler (trip-card-handover-scheduler.service.ts):
    // if that scheduler already nudged this trip, a later manual Finalize must not send a SECOND
    // "Your Trip Card is ready" notification. Mirrors the scheduler's own NOT EXISTS predicate
    // (same (userId, type, data->>'tripId') triple) exactly.
    if (trip.userId) {
      try {
        const [existing] = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, trip.userId),
              eq(notifications.type, "trip_card_ready"),
              sql`${notifications.data} ->> 'tripId' = ${tripId}`,
            ),
          )
          .limit(1);

        if (!existing) {
          await storage.createNotification({
            userId: trip.userId,
            type: "trip_card_ready",
            title: "Your Trip Card is ready",
            message: `Your Trip Card for ${trip.destination || "your trip"} is ready to view.`,
            relatedId: tripId,
            relatedType: "trip",
            data: { tripId, workspacePath: `/trip/${tripId}?tab=itinerary` },
          } as any);
        }
      } catch (err) {
        logger.error({ err, tripId }, "trip_card_ready notification failed after finalize (non-fatal)");
      }
    }

    // Staged-items warning surface (R-F: WARN, never block). Read after the commit — this trip's
    // own items, no cross-trip leak.
    const [stagedRow] = await db
      .select({ n: count() })
      .from(itineraryItems)
      .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.routingStatus, "ready_for_checkout")));

    return res.json({
      alreadyFinalized: false,
      finalizedAt: String(updated[0].finalizedAt),
      stagedCount: Number(stagedRow?.n ?? 0),
    });
  } catch (err) {
    logger.error({ err }, "trip finalize failed");
    return res.status(500).json({ message: "Failed to finalize plan" });
  }
});

router.post("/api/trips/:tripId/reopen", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { tripId } = req.params;

    const trip = await storage.getTrip(tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (!(await verifyTripOwnership(tripId, userId))) {
      return res.status(403).json({ message: "Only the trip owner can reopen this plan" });
    }

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(trips)
        .set({ finalizedAt: null })
        .where(and(eq(trips.id, tripId), isNotNull(trips.finalizedAt)))
        .returning({ id: trips.id });

      if (rows.length > 0) {
        await logItemTransition(tx, {
          tripId,
          itemId: null,
          eventType: "plan_reopened",
          actorType: "traveler",
          actorId: userId,
        });
      }
      return rows;
    });

    // Idempotent either way — already-open (never finalized, or already reopened) is not an error.
    return res.json({ alreadyOpen: updated.length === 0, finalizedAt: null });
  } catch (err) {
    logger.error({ err }, "trip reopen failed");
    return res.status(500).json({ message: "Failed to reopen plan" });
  }
});

export default router;
