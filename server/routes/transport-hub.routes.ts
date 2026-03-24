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
import { db } from "../db";
import {
  transportBookingOptions,
  transportLegs,
  itineraryVariants,
  itineraryComparisons,
  affiliateClicks,
} from "@shared/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { createTransportBookingCheckout } from "../services/stripe.service";

const router = Router();

/**
 * GET /api/itinerary/:tripId/transport-hub
 *
 * Returns complete Transport Hub data:
 * - Summary (total legs, booked, cost, time)
 * - Days with legs and booking options
 * - Multi-day pass recommendations
 */
router.get("/api/itinerary/:tripId/transport-hub", async (req, res) => {
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
    let comparison = await db.query.itineraryComparisons.findFirst({
      where: eq(itineraryComparisons.id, tripId),
    });

    // Fallback: treat as a trips.id and find the latest comparison for it
    if (!comparison) {
      const [byTrip] = await db
        .select()
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.tripId, tripId))
        .orderBy(desc(itineraryComparisons.createdAt))
        .limit(1);
      comparison = byTrip ?? null;
    }

    // No comparison at all — return empty hub (not an error)
    if (!comparison) {
      return res.json(emptyHub);
    }

    // Get selected variant or first variant
    let variant;
    if (comparison.selectedVariantId) {
      variant = await db.query.itineraryVariants.findFirst({
        where: eq(itineraryVariants.id, comparison.selectedVariantId),
      });
    } else {
      const variants = await db.query.itineraryVariants.findMany({
        where: eq(itineraryVariants.comparisonId, comparison.id),
        limit: 1,
      });
      variant = variants[0];
    }

    // No variant yet — return empty hub (not an error)
    if (!variant) {
      return res.json(emptyHub);
    }

    // Fetch all transport legs for the variant
    const legs = await db.query.transportLegs.findMany({
      where: eq(transportLegs.variantId, variant.id),
    });

    // Fetch all booking options for the variant
    const allOptions = await db
      .select()
      .from(transportBookingOptions)
      .where(eq(transportBookingOptions.variantId, variant.id));

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

    // Add booking options to legs
    const days = Array.from(dayMap.values()).map((day) => ({
      ...day,
      legs: day.legs.map((leg: any) => ({
        id: leg.id,
        legOrder: leg.legOrder,
        fromName: leg.fromName,
        toName: leg.toName,
        distanceDisplay: leg.distanceDisplay,
        recommendedMode: leg.recommendedMode,
        userSelectedMode: leg.userSelectedMode,
        estimatedDurationMinutes: leg.estimatedDurationMinutes,
        estimatedCostUsd: leg.estimatedCostUsd,
        fromLat: leg.fromLat,
        fromLng: leg.fromLng,
        toLat: leg.toLat,
        toLng: leg.toLng,
        bookingOptions: allOptions.filter((opt) => opt.transportLegId === leg.id),
      })),
    }));

    // Separate multi-day passes
    const multiDayPasses = allOptions.filter((opt) => opt.isMultiDayPass);

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

    res.json({
      summary: {
        totalLegs,
        bookedLegs,
        estimatedCostRange,
        totalTravelMinutes,
        preferences: comparison.transportPreferences || {
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
 * POST /api/transport-booking-options/:optionId/book
 *
 * Books a platform (Traveloure) transport option
 * Creates booking, initiates Stripe checkout
 */
router.post(
  "/api/transport-booking-options/:optionId/book",
  async (req, res) => {
    try {
      const { optionId } = req.params;
      const { travelers = 1, specialRequests } = req.body;
      const userId = (req as any).user?.id; // From auth middleware

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Fetch the booking option
      const option = await db.query.transportBookingOptions.findFirst({
        where: eq(transportBookingOptions.id, optionId),
      });

      if (!option) {
        return res.status(404).json({ error: "Booking option not found" });
      }

      if (option.bookingType !== "platform") {
        return res.status(400).json({ error: "Not a platform booking option" });
      }

      // Fetch the variant to get tripId
      const variant = await db.query.itineraryVariants.findFirst({
        where: eq(itineraryVariants.id, option.variantId),
      });

      if (!variant) {
        return res.status(404).json({ error: "Variant not found" });
      }

      // Fetch the comparison (trip) to get tripId
      const comparison = await db.query.itineraryComparisons.findFirst({
        where: eq(itineraryComparisons.id, variant.comparisonId),
      });

      if (!comparison) {
        return res.status(404).json({ error: "Trip not found" });
      }

      // Create Stripe checkout session
      const checkoutSession = await createTransportBookingCheckout(
        optionId,
        comparison.id, // tripId
        userId,
        travelers,
        specialRequests
      );

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
  async (req, res) => {
    try {
      const { optionId } = req.params;
      const userId = (req as any).user?.id;
      const userAgent = req.get("user-agent") || "";
      const referrer = req.get("referrer") || "";

      // Fetch the booking option
      const option = await db.query.transportBookingOptions.findFirst({
        where: eq(transportBookingOptions.id, optionId),
      });

      if (!option) {
        return res.status(404).json({ error: "Booking option not found" });
      }

      if (!option.externalUrl) {
        return res.status(400).json({ error: "No external URL for this option" });
      }

      // Log click event for affiliate tracking
      try {
        await db.insert(affiliateClicks).values({
          partnerId: option.source, // Use source as partner identifier
          userId: userId || undefined,
          tripId: undefined, // Could be populated if we have access to trip context
          referrer: referrer || undefined,
          userAgent: userAgent || undefined,
          ipAddress: (req.ip || "").split(":").pop(), // Extract IPv4 from IPv6 if needed
          clickedAt: new Date(),
        });
      } catch (clickError) {
        // Log error but don't fail the request - affiliate tracking is secondary
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
  async (req, res) => {
    try {
      const { optionId } = req.params;
      const { bookingStatus, confirmationRef } = req.body;

      // Update booking option status
      await db
        .update(transportBookingOptions)
        .set({
          bookingStatus,
          updatedAt: new Date(),
        })
        .where(eq(transportBookingOptions.id, optionId));

      res.json({
        success: true,
        message: "Booking status updated",
        bookingStatus,
        confirmationRef,
      });
    } catch (error) {
      console.error("Error updating booking status:", error);
      res.status(500).json({ error: "Failed to update booking status" });
    }
  }
);

/**
 * GET /api/transport-booking-options/:optionId
 *
 * Fetch details for a specific booking option
 */
router.get("/api/transport-booking-options/:optionId", async (req, res) => {
  try {
    const { optionId } = req.params;

    const option = await db.query.transportBookingOptions.findFirst({
      where: eq(transportBookingOptions.id, optionId),
    });

    if (!option) {
      return res.status(404).json({ error: "Booking option not found" });
    }

    res.json(option);
  } catch (error) {
    console.error("Error fetching booking option:", error);
    res.status(500).json({ error: "Failed to fetch booking option" });
  }
});

export default router;
