/**
 * Transport Hub API Routes
 *
 * Endpoints for viewing and booking transport options
 * - GET /api/itinerary/:tripId/transport-hub - Fetch hub data
 * - POST /api/transport-booking-options/:optionId/book - Book platform option
 * - POST /api/transport-booking-options/:optionId/click - Track affiliate click
 * - PATCH /api/transport-booking-options/:optionId/status - Traveller self-report (owner-gated)
 */

import { Router } from "express";
import { getUserId } from "../utils/auth";
import { storage } from "../storage";
import { db } from "../db";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { transportBookingOptions } from "@shared/schema";
import { createTransportBookingCheckout } from "../services/stripe.service";
import { populateBookingOptionsForVariant, populateBookingOptionsForLeg, getDestinationTransportOptions } from "../services/transport-booking-options.service";
import { isAuthenticated } from "../replit_integrations/auth";
import { requireTestSeedEnabled } from "../middleware/test-only-endpoint";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";

const router = Router();

/**
 * Authorization for the transport surfaces below (P0 fix, Jul 30 2026).
 *
 * These routes were `isAuthenticated`-only — any signed-in user could read (or,
 * for `seed`, WRITE) another traveller's transport plan. The `:tripId` param is
 * overloaded: it is EITHER an `itinerary_comparisons.id` OR a `trips.id` (the
 * handler falls back from one to the other), so both id paths have to resolve to
 * the same authorization decision.
 *
 * Principal set = the canonical `authorizeTripLogistics`
 * (owner ‖ assigned expert ‖ author ‖ audit-logged admin) — the right set for a
 * trip's transport view, matching the rest of the per-trip logistics surface.
 *
 * A comparison legitimately may have NO trip (`itinerary_comparisons.trip_id` is
 * nullable — cart / experience-template flows create one before any trip exists);
 * in that case the comparison's own `user_id` is the only owner there is, so it
 * is honoured explicitly. Nothing here trusts a caller-supplied identity.
 */
async function authorizeTransportScope(
  comparison: { userId?: string | null; tripId?: string | null } | null | undefined,
  fallbackTripId: string,
  userId: string | undefined | null,
  route: string,
  options?: { requireWriteAccess?: boolean },
): Promise<{ status: number; message: string } | null> {
  if (!userId) return { status: 401, message: "Not authenticated" };

  // Owner of the comparison itself (covers trip-less comparisons).
  if (comparison?.userId && comparison.userId === userId) return null;

  // Otherwise authorize the trip this transport plan belongs to. When no
  // comparison resolved, the param can only have been meant as a trip id.
  //
  // `requireWriteAccess` (Locked Decision 12 — "a PENDING advisor may not write") is passed
  // through unchanged for the READ surfaces (absent ⇒ today's behaviour, byte-identical for
  // every pre-existing caller) and set by the self-report PATCH below, which is a MUTATION.
  return authorizeTripLogistics(comparison?.tripId ?? fallbackTripId, userId, route, options);
}

/**
 * Resolves the OWNING SCOPE of a transport booking option (V-7, ledger
 * `2026-09-12-transport-status-self-report-gate`).
 *
 * `transport_booking_options` carries no owner column. A row belongs to a traveller only
 * transitively: `variant_id` directly, or `transport_leg_id` → the leg's variant. The variant's
 * comparison is what `authorizeTransportScope` already knows how to authorize, so the option's
 * gate is the SAME decision as the hub's — one predicate, one more caller (§18 rule 1), rather
 * than a second "may this person touch this transport row?" test.
 *
 * §13 — A ROW WITH NEITHER LINK HAS NO PROVABLE OWNER, and `null` says exactly that. It is NOT
 * "anyone may write it": the caller maps a null scope to the same ONE 404 an unowned row gets,
 * because we cannot show that anybody owns it. (The `seed/test-variant` fixture row is precisely
 * this shape — legId and variantId both NULL.)
 */
async function resolveOptionScope(
  option: { variantId?: string | null; transportLegId?: string | null },
): Promise<{ userId?: string | null; tripId?: string | null } | null> {
  let variantId = option.variantId ?? null;
  if (!variantId && option.transportLegId) {
    const leg = await storage.getTransportLegById(option.transportLegId);
    variantId = leg?.variantId ?? null;
  }
  if (!variantId) return null;

  const variant = await storage.getItineraryVariantById(variantId);
  if (!variant) return null;

  return ((await storage.getItineraryComparison(variant.comparisonId)) as any) ?? null;
}

/**
 * §19 — THE SELF-REPORT BODY IS AN ALLOWLIST, AND `confirmed` IS NOT IN IT.
 *
 * The field set is PICKED off the table's own insert schema (so it is mechanically true: a column
 * added to `transport_booking_options` later is unreachable here until someone names it), the
 * value set is re-stated as an explicit enum because the column is free text with no DB CHECK, and
 * `.strict()` REFUSES an unknown key rather than silently stripping it (the LD 34 posture).
 *
 * WHY `confirmed` IS ABSENT, and it is the whole point of this schema. `booking_status` is read by
 * two surfaces that treat `confirmed` as a REAL reservation — `TransportBookingCard` draws the
 * green Confirmed badge, and `traveler-profile.service.ts` counts `booking_status IN
 * ('booked','confirmed')` as a purchased transport pick. On the platform rail that value is written
 * by ONE author, the payment's own signal (`handleStripePaymentSuccess`, gated on
 * `payment_status === "paid"` — ledger `2026-09-08-transport-confirm-timing`). A traveller saying
 * "I booked this on the partner's site" is a DIFFERENT FACT from the platform holding the payment
 * (LD 44 (e): a named actor's purchase attempt and a confirmation in hand are never collapsed), so
 * the self-report rail can say `booked` and can never say `confirmed`. That is the LD 44 (e) rule
 * one table over: a human may not type themselves into a machine state.
 */
const TRAVELER_SELF_REPORT_STATUSES = ["available", "booked", "cancelled"] as const;

const transportStatusSelfReportSchema = createInsertSchema(transportBookingOptions)
  .pick({ bookingStatus: true, confirmationRef: true })
  .extend({
    bookingStatus: z.enum(TRAVELER_SELF_REPORT_STATUSES),
    // A partner's reference is free text, so only a length bound is claimed — no format is
    // asserted on a partner's behalf. `null` is how a traveller CLEARS one they mistyped;
    // omitting the key leaves whatever is on the row untouched (absent ≠ empty, §13).
    confirmationRef: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict();

/**
 * GET /api/itinerary/:tripId/transport-hub
 *
 * Returns complete Transport Hub data:
 * - Summary (total legs, booked, cost, time)
 * - Days with legs and booking options
 * - Multi-day pass recommendations
 */
router.get("/api/itinerary/:tripId/transport-hub", isAuthenticated, async (req, res) => {
  try {
    const { tripId } = req.params;

    const emptyHub = {
      summary: {
        totalLegs: 0,
        bookedLegs: 0,
        estimatedCostRange: { low: 0, high: 0 },
        totalTravelMinutes: 0,
        preferences: { priority: "time", maxWalkMinutes: 15, avoidModes: [] },
      },
      days: [],
      multiDayPasses: [],
    };

    // First try: look up as an itineraryComparisons ID directly
    let comparison = await storage.getItineraryComparison(tripId);

    // Fallback: treat as a trips.id and find the latest comparison for it
    if (!comparison) {
      comparison = await storage.getFullComparisonByTripId(tripId);
    }

    // Authorize BEFORE returning any of the plan (or the empty-hub existence
    // signal). Runs after resolution because BOTH id paths must land on the same
    // decision — see authorizeTransportScope.
    const userId = getUserId(req)!;
    const denied = await authorizeTransportScope(
      comparison as any,
      tripId,
      userId,
      "GET /api/itinerary/:tripId/transport-hub",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    // No comparison at all — return empty hub (not an error)
    if (!comparison) {
      return res.json(emptyHub);
    }

    // Get selected variant or first variant
    let variant;
    if (comparison.selectedVariantId) {
      variant = await storage.getItineraryVariantById(comparison.selectedVariantId);
    } else {
      variant = await storage.getFirstVariantByComparisonId(comparison.id);
    }

    // No variant yet — return empty hub (not an error)
    if (!variant) {
      return res.json(emptyHub);
    }

    // Fetch all transport legs for the variant
    const legs = await storage.getTransportLegsByVariantId(variant.id);

    // If variant exists but no legs yet → legs are being calculated
    if (legs.length === 0) {
      return res.json({
        ...emptyHub,
        status: "calculating",
        summary: {
          ...emptyHub.summary,
          preferences: (comparison as any).transportPreferences || emptyHub.summary.preferences,
        },
      });
    }

    // Fetch all booking options for the variant
    const allOptions = await storage.getBookingOptionsByVariantId(variant.id);

    // Organize by day
    const dayMap = new Map<number, any>();
    for (const leg of legs) {
      if (!dayMap.has(leg.dayNumber)) {
        dayMap.set(leg.dayNumber, {
          dayNumber: leg.dayNumber,
          legs: [],
        });
      }
      dayMap.get(leg.dayNumber)!.legs.push(leg);
    }

    // §16: affiliate/deep-link options never ship their externalUrl to the client. The
    // booking-agent rail re-resolves the URL from the transport_booking_options row by id
    // (transportOptionId) — the card only needs to know a bookable link exists. Same strip
    // as GET /api/transport-legs/:legId/options.
    const stripExternalUrl = ({ externalUrl, ...rest }: any) => ({
      ...rest,
      hasBookingLink: !!externalUrl,
    });

    // Add booking options to legs (filtered by user's selected mode)
    const days = Array.from(dayMap.values()).map((day) => ({
      ...day,
      legs: day.legs.map((leg: any) => {
        const activeMode = leg.userSelectedMode || leg.recommendedMode;
        const legOptions = allOptions.filter((opt) => opt.transportLegId === leg.id && !opt.isMultiDayPass);
        // Show only booking options matching the user's selected mode for this leg
        const bookingOptions = legOptions.filter((opt) => opt.modeType === activeMode).map(stripExternalUrl);

        return {
          id: leg.id,
          legOrder: leg.legOrder,
          fromName: leg.fromName,
          toName: leg.toName,
          distanceDisplay: leg.distanceDisplay,
          recommendedMode: leg.recommendedMode,
          userSelectedMode: leg.userSelectedMode,
          estimatedDurationMinutes: leg.estimatedDurationMinutes,
          estimatedCostUsd: leg.estimatedCostUsd,
          alternativeModes: leg.alternativeModes || [],
          fromLat: leg.fromLat,
          fromLng: leg.fromLng,
          toLat: leg.toLat,
          toLng: leg.toLng,
          bookingOptions,
        };
      }),
    }));

    // Separate multi-day passes (§16 strip applies here too)
    const multiDayPasses = allOptions.filter((opt) => opt.isMultiDayPass).map(stripExternalUrl);

    // Calculate summary
    const totalLegs = legs.length;
    const bookedLegs = allOptions.filter(
      (opt) => opt.bookingStatus === "booked" || opt.bookingStatus === "confirmed"
    ).length;
    const lowPrices = allOptions.filter((opt) => opt.priceCentsLow).map((opt) => (opt.priceCentsLow || 0) / 100);
    const highPrices = allOptions.filter((opt) => opt.priceCentsHigh).map((opt) => (opt.priceCentsHigh || 0) / 100);
    const estimatedCostRange = {
      low: lowPrices.length ? Math.min(...lowPrices) : 0,
      high: highPrices.length ? Math.max(...highPrices) : 0,
    };
    const totalTravelMinutes = legs.reduce(
      (sum, l) => sum + (l.estimatedDurationMinutes || 0),
      0
    );

    // Calculate mode breakdown
    const modeCounts: Record<string, number> = {};
    for (const leg of legs) {
      const mode = leg.userSelectedMode || leg.recommendedMode;
      modeCounts[mode] = (modeCounts[mode] || 0) + 1;
    }
    const modeBreakdown = Object.entries(modeCounts)
      .map(([mode, count]) => ({
        mode,
        count,
        percent: Math.round((count / legs.length) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    res.json({
      status: "ready",
      summary: {
        totalLegs,
        bookedLegs,
        estimatedCostRange,
        totalTravelMinutes,
        modeBreakdown,
        preferences: (comparison as any).transportPreferences || {
          priority: "time",
          maxWalkMinutes: 15,
          avoidModes: [],
        },
      },
      days: days.sort((a, b) => a.dayNumber - b.dayNumber),
      multiDayPasses,
    });
  } catch (error) {
    console.error("Error fetching transport hub:", error);
    res.status(500).json({ error: "Failed to fetch transport hub" });
  }
});

/**
 * GET /api/transport-legs/:legId/options
 *
 * Returns booking options for a single transport leg.
 * If no options exist yet (newly created leg), populates them on the fly
 * from the live resolvers (platform + affiliate) then returns the result.
 * Revenue metadata (revenueType, revenueRate) is appended at read time from
 * booking_fee_configs so the UI can display accurate commission information.
 */
router.get(
  "/api/transport-legs/:legId/options",
  isAuthenticated,
  async (req, res) => {
    try {
      const { legId } = req.params;

      const leg = await storage.getTransportLegById(legId);
      if (!leg) return res.status(404).json({ error: "Transport leg not found" });

      let options = await storage.getBookingOptionsByLegId(legId);

      // If no options exist, populate them now (lazy / on-demand)
      if (options.length === 0) {
        const destination = (leg.destinationProfile as string | null) || leg.toName.split(",")[0];
        await populateBookingOptionsForLeg(legId, destination, 1);
        options = await storage.getBookingOptionsByLegId(legId);
      }

      // §16: affiliate/deep-link options never ship their externalUrl to the client. The
      // booking-agent rail re-resolves the URL from the transport_booking_options row by id
      // (transportOptionId) — the card only needs to know a bookable link exists.
      const safeOptions = options.map(({ externalUrl, ...rest }: any) => ({
        ...rest,
        hasBookingLink: !!externalUrl,
      }));

      res.json({ legId, options: safeOptions });
    } catch (err) {
      console.error("[transport-legs/:legId/options]", err);
      res.status(500).json({ error: "Failed to load booking options" });
    }
  }
);

/**
 * POST /api/transport-booking-options/:optionId/book
 *
 * Books a platform (Traveloure) transport option
 * Creates booking, initiates Stripe checkout
 */
router.post(
  "/api/transport-booking-options/:optionId/book",
  isAuthenticated,
  async (req, res) => {
    try {
      const { optionId } = req.params;
      const { travelers = 1, specialRequests } = req.body;
      const userId = getUserId(req)!; // Replit Auth: user.id; email auth: user.claims.sub

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Fetch the booking option
      const option = await storage.getTransportBookingOptionById(optionId);

      if (!option) {
        return res.status(404).json({ error: "Booking option not found" });
      }

      if (option.bookingType !== "platform") {
        return res.status(400).json({ error: "Not a platform booking option" });
      }

      // Per-leg platform options carry transportLegId but not variantId.
      // Resolve the variant via the leg when the option has no direct variantId.
      let variantId = option.variantId;
      if (!variantId && option.transportLegId) {
        const leg = await storage.getTransportLegById(option.transportLegId);
        variantId = leg?.variantId ?? null;
      }

      if (!variantId) {
        return res.status(400).json({ error: "Booking option has no associated variant or leg" });
      }

      // Fetch the variant to get tripId
      const variant = await storage.getItineraryVariantById(variantId);

      if (!variant) {
        return res.status(404).json({ error: "Variant not found" });
      }

      // Fetch the comparison (trip) to get tripId
      const comparison = await storage.getItineraryComparison(variant.comparisonId);

      if (!comparison) {
        return res.status(404).json({ error: "Trip not found" });
      }

      // Create Stripe checkout session
      const checkoutSession = await createTransportBookingCheckout(
        optionId,
        comparison.tripId, // real trips FK (comparison.id is an itinerary_comparisons id, not a trip id)
        userId,
        travelers,
        specialRequests
      );

      // §13 (ledger 2026-09-08-transport-confirm-timing) — NOTHING IS STAMPED HERE.
      // This handler has only created a hosted Stripe Checkout Session: the traveler has not
      // paid, and may abandon the page or be declined. Stamping `bookingStatus: "confirmed"` here
      // (which is what this line used to do, for the green badge) claimed a reservation the
      // platform could not support, and both readers of this column treat that claim as a real
      // one — `TransportBookingCard` draws the Confirmed badge, and
      // `traveler-profile.service.ts` counts `booking_status IN ('booked','confirmed')` as a
      // purchased transport pick.
      // The option keeps the status it already has (default `available` — "nothing reserved yet",
      // which is TRUE while the checkout is in flight). No new status value is invented for
      // "awaiting payment": this column's set is app-enforced ("available", "booked",
      // "confirmed", "cancelled") and a fifth value would be invisible to both readers anyway.
      // The promotion to "confirmed" is the PAYMENT's own signal and already exists:
      // `checkout.session.completed` (metadata.type === "transport_booking") →
      // `handleStripePaymentSuccess`, which returns early unless `session.payment_status === "paid"`
      // and then writes the status in ONE statement (§15 — the UPDATE is the transition, there is
      // no check-then-write on the DB status). No backfill: rows stamped under the old rule keep
      // their value.

      res.json({
        success: true,
        message: "Booking initiated",
        checkoutUrl: checkoutSession.checkoutUrl,
        bookingId: checkoutSession.bookingId,
        sessionId: checkoutSession.sessionId,
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  }
);

/**
 * POST /api/transport-booking-options/:optionId/click
 *
 * Tracks affiliate click for revenue attribution
 * Returns redirect URL for affiliate link
 */
router.post(
  "/api/transport-booking-options/:optionId/click",
  isAuthenticated,
  async (req, res) => {
    try {
      const { optionId } = req.params;
      const userId = getUserId(req)!;
      const userAgent = req.get("user-agent") || "";
      const referrer = req.get("referrer") || "";

      // Fetch the booking option
      const option = await storage.getTransportBookingOptionById(optionId);

      if (!option) {
        return res.status(404).json({ error: "Booking option not found" });
      }

      if (!option.externalUrl) {
        return res.status(400).json({ error: "No external URL for this option" });
      }

      // Log click event for affiliate tracking.
      try {
        const isAiGeneratedAffiliate = option.bookingType === "affiliate";
        await storage.createAffiliateClick({
          partnerId: option.source,
          userId: userId || undefined,
          referrer: referrer || undefined,
          userAgent: userAgent || undefined,
          ipAddress: (req.ip || "").split(":").pop(),
          initiatedBy: isAiGeneratedAffiliate ? "ai_agent" : "user",
          agentType: isAiGeneratedAffiliate ? "system" : null,
          sessionId: null,
          clickedAt: new Date(),
        });
      } catch (clickError) {
        console.error("Error logging affiliate click:", clickError);
      }

      // Add affiliate code if present
      let redirectUrl = option.externalUrl;
      if (option.affiliateCode) {
        const separator = redirectUrl.includes("?") ? "&" : "?";
        redirectUrl += `${separator}affiliate=${option.affiliateCode}`;
      }

      res.json({
        success: true,
        tracked: true,
        redirectUrl,
      });
    } catch (error) {
      console.error("Error tracking affiliate click:", error);
      res.status(500).json({ error: "Failed to track click" });
    }
  }
);

/**
 * PATCH /api/transport-booking-options/:optionId/status
 *
 * The traveller's SELF-REPORT rail for an external/affiliate transport booking: "I booked this on
 * the partner's site", with the partner's own reference if they have one.
 *
 * V-7 (ledger `2026-09-12-transport-status-self-report-gate`) — WHAT THIS USED TO BE.
 * The handler read `bookingStatus` and `confirmationRef` straight off `req.body` behind
 * `isAuthenticated` and nothing else: no ownership check, no allowlist, no value set. ANY signed-in
 * account could stamp ANY transport option `confirmed` with ANY reference, on any traveller's plan,
 * and both readers of that column treat `confirmed` as a real reservation (`TransportBookingCard`'s
 * green badge; `traveler-profile.service.ts`'s purchased-pick count). That is the §19 denylist shape
 * on a status-and-authorship field — the class §14 states for identity and §18 for a rate.
 *
 * FOUR RULES, and none of them is optional:
 *
 *  1. **THE ACTOR IS THE SESSION AND THE ROW IS RESOLVED SERVER-SIDE (§14).** The option is looked
 *     up, its owning scope derived through `resolveOptionScope`, and that scope authorized by the
 *     SAME `authorizeTransportScope` the hub read uses — with `requireWriteAccess`, because this is
 *     a mutation and Locked Decision 12 says a PENDING advisor may not write. Nothing is taken from
 *     the caller but the option id and the two allowlisted fields.
 *  2. **ONE 404 COVERS "no such thing" AND "not yours"** (Locked Decision 40's
 *     `POST /api/conversations/start` posture). Absent row, unownable row (no leg and no variant —
 *     §13: we cannot show anybody owns it, which is not the same as everybody owning it), missing
 *     variant/comparison and a refused authorization all answer the SAME sentence, so the rail
 *     cannot be used to probe which options exist or whose they are. A 403 here would be the probe.
 *  3. **THE BODY IS AN ALLOWLIST AND CANNOT SAY `confirmed`** — see
 *     `transportStatusSelfReportSchema` above for why that value belongs to the payment alone.
 *  4. **A PLATFORM OPTION IS NOT SELF-REPORTABLE AT ALL.** Its status follows the money (ledger
 *     `2026-09-08-transport-confirm-timing`), so letting its owner hand-write `booked` on a checkout
 *     they abandoned would reopen exactly the defect that lane closed, through a second door. The
 *     refusal is a 400 rather than a 404 because by this point the caller has already been shown the
 *     row is theirs — there is nothing left to probe.
 *
 * §15 SHAPE, ON A NON-MONEY WRITE. The UPDATE carries its own from-state guard
 * (`booking_status IS NULL OR booking_status <> 'confirmed'`) so the statement IS the guard: a
 * self-report can never overwrite a payment-written confirmation, with no check-then-write window.
 * Today that is belt-and-braces — rule 4 already refuses the only rail that writes `confirmed` — and
 * it is kept because a second writer of that value is exactly what a later lane might add.
 *
 * §13 IN THE RESPONSE: the reply reports the values that were PERSISTED (the UPDATE's own
 * `returning()`), never an echo of what the caller sent.
 */
router.patch(
  "/api/transport-booking-options/:optionId/status",
  isAuthenticated,
  async (req, res) => {
    // "No such thing" and "not yours" are the same sentence — see rule 2 above.
    const notFound = () => res.status(404).json({ error: "Booking option not found" });

    try {
      const { optionId } = req.params;
      const userId = getUserId(req);

      const parsed = transportStatusSelfReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid booking status update",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }
      const { bookingStatus, confirmationRef } = parsed.data;

      const option = await storage.getTransportBookingOptionById(optionId);
      if (!option) return notFound();

      const scope = await resolveOptionScope(option);
      if (!scope) return notFound();

      const denied = await authorizeTransportScope(
        scope,
        scope.tripId ?? "",
        userId,
        "PATCH /api/transport-booking-options/:optionId/status",
        { requireWriteAccess: true },
      );
      if (denied) {
        // Unauthenticated is not a probe, so 401 stays 401; every AUTHORIZATION refusal collapses
        // into the same 404 an absent row gets.
        if (denied.status === 401) return res.status(401).json({ message: denied.message });
        return notFound();
      }

      if (option.bookingType === "platform") {
        return res.status(400).json({
          error:
            "A platform transport booking's status follows its payment and cannot be self-reported",
        });
      }

      // §15 shape: the from-state guard is IN the statement, not a pre-check.
      const [updated] = await db
        .update(transportBookingOptions)
        .set({
          bookingStatus,
          // An omitted key leaves the stored reference alone; an explicit `null` clears it.
          ...(confirmationRef !== undefined ? { confirmationRef } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(transportBookingOptions.id, optionId),
            // `booking_status` is nullable (column default "available"), and in SQL
            // `NULL <> 'confirmed'` is NULL rather than TRUE — so an un-stamped row has to be
            // admitted explicitly or a bare `ne` would silently refuse every one of them.
            or(
              isNull(transportBookingOptions.bookingStatus),
              ne(transportBookingOptions.bookingStatus, "confirmed"),
            ),
          ),
        )
        .returning({
          id: transportBookingOptions.id,
          bookingStatus: transportBookingOptions.bookingStatus,
          confirmationRef: transportBookingOptions.confirmationRef,
        });

      if (!updated) {
        // The row was resolved and authorized a moment ago, so the only thing the guard can have
        // refused is a payment-written `confirmed` (§13: say which fact stopped the write).
        return res.status(409).json({
          error: "This option is confirmed by its payment and cannot be changed by a self-report",
        });
      }

      res.json({
        success: true,
        message: "Booking status updated",
        bookingStatus: updated.bookingStatus,
        confirmationRef: updated.confirmationRef ?? null,
      });
    } catch (error) {
      console.error("Error updating booking status:", error);
      res.status(500).json({ error: "Failed to update booking status" });
    }
  }
);

/**
 * GET /api/transport-options
 *
 * Returns destination-level transport options (platform providers + affiliate
 * deep-links) without requiring a trip leg or itinerary. Used by the Transfers
 * tab in the experience builder to let users add transport to their cart.
 *
 * Query params:
 *   destination  — required
 *   travelers    — optional number (default 1)
 *   startDate    — optional ISO date string
 */
router.get("/api/transport-options", async (req, res) => {
  try {
    const { destination, travelers, startDate } = req.query;
    if (!destination || typeof destination !== "string") {
      return res.status(400).json({ error: "destination is required" });
    }
    const travelersNum = travelers ? parseInt(String(travelers), 10) : 1;
    const startDateStr = typeof startDate === "string" ? startDate : undefined;
    const options = await getDestinationTransportOptions(destination, travelersNum, startDateStr);
    return res.json(options);
  } catch (error) {
    console.error("[transport-options] Error fetching destination transport options:", error);
    return res.status(500).json({ error: "Failed to fetch transport options" });
  }
});

/**
 * POST /api/transport-booking-options/seed/test-variant
 *
 * CI/test-only endpoint: inserts a minimal transport booking option with a
 * known externalUrl so the click endpoint can be exercised without a real
 * itinerary in the database. Static segment must come BEFORE the dynamic
 * /seed/:variantId route so Express matches it first.
 *
 * UNREACHABLE IN PRODUCTION (audit finding 11, ledger `2026-09-03-security-9-11-13`).
 * It described itself as "CI/test-only" and was nevertheless mounted and live on the production
 * boot behind `isAuthenticated` alone — unbounded junk-row insertion into the traveler-facing
 * `transport_booking_options` table by any account, with no consumer that could clean it up.
 * `requireTestSeedEnabled` refuses it on a production boot (503) and runs BEFORE the session guard
 * so the refusal costs nothing. See `server/middleware/test-only-endpoint.ts` for why the predicate
 * is the shared `isProdStrictEnv` rather than a bare NODE_ENV check, and why no new env var or
 * secret was introduced. Its one caller, `e2e/specs/journey-6.spec.ts`, runs against an
 * ALLOW_TEST_ACCOUNTS boot and is unchanged.
 *
 * NOTE the sibling `/seed/:variantId` below is deliberately NOT gated this way: it is a real
 * per-trip capability that is authorized by the variant's owning trip, and its own comment says
 * why environment would be the wrong boundary there. Pinned by
 * `server/__tests__/test-seed-endpoint-gate.test.ts`.
 */
router.post("/api/transport-booking-options/seed/test-variant", requireTestSeedEnabled, isAuthenticated, async (req, res) => {
  try {
    const [row] = await db
      .insert(transportBookingOptions)
      .values({
        bookingType: "affiliate",
        source: "test",
        title: "Test Transport Option",
        modeType: "bus",
        externalUrl: "https://12go.asia/en",
        bookingStatus: "available",
      })
      .returning();
    return res.status(201).json({ id: row.id, variant: "test-variant", createdAt: row.createdAt });
  } catch (error) {
    console.error("Error seeding test transport option:", error);
    return res.status(500).json({ error: "Failed to seed test transport option" });
  }
});

/**
 * POST /api/transport-booking-options/seed/:variantId
 *
 * Populates booking options for all legs of a variant.
 *
 * Self-described as dev/test, but it is mounted and live, and it WRITES rows onto
 * the variant's legs — so it is authorized like any other per-trip logistics
 * write (owner ‖ assigned expert ‖ author ‖ audit-logged admin) rather than
 * env-gated: the same lazy population already happens on the live read path
 * (`GET /api/transport-legs/:legId/options`), so gating this one to non-production
 * would remove a legitimate capability without removing the behaviour, while
 * leaving the real defect (no authorization) unaddressed. Environment is not an
 * authorization boundary; the variant's owning trip is.
 */
router.post("/api/transport-booking-options/seed/:variantId", isAuthenticated, async (req, res) => {
  try {
    const { variantId } = req.params;
    const variant = await storage.getItineraryVariantById(variantId);
    if (!variant) {
      return res.status(404).json({ error: "Variant not found" });
    }
    const comparison = await storage.getItineraryComparison(variant.comparisonId);

    const userId = getUserId(req)!;
    const denied = await authorizeTransportScope(
      comparison as any,
      variant.comparisonId,
      userId,
      "POST /api/transport-booking-options/seed/:variantId",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const destination = comparison?.destination || "Unknown";
    await populateBookingOptionsForVariant(variantId, destination);
    res.json({ success: true, message: `Booking options seeded for variant ${variantId}` });
  } catch (error) {
    console.error("Error seeding booking options:", error);
    res.status(500).json({ error: "Failed to seed booking options" });
  }
});

/**
 * GET /api/transport-booking-options/:optionId
 *
 * Fetch details for a specific booking option
 */
router.get("/api/transport-booking-options/:optionId", isAuthenticated, async (req, res) => {
  try {
    const { optionId } = req.params;

    const option = await storage.getTransportBookingOptionById(optionId);

    if (!option) {
      return res.status(404).json({ error: "Booking option not found" });
    }

    // §16: never ship the partner URL to the client — same strip as the hub/leg DTOs.
    const { externalUrl, ...safe } = option as any;
    res.json({ ...safe, hasBookingLink: !!externalUrl });
  } catch (error) {
    console.error("Error fetching booking option:", error);
    res.status(500).json({ error: "Failed to fetch booking option" });
  }
});

export default router;
