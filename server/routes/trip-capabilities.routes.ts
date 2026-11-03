/**
 * CAP-1 (ledger `2026-11-03-cap1-trip-capabilities`): GET /api/trips/:tripId/capabilities — one server-derived read of
 * what the viewer can do on this plan. It ENFORCES nothing and grants nothing: every input below is read from the same
 * place the enforcing route reads it, and `deriveCapabilities` (pure) restates those routes' decisions. The routes
 * stay the enforcers.
 *
 * Who may read: exactly who may read the plancard — the SAME extracted gate (`resolvePlancardViewer`), the same
 * 404 / 403. Reads only; no mutation, no Stripe call. `Cache-Control: private, no-store`.
 */
import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { db } from "../db";
import { tripExpertAdvisors } from "@shared/schema";
import { resolvePlancardViewer } from "../services/plancard-viewer.service";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";
import { getTravelerSignupMode, getPlatformFlag } from "../services/platform-flags";
import { waitlistPurchaseDecisionFor } from "../services/waitlist-purchase-gate";
import { getActiveTripPass, tripPassRunsStatus } from "../services/trip-entitlement.service";
import { PLAN_KEYS, requirePlan } from "../services/plans.service";
import { getFee } from "../services/optimization-fee.service";
import { complexityTier } from "../services/smart-sequencing.service";
import { getTripHandoff } from "../services/handoff.service";
import { countPendingSuggestionsForTrip } from "../services/expert-suggestions.service";
import { HANDOFF_BOOKING_SETTING } from "@shared/traveler-doors";
import { deriveCapabilities, type CapabilityInputs } from "../services/trip-capabilities.pure";

const router = Router();

/** The CN-1 concierge booking on this trip (a `service_type = 'concierge'` listing), newest first, with its advisor row's access. */
async function conciergeForTrip(tripId: string): Promise<CapabilityInputs["concierge"]> {
  const r = await db.execute(sql`
    SELECT sb.status, ps.user_id AS expert_id
    FROM service_bookings sb
    JOIN provider_services ps ON ps.id = sb.service_id
    WHERE sb.trip_id = ${tripId} AND ps.service_type = 'concierge'
    ORDER BY sb.created_at DESC NULLS LAST
    LIMIT 1
  `);
  const row = r.rows?.[0] as { status: string | null; expert_id: string | null } | undefined;
  if (!row) return null;
  let accessUntil: Date | null = null;
  if (row.expert_id) {
    const [adv] = await db
      .select({ accessUntil: tripExpertAdvisors.accessUntil })
      .from(tripExpertAdvisors)
      .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, row.expert_id), eq(tripExpertAdvisors.source, "concierge")))
      .limit(1);
    accessUntil = adv?.accessUntil ?? null;
  }
  return { status: row.status, accessUntil };
}

async function advisorSourceFor(tripId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ source: tripExpertAdvisors.source })
    .from(tripExpertAdvisors)
    .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
    .orderBy(desc(tripExpertAdvisors.assignedAt))
    .limit(1);
  return row?.source ?? null;
}

router.get("/api/trips/:tripId/capabilities", isAuthenticated, async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = getUserId(req)!;
    const viewer = await resolvePlancardViewer(tripId, userId);
    if (!viewer.ok) {
      return viewer.deny === 404
        ? res.status(404).json({ error: "Trip not found" })
        : res.status(403).json({ error: "Access denied" });
    }
    const { trip } = viewer;

    const [advisorSource, writeDenied, mode, purchase, pass, runs, handoff, pendingSuggestions, handoffBookingOn, concierge] = await Promise.all([
      advisorSourceFor(tripId, userId),
      authorizeTripLogistics(tripId, userId, "GET /api/trips/:tripId/capabilities", { requireWriteAccess: true }),
      getTravelerSignupMode(),
      waitlistPurchaseDecisionFor(userId),
      getActiveTripPass(tripId),
      tripPassRunsStatus(tripId),
      getTripHandoff(tripId),
      countPendingSuggestionsForTrip(tripId),
      getPlatformFlag(HANDOFF_BOOKING_SETTING, false),
      conciergeForTrip(tripId),
    ]);

    // A plan row that cannot be read is the purchase route's failure too — the offer is not made (§13).
    let tripPassPlanAvailable = false;
    try {
      const plan = await requirePlan(PLAN_KEYS.TRIP_PASS);
      tripPassPlanAvailable = !!plan.active && plan.priceCents > 0;
    } catch {
      tripPassPlanAvailable = false;
    }
    // The pay route refuses a disabled fee row (400) and fails when the row cannot be read — either way, no offer.
    let optimizerFeeDisabled = true;
    try {
      const eventType = (trip as any).eventType ?? null;
      optimizerFeeDisabled = (await getFee(eventType, complexityTier(eventType))).isDisabled;
    } catch {
      optimizerFeeDisabled = true;
    }

    const caps = deriveCapabilities({
      viewer: {
        tripRole: viewer.tripRole,
        isAssignedExpert: viewer.isAssignedExpert,
        isAuthor: viewer.isAuthor,
        advisorSource,
        ownsTrip: (trip as any).userId === userId,
        canEdit: writeDenied === null,
      },
      signup: { mode, purchasesAllowed: purchase.allowed },
      pass: { active: pass !== null, runs },
      tripPassPlanAvailable,
      optimizerFeeDisabled,
      handoff: handoff
        ? {
            kind: handoff.handoffKind ?? null,
            status: handoff.status ?? null,
            scopeItemIds: Array.isArray(handoff.scopeItemIds) ? (handoff.scopeItemIds as string[]) : [],
            onTripSupportOfferedAt: handoff.onTripSupportOfferedAt,
            onTripSupportAcceptedAt: handoff.onTripSupportAcceptedAt,
          }
        : null,
      pendingSuggestions,
      handoffBookingOn,
      concierge,
    });
    res.set("Cache-Control", "private, no-store");
    res.json(caps);
  } catch (err: any) {
    console.error("[trip-capabilities] read failed:", err?.message ?? err);
    res.status(500).json({ error: "Failed to load capabilities" });
  }
});

export default router;
