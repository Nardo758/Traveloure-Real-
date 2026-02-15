/**
 * Provider Matching Service
 *
 * Finds the best available providers for a given time window, service type,
 * and location. Factors in: weekly schedule, blackout dates, existing bookings,
 * pricing modifiers, and preferred slots.
 */

import { db } from "../db";
import { storage } from "../storage";
import {
  providerAvailabilitySchedule,
  providerBlackoutDates,
  providerBookingRequests,
  providerServices,
  serviceProviderForms,
  users,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface ProviderMatchCriteria {
  date: string;           // "2026-03-15"
  startTime: string;      // "10:00"
  endTime: string;        // "14:00"
  serviceType?: string;   // "photographer", "caterer", etc.
  city?: string;
  country?: string;
  minRating?: number;
  maxPrice?: number;
  tripId?: string;        // to check for existing bookings
}

export interface MatchedProvider {
  providerId: string;
  displayName: string;
  availableFrom: string;
  availableUntil: string;
  pricingModifier: number;  // percentage +/- from base
  isPreferredSlot: boolean;
  preferredSlotLabel: string | null;
  existingBookingsOnDate: number;
  matchScore: number;       // 0-100
  matchReasons: string[];
}

export interface MatchResult {
  providers: MatchedProvider[];
  totalCandidates: number;
  filteredOut: {
    byBlackout: number;
    bySchedule: number;
    byExistingBookings: number;
  };
}

/**
 * Find providers matching the given criteria.
 */
export async function findMatchingProviders(
  criteria: ProviderMatchCriteria
): Promise<MatchResult> {
  const requestDate = new Date(criteria.date);
  const dayOfWeek = requestDate.getDay(); // 0=Sunday

  // 1. Get all provider schedules for this day of week
  const schedules = await db.select()
    .from(providerAvailabilitySchedule)
    .where(
      and(
        eq(providerAvailabilitySchedule.dayOfWeek, dayOfWeek),
        eq(providerAvailabilitySchedule.isAvailable, true)
      )
    );

  let filteredBySchedule = 0;
  let filteredByBlackout = 0;
  let filteredByBookings = 0;

  // 2. Filter by time window overlap
  const timeMatches = schedules.filter(s => {
    const covers = s.startTime <= criteria.startTime && s.endTime >= criteria.endTime;
    if (!covers) filteredBySchedule++;
    return covers;
  });

  // 3. Check blackout dates
  const allBlackouts = await db.select().from(providerBlackoutDates);
  const blackoutSet = new Set<string>();
  for (const b of allBlackouts) {
    if (criteria.date >= b.startDate && criteria.date <= b.endDate) {
      blackoutSet.add(b.providerId);
    }
  }

  const afterBlackouts = timeMatches.filter(s => {
    const blocked = blackoutSet.has(s.providerId);
    if (blocked) filteredByBlackout++;
    return !blocked;
  });

  // 4. Check existing bookings on this date to avoid overbooking
  const existingBookings = criteria.tripId
    ? await db.select().from(providerBookingRequests)
        .where(eq(providerBookingRequests.requestedDate, criteria.date))
    : [];

  const bookingCountByProvider = new Map<string, number>();
  for (const booking of existingBookings) {
    if (booking.status !== "declined") {
      bookingCountByProvider.set(
        booking.providerId,
        (bookingCountByProvider.get(booking.providerId) || 0) + 1
      );
    }
  }

  // 5. Build matched provider results with scoring
  const matched: MatchedProvider[] = [];

  for (const schedule of afterBlackouts) {
    const bookingCount = bookingCountByProvider.get(schedule.providerId) || 0;

    // Check for time conflict with existing bookings
    const hasTimeConflict = existingBookings.some(b =>
      b.providerId === schedule.providerId &&
      b.status !== "declined" &&
      b.requestedStartTime < criteria.endTime &&
      b.requestedEndTime > criteria.startTime
    );

    if (hasTimeConflict) {
      filteredByBookings++;
      continue;
    }

    // Check preferred slots
    const preferredSlots = (schedule.preferredSlots as any[]) || [];
    const matchingSlot = preferredSlots.find(slot =>
      slot.startTime <= criteria.startTime &&
      slot.endTime >= criteria.endTime &&
      slot.isPreferred
    );

    // Calculate match score (0-100)
    let score = 50; // base
    const reasons: string[] = [];

    if (matchingSlot) {
      score += 20;
      reasons.push(`Preferred slot: ${matchingSlot.label}`);
    }

    if (bookingCount === 0) {
      score += 15;
      reasons.push("No other bookings on this date");
    } else if (bookingCount <= 2) {
      score += 5;
      reasons.push(`${bookingCount} other booking(s) on this date`);
    }

    const modifier = schedule.pricingModifier || 0;
    if (modifier < 0) {
      score += 10;
      reasons.push(`${modifier}% pricing discount`);
    } else if (modifier > 20) {
      score -= 10;
      reasons.push(`${modifier}% peak pricing`);
    }

    matched.push({
      providerId: schedule.providerId,
      displayName: schedule.providerId, // Will be enriched with user data
      availableFrom: schedule.startTime,
      availableUntil: schedule.endTime,
      pricingModifier: modifier,
      isPreferredSlot: !!matchingSlot,
      preferredSlotLabel: matchingSlot?.label || null,
      existingBookingsOnDate: bookingCount,
      matchScore: Math.max(0, Math.min(100, score)),
      matchReasons: reasons,
    });
  }

  // Sort by score descending
  matched.sort((a, b) => b.matchScore - a.matchScore);

  return {
    providers: matched,
    totalCandidates: schedules.length,
    filteredOut: {
      bySchedule: filteredBySchedule,
      byBlackout: filteredByBlackout,
      byExistingBookings: filteredByBookings,
    },
  };
}

/**
 * Build the full context payload that gets sent to a provider with a booking request.
 * This is the "constraint-aware booking context" from the three-party model.
 */
export async function buildBookingContext(
  tripId: string,
  requestedDate: string,
  requestedStartTime: string,
  requestedEndTime: string
): Promise<{
  clientContext: Record<string, any>;
  anchorConstraints: Array<{ anchorType: string; time: string; constraint: string }>;
}> {
  const anchors = await storage.getTemporalAnchors(tripId);
  const energy = await storage.getEnergyTracking(tripId);
  const boundaries = await storage.getDayBoundaries(tripId);
  const trip = await storage.getTrip(tripId);

  // Find day number for the requested date
  let dayNumber = 1;
  if (trip?.startDate) {
    const start = new Date(trip.startDate);
    const req = new Date(requestedDate);
    dayNumber = Math.floor((req.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  }

  // Energy for this day
  const dayEnergy = energy.find(e => e.dayNumber === dayNumber);
  const dayBoundary = boundaries.find(b => b.dayNumber === dayNumber);

  // Anchors on this same date
  const sameDayAnchors = anchors.filter(a => {
    const anchorDate = new Date(a.anchorDatetime).toISOString().slice(0, 10);
    return anchorDate === requestedDate;
  });

  // Find what's before and after this time slot
  const sortedAnchors = sameDayAnchors
    .map(a => ({ ...a, time: new Date(a.anchorDatetime).toTimeString().slice(0, 5) }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const priorActivity = sortedAnchors
    .filter(a => a.time < requestedStartTime)
    .pop();

  const nextActivity = sortedAnchors
    .find(a => a.time > requestedEndTime);

  // Build anchor constraint list
  const anchorConstraints = sameDayAnchors.map(a => {
    const time = new Date(a.anchorDatetime).toTimeString().slice(0, 5);
    let constraint = "";
    if (a.isImmovable) {
      constraint = `IMMOVABLE: ${a.anchorType.replace(/_/g, " ")} at ${time}`;
    } else {
      constraint = `${a.anchorType.replace(/_/g, " ")} at ${time}`;
    }
    if (a.bufferBefore && Number(a.bufferBefore) > 0) {
      constraint += ` (${a.bufferBefore}min buffer before)`;
    }
    return {
      anchorType: a.anchorType,
      time,
      constraint,
    };
  });

  return {
    clientContext: {
      tripDay: dayNumber,
      energyLevel: dayEnergy
        ? (dayEnergy.startingEnergy || 0) >= 70 ? "high"
        : (dayEnergy.startingEnergy || 0) >= 40 ? "medium" : "low"
        : "unknown",
      priorActivity: priorActivity
        ? `${priorActivity.anchorType.replace(/_/g, " ")} at ${priorActivity.time}` : null,
      nextActivity: nextActivity
        ? `${nextActivity.anchorType.replace(/_/g, " ")} at ${nextActivity.time}` : null,
      clientAvailableFrom: dayBoundary?.earliestActivityStart || "08:00",
      clientAvailableUntil: dayBoundary?.latestActivityEnd || "22:00",
      dietaryRestrictions: [],
      mobilityLevel: "standard",
      specialNotes: "",
    },
    anchorConstraints,
  };
}
