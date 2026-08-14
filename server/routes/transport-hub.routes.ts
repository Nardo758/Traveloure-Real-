/**
 * Transport Hub API Routes
 *
 * Endpoints for viewing and booking transport options
 * - GET /api/itinerary/:tripId/transport-hub - Fetch hub data
 * - POST /api/transport-booking-options/:optionId/book - Book platform option
 * - POST /api/transport-booking-options/:optionId/click - Track affiliate click
 * - PATCH /api/transport-booking-options/:optionId/status - Update booking status
 */

import { Router } from "express";
import { getUserId } from "../utils/auth";
import { storage } from "../storage";
import { db } from "../db";
import { transportBookingOptions } from "@shared/schema";
import { createTransportBookingCheckout } from "../services/stripe.service";
import { populateBookingOptionsForVariant, populateBookingOptionsForLeg, getDestinationTransportOptions } from "../services/transport-booking-options.service";
import { isAuthenticated } from "../replit_integrations/auth";
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
): Promise<{ status: number; message: string } | null> {
  if (!userId) return { status: 401, message: "Not authenticated" };

  // Owner of the comparison itself (covers trip-less comparisons).
  if (comparison?.userId && comparison.userId === userId) return null;

  // Otherwise authorize the trip this transport plan belongs to. When no
  // comparison resolved, the param can only have been meant as a trip id.
  return authorizeTripLogistics(comparison?.tripId ?? fallbackTripId, userId, route);
}

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

      // Mark the option as "confirmed" so the UI shows the green Confirmed badge immediately
      await storage.updateTransportBookingOptionStatus(optionId, { bookingStatus: "confirmed" });

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
 * Updates booking status for external/affiliate bookings
 * User marks as "booked" after completing external booking
 */
router.patch(
  "/api/transport-booking-options/:optionId/status",
  isAuthenticated,
  async (req, res) => {
    try {
      const { optionId } = req.params;
      const { bookingStatus, confirmationRef } = req.body;

      // Update booking option status (and persist confirmationRef if provided)
      const updateData: Record<string, any> = { bookingStatus };
      if (confirmationRef !== undefined && confirmationRef !== null) {
        updateData.confirmationRef = confirmationRef;
      }

      await storage.updateTransportBookingOptionStatus(optionId, updateData);

      res.json({
        success: true,
        message: "Booking status updated",
        bookingStatus,
        confirmationRef: confirmationRef || null,
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
 */
router.post("/api/transport-booking-options/seed/test-variant", isAuthenticated, async (req, res) => {
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
