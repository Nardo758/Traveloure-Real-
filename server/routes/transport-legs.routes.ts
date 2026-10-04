/**
 * Trip-scoped transport-leg routes — L4a (CLAUDE.md §18 "Transport legs for expert-built trips",
 * ratified "BOTH"; spec docs/briefs/L4-transport-legs.md, migration 154).
 *
 *   POST   /api/trips/:tripId/transport-legs/generate    engine proposes (born 'proposed')
 *   PATCH  /api/trips/:tripId/transport-legs/:legId      expert confirms / edits
 *   DELETE /api/trips/:tripId/transport-legs/:legId      expert rejects a leg
 *   GET    /api/trips/:tripId/transport-legs/review      the leg-review stepper's read (work plan L1-10)
 *
 * The Workstation READ (`GET /api/trips/:tripId/transport-legs?includeProposed=1`) is deliberately
 * NOT registered here: that exact path is ALREADY served by a live handler in `trips.routes.ts`
 * (the selected-variant leg list consumed by `client/src/pages/itinerary.tsx`). Registering a
 * second copy in this earlier-mounted router would silently shadow it — precisely the §9
 * route-shadow class. The live handler was EXTENDED in place instead (one home per path); see
 * `trips.routes.ts` "GET /api/trips/:tripId/transport-legs".
 *
 * ── AUTH MODEL ────────────────────────────────────────────────────────────────────────────────
 * `authorizeTripLogistics` — owner ‖ trip-assigned expert ‖ trip author ‖ (audit-logged) admin.
 * This is the canonical shared implementation of the inline trip-mutation model: it is documented
 * as matching `booking-actions.ts` `workspace-constraints`, which is itself the reference copy of
 * the inline `routes.ts` handlers' `verifyTripOwnership` → `isExpertAssignedToTrip` →
 * `isTripAuthor` chain (see routes.ts POST /api/trips/:tripId/itinerary-items). Reusing it rather
 * than re-writing the chain keeps a fourth divergent copy from existing.
 *
 * ── INVARIANTS ────────────────────────────────────────────────────────────────────────────────
 * §14 — no amount, earning, payout, refund or booking record is read or written anywhere here;
 *        the acting user comes from the session only, and every id is validated against the trip.
 * Mass-assign — PATCH takes a strict zod allow-list (6 fields), never a raw `req.body` spread.
 * L1-1 (work plan; R-ay/R-az/R-bf) — `authorTip` and `pickupProviderServiceId` are written only by the
 *        trip AUTHOR or a write-status advisor (`isExpertSideLegWriter`); a confirm by one of them
 *        stamps `checked_by`/`checked_at` server-side. `checked_*` is never body-settable.
 * D1a-analog — 'proposed' is the only state generate can write; only the expert's PATCH confirms.
 * §13 — item pairs without real coordinates are reported as `skipped`, never routed with invented
 *        geometry; pickup fields carry only what the expert typed.
 */

import { Router } from "express";
import { getUserId } from "../utils/auth";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";
import { isTripAuthor } from "../utils/trip-authorship";
import { isTripAdvisorWithWriteAccess } from "../utils/trip-advisor";
import { db } from "../db";
import { providerServices } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import {
  AUTHOR_TIP_MAX_CHARS,
  LEG_PROPOSAL_STATUSES,
  buildLegReview,
  getTripTransportLegs,
  legPickupRefusal,
  SELECTABLE_TRANSPORT_MODES,
  deleteTripTransportLeg,
  generateTripTransportLegs,
  getTripTransportLeg,
  updateTripTransportLeg,
} from "../services/trip-transport-legs.service";

const router = Router();

function sessionUserId(req: any): string | undefined {
  return getUserId(req)!;
}

/**
 * Fire-and-forget change-log entry, mirroring `trips.routes.ts` `logItineraryChange` and
 * `plancard.routes.ts` `logChange` — same underlying write (`storage.createItineraryChange`:
 * tripId, who, action, changeType, role, activityId, metadata). Deliberately NOT awaited into the
 * response: a logging failure must never fail the mutation it is describing (ITEM 2 requirement;
 * the `.catch` here is the whole point).
 *
 * `who` is the session user id (this router has no display-name lookup today, unlike the
 * plancard/trips routers which read `req.user.claims.name`).
 *
 * `role`: `authorizeTripLogistics` returns `null` on success for EVERY passing branch (owner ‖
 * assigned-expert ‖ author ‖ audit-logged admin) — it does not report which one authorized the
 * caller. Claiming e.g. `'expert'` here would be a guess the util cannot back (§13 applies to logs,
 * not just to itinerary content). `'editor'` is the honest neutral label for "a party
 * `authorizeTripLogistics` approved to mutate this trip's logistics", used until that util is
 * extended to expose its branch.
 */
function logLegChange(
  tripId: string,
  who: string,
  action: string,
  changeType: string,
  activityId?: string,
  metadata?: Record<string, unknown>,
): void {
  storage
    .createItineraryChange({
      tripId,
      activityId: activityId ?? null,
      who,
      action,
      changeType,
      role: "editor",
      metadata: metadata ?? {},
    })
    .catch((err) => {
      console.error("[TransportLegs] change-log write failed (non-fatal):", err);
    });
}

/**
 * POST /api/trips/:tripId/transport-legs/generate
 * Runs the existing leg engine over the trip's itinerary items and writes trip-scoped legs born
 * `'proposed'`. Idempotent: replaces the trip's `proposed` rows, never touches `confirmed` ones.
 */
router.post("/api/trips/:tripId/transport-legs/generate", isAuthenticated, async (req, res) => {
  try {
    const { tripId } = req.params;
    const denied = await authorizeTripLogistics(
      tripId,
      sessionUserId(req),
      "POST /api/trips/:tripId/transport-legs/generate",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const result = await generateTripTransportLegs(tripId);

    logLegChange(
      tripId,
      sessionUserId(req) || "unknown",
      `Generated ${result.created} proposed transport leg(s)` +
        (result.replacedProposed > 0 ? `, replaced ${result.replacedProposed} stale proposal(s)` : "") +
        (result.keptConfirmed > 0 ? `, kept ${result.keptConfirmed} confirmed leg(s) untouched` : "") +
        (result.skipped.length > 0 ? `, skipped ${result.skipped.length} pair(s) (no coordinates)` : ""),
      "add",
      undefined,
      {
        created: result.created,
        replacedProposed: result.replacedProposed,
        keptConfirmed: result.keptConfirmed,
        skipped: result.skipped.length,
      },
    );

    res.json({
      tripId,
      // Everything written by this call is 'proposed' — stated in the response so no consumer has
      // to infer it.
      proposalStatus: "proposed",
      ...result,
    });
  } catch (err: any) {
    if (String(err?.message || "").includes("not found")) {
      return res.status(404).json({ message: "Trip not found" });
    }
    console.error("[TransportLegs] generate error:", err);
    res.status(500).json({ message: "Failed to generate transport legs" });
  }
});

/**
 * GET /api/trips/:tripId/transport-legs/review — work plan L1-10 (enhancement 2). The Workstation's
 * leg-review stepper: every trip-scoped leg, proposed included, in review order with its candidate
 * modes, coordinates and the first unpicked index (`buildLegReview`). A read — the same gate and the
 * same 404 as the Workstation's `GET …/transport-legs?includeProposed=1` (no trip oracle). No path
 * shadows it: `/transport-legs/:legId` has only PATCH and DELETE here, and no GET is registered for it.
 */
router.get("/api/trips/:tripId/transport-legs/review", isAuthenticated, async (req, res) => {
  try {
    const { tripId } = req.params;
    const denied = await authorizeTripLogistics(tripId, sessionUserId(req), "GET /api/trips/:tripId/transport-legs/review");
    if (denied) return res.status(denied.status === 401 ? 401 : 404).json({ message: denied.status === 401 ? "Not authenticated" : "Trip not found" });
    const legs = await getTripTransportLegs(tripId, { includeProposed: true });
    res.json({ tripId, ...buildLegReview(legs) });
  } catch (err) {
    console.error("[TransportLegs] review error:", err);
    res.status(500).json({ message: "Failed to load the leg review" });
  }
});

/**
 * PATCH /api/trips/:tripId/transport-legs/:legId
 * The expert's confirm/edit. Allow-list ONLY — no other column is writable.
 */
const patchLegSchema = z
  .object({
    // Validated against the engine's OWN mode vocabulary (derived from the destination profiles +
    // the §18 chauffeured set), so an arbitrary string can never land in the mode column.
    userSelectedMode: z.enum(SELECTABLE_TRANSPORT_MODES as [string, ...string[]]).optional(),
    // Expert-stated arrangement facts (§13). Display strings; null clears.
    pickupPoint: z.string().max(500).nullable().optional(),
    pickupTime: z.string().max(120).nullable().optional(),
    // 'proposed' | 'confirmed' — the traveler-visibility gate. No other value exists (DB CHECK).
    proposalStatus: z.enum(LEG_PROPOSAL_STATUSES).optional(),
    // R-ay: plain text, null clears. Over the cap is refused, never trimmed.
    authorTip: z.string().max(AUTHOR_TIP_MAX_CHARS).nullable().optional(),
    // R-az: a provider_services id, null clears. Validated by `legPickupRefusal` below.
    pickupProviderServiceId: z.string().min(1).max(64).nullable().optional(),
  })
  .strict();

/**
 * The expert side of a leg (R-ay, R-bf): the trip's AUTHOR, or an advisor in a §12 WRITE status
 * (`accepted`/`assigned`, never `pending`). The owner, a managing EA and an admin pass
 * `authorizeTripLogistics` but are not the expert side: they cannot write a tip or a host pickup,
 * and their confirm stamps no check.
 */
async function isExpertSideLegWriter(tripId: string, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  return (await isTripAuthor(tripId, userId)) || (await isTripAdvisorWithWriteAccess(tripId, userId));
}

router.patch("/api/trips/:tripId/transport-legs/:legId", isAuthenticated, async (req, res) => {
  try {
    const { tripId, legId } = req.params;
    const denied = await authorizeTripLogistics(
      tripId,
      sessionUserId(req),
      "PATCH /api/trips/:tripId/transport-legs/:legId",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const parsed = patchLegSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
    }
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ message: "No editable fields supplied" });
    }

    // IDOR: the leg must be THIS trip's trip-scoped leg (a variant leg or another trip's leg is a
    // 404, not a silent cross-trip write).
    const existing = await getTripTransportLeg(tripId, legId);
    if (!existing) return res.status(404).json({ message: "Transport leg not found for this trip" });

    const expertSide = await isExpertSideLegWriter(tripId, sessionUserId(req));
    if ((parsed.data.authorTip !== undefined || parsed.data.pickupProviderServiceId !== undefined) && !expertSide) {
      return res.status(403).json({ message: "Only the trip's author or its expert may set a tip or a host pickup" });
    }
    if (parsed.data.pickupProviderServiceId) {
      const [listing] = await db
        .select({ transportProvision: providerServices.transportProvision })
        .from(providerServices)
        .where(eq(providerServices.id, parsed.data.pickupProviderServiceId))
        .limit(1);
      // No pickup-confirmation column exists yet (work plan L1-7), so none is passed — see legPickupRefusal.
      const refusal = legPickupRefusal(listing ? { transportProvision: listing.transportProvision, pickupConfirmedAt: undefined } : null);
      if (refusal) return res.status(400).json({ message: "That listing cannot be this leg's host pickup", reason: refusal });
    }

    const leg = await updateTripTransportLeg(tripId, legId, {
      ...parsed.data,
      ...(expertSide && parsed.data.proposalStatus === "confirmed" ? { stampCheckedBy: sessionUserId(req) } : {}),
    });
    if (!leg) return res.status(404).json({ message: "Transport leg not found for this trip" });

    // State the actual change(s) in the action text (§13 — never a generic "updated leg").
    const changed: string[] = [];
    if (parsed.data.userSelectedMode !== undefined) {
      changed.push(`mode → ${parsed.data.userSelectedMode}`);
    }
    if (parsed.data.pickupPoint !== undefined) {
      changed.push(parsed.data.pickupPoint ? `pickup point set` : `pickup point cleared`);
    }
    if (parsed.data.pickupTime !== undefined) {
      changed.push(parsed.data.pickupTime ? `pickup time set` : `pickup time cleared`);
    }
    if (parsed.data.proposalStatus !== undefined) {
      changed.push(`status → ${parsed.data.proposalStatus}`);
    }
    if (parsed.data.authorTip !== undefined) {
      changed.push(parsed.data.authorTip ? `tip set` : `tip cleared`);
    }
    if (parsed.data.pickupProviderServiceId !== undefined) {
      changed.push(parsed.data.pickupProviderServiceId ? `host pickup set` : `host pickup cleared`);
    }
    logLegChange(
      tripId,
      sessionUserId(req) || "unknown",
      `Updated transport leg (${existing.fromName} → ${existing.toName}): ${changed.join(", ") || "no-op"}`,
      "edit",
      undefined,
      { legId, patch: parsed.data },
    );

    res.json({ leg });
  } catch (err) {
    console.error("[TransportLegs] patch error:", err);
    res.status(500).json({ message: "Failed to update transport leg" });
  }
});

/** DELETE /api/trips/:tripId/transport-legs/:legId — the expert rejecting a leg. */
router.delete("/api/trips/:tripId/transport-legs/:legId", isAuthenticated, async (req, res) => {
  try {
    const { tripId, legId } = req.params;
    const denied = await authorizeTripLogistics(
      tripId,
      sessionUserId(req),
      "DELETE /api/trips/:tripId/transport-legs/:legId",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const existing = await getTripTransportLeg(tripId, legId);
    if (!existing) return res.status(404).json({ message: "Transport leg not found for this trip" });

    const ok = await deleteTripTransportLeg(tripId, legId);
    if (!ok) return res.status(404).json({ message: "Transport leg not found for this trip" });

    logLegChange(
      tripId,
      sessionUserId(req) || "unknown",
      `Removed transport leg (${existing.fromName} → ${existing.toName})`,
      "remove",
      undefined,
      { legId },
    );

    res.json({ success: true, legId });
  } catch (err) {
    console.error("[TransportLegs] delete error:", err);
    res.status(500).json({ message: "Failed to delete transport leg" });
  }
});

export default router;
