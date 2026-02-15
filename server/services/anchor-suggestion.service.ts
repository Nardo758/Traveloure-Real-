/**
 * Anchor Suggestion Service
 *
 * Uses AI to suggest optimal temporal anchor configurations
 * based on destination, trip type, and existing bookings.
 * Provides smart defaults and conflict warnings.
 */

import { storage } from "../storage";
import type { TemporalAnchor } from "@shared/schema";

interface AnchorSuggestion {
  anchorType: string;
  suggestedTime: string; // "HH:MM"
  suggestedDayNumber: number;
  bufferBefore: number;
  bufferAfter: number;
  reason: string;
  confidence: "high" | "medium" | "low";
  source: "template" | "destination" | "booking" | "ai";
}

interface SuggestionContext {
  tripId: string;
  destination: string;
  templateSlug: string;
  startDate: string;
  endDate: string;
  numberOfDays: number;
}

/**
 * Generate smart anchor suggestions based on trip context.
 * Combines template defaults, destination intelligence, and existing data.
 */
export async function generateAnchorSuggestions(
  context: SuggestionContext
): Promise<AnchorSuggestion[]> {
  const suggestions: AnchorSuggestion[] = [];
  const existingAnchors = await storage.getTemporalAnchors(context.tripId);

  // 1. Destination-aware flight buffer suggestions
  suggestions.push(...getFlightBufferSuggestions(context, existingAnchors));

  // 2. Template-aware ceremony/event suggestions
  suggestions.push(...getTemplateTimingSuggestions(context, existingAnchors));

  // 3. Energy-based day structure suggestions
  suggestions.push(...getEnergyStructureSuggestions(context));

  // Filter out suggestions that conflict with existing anchors
  return suggestions.filter(s => {
    return !existingAnchors.some(a =>
      a.anchorType === s.anchorType &&
      Math.abs(getDayNumber(a.anchorDatetime, context.startDate) - s.suggestedDayNumber) === 0
    );
  });
}

function getDayNumber(datetime: string | Date, tripStart: string): number {
  const dt = new Date(datetime);
  const start = new Date(tripStart);
  start.setHours(0, 0, 0, 0);
  return Math.floor((dt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function getFlightBufferSuggestions(
  context: SuggestionContext,
  existing: TemporalAnchor[]
): AnchorSuggestion[] {
  const suggestions: AnchorSuggestion[] = [];
  const hasArrivalFlight = existing.some(a => a.anchorType === "flight_arrival");
  const hasDepartureFlight = existing.some(a => a.anchorType === "flight_departure");

  if (!hasArrivalFlight) {
    suggestions.push({
      anchorType: "flight_arrival",
      suggestedTime: "14:00",
      suggestedDayNumber: 1,
      bufferBefore: 0,
      bufferAfter: 120,
      reason: "Afternoon arrivals give time for customs, baggage, and transit to accommodation. 2-hour buffer covers immigration and transport.",
      confidence: "medium",
      source: "destination",
    });
  }

  if (!hasDepartureFlight && context.numberOfDays > 1) {
    suggestions.push({
      anchorType: "flight_departure",
      suggestedTime: "16:00",
      suggestedDayNumber: context.numberOfDays,
      bufferBefore: 180,
      bufferAfter: 0,
      reason: "Late afternoon departure allows a relaxed final morning. 3-hour buffer covers check-out, transit, and airport security.",
      confidence: "medium",
      source: "destination",
    });
  }

  if (!existing.some(a => a.anchorType === "hotel_checkin")) {
    suggestions.push({
      anchorType: "hotel_checkin",
      suggestedTime: "15:00",
      suggestedDayNumber: 1,
      bufferBefore: 0,
      bufferAfter: 60,
      reason: "Standard hotel check-in time. 1-hour buffer for settling in and freshening up.",
      confidence: "high",
      source: "template",
    });
  }

  return suggestions;
}

function getTemplateTimingSuggestions(
  context: SuggestionContext,
  existing: TemporalAnchor[]
): AnchorSuggestion[] {
  const suggestions: AnchorSuggestion[] = [];

  if (context.templateSlug === "wedding") {
    if (!existing.some(a => a.anchorType === "ceremony_time")) {
      suggestions.push({
        anchorType: "ceremony_time",
        suggestedTime: "15:00",
        suggestedDayNumber: Math.ceil(context.numberOfDays / 2),
        bufferBefore: 120,
        bufferAfter: 60,
        reason: "Mid-afternoon ceremonies offer the best natural lighting for photography and give the morning for preparation.",
        confidence: "high",
        source: "template",
      });
    }

    if (!existing.some(a => a.anchorType === "hair_makeup_start")) {
      suggestions.push({
        anchorType: "hair_makeup_start",
        suggestedTime: "08:00",
        suggestedDayNumber: Math.ceil(context.numberOfDays / 2),
        bufferBefore: 30,
        bufferAfter: 180,
        reason: "Hair and makeup typically take 2-3 hours. Starting at 8 AM ensures plenty of time before a mid-afternoon ceremony.",
        confidence: "high",
        source: "template",
      });
    }
  }

  if (context.templateSlug === "proposal") {
    if (!existing.some(a => a.anchorType === "proposal_moment")) {
      suggestions.push({
        anchorType: "proposal_moment",
        suggestedTime: "20:30",
        suggestedDayNumber: context.numberOfDays > 1 ? 2 : 1,
        bufferBefore: 60,
        bufferAfter: 60,
        reason: "Evening proposals after dinner create romantic ambiance. Golden hour or twilight adds to the atmosphere.",
        confidence: "medium",
        source: "template",
      });
    }
  }

  if (context.templateSlug === "corporate") {
    if (!existing.some(a => a.anchorType === "meeting_time")) {
      suggestions.push({
        anchorType: "meeting_time",
        suggestedTime: "09:00",
        suggestedDayNumber: 1,
        bufferBefore: 30,
        bufferAfter: 15,
        reason: "9 AM start allows attendees to settle in. Morning sessions leverage peak cognitive performance.",
        confidence: "high",
        source: "template",
      });
    }
  }

  return suggestions;
}

function getEnergyStructureSuggestions(
  context: SuggestionContext
): AnchorSuggestion[] {
  const suggestions: AnchorSuggestion[] = [];

  // For multi-day trips, suggest a rest day mid-trip
  if (context.numberOfDays >= 5) {
    const restDay = Math.ceil(context.numberOfDays / 2);
    suggestions.push({
      anchorType: "custom",
      suggestedTime: "10:00",
      suggestedDayNumber: restDay,
      bufferBefore: 0,
      bufferAfter: 120,
      reason: `Day ${restDay} is mid-trip. A late start and lighter schedule prevents cumulative fatigue for the second half.`,
      confidence: "medium",
      source: "ai",
    });
  }

  // For trips 3+ days, suggest dinner reservations on key nights
  if (context.numberOfDays >= 3) {
    suggestions.push({
      anchorType: "dinner_reservation",
      suggestedTime: "19:30",
      suggestedDayNumber: 1,
      bufferBefore: 30,
      bufferAfter: 90,
      reason: "First night dinner reservation ensures a memorable start. Book in advance for popular destinations.",
      confidence: "medium",
      source: "ai",
    });
  }

  return suggestions;
}

/**
 * Analyze an existing set of anchors and return optimization tips.
 */
export async function analyzeAnchorOptimization(
  tripId: string
): Promise<Array<{ tip: string; severity: "info" | "warning" | "critical" }>> {
  const anchors = await storage.getTemporalAnchors(tripId);
  const boundaries = await storage.getDayBoundaries(tripId);
  const tips: Array<{ tip: string; severity: "info" | "warning" | "critical" }> = [];

  if (anchors.length === 0) {
    tips.push({
      tip: "No temporal anchors set. Add flights, reservations, or key events to enable smart scheduling.",
      severity: "info",
    });
    return tips;
  }

  // Check for days with too many anchors
  const dayCount: Record<number, number> = {};
  for (const anchor of anchors) {
    const day = getDayNumber(anchor.anchorDatetime, anchors[0].createdAt?.toString() || new Date().toISOString());
    dayCount[day] = (dayCount[day] || 0) + 1;
  }
  for (const [day, count] of Object.entries(dayCount)) {
    if (count > 4) {
      tips.push({
        tip: `Day ${day} has ${count} anchors — this may leave very little free time. Consider spreading activities across days.`,
        severity: "warning",
      });
    }
  }

  // Check for missing buffers on flight anchors
  for (const anchor of anchors) {
    if (anchor.anchorType === "flight_departure" && (anchor.bufferBefore || 0) < 120) {
      tips.push({
        tip: `Departure flight buffer is only ${anchor.bufferBefore || 0} minutes. Consider at least 120 minutes for airport transit and security.`,
        severity: "warning",
      });
    }
    if (anchor.anchorType === "flight_arrival" && (anchor.bufferAfter || 0) < 60) {
      tips.push({
        tip: `Arrival flight buffer is only ${anchor.bufferAfter || 0} minutes. Consider at least 60 minutes for baggage and transit.`,
        severity: "info",
      });
    }
  }

  // Check if boundaries cover all days with anchors
  const anchorDays = new Set(Object.keys(dayCount).map(Number));
  const boundaryDays = new Set(boundaries.map(b => b.dayNumber));
  for (const day of Array.from(anchorDays)) {
    if (!boundaryDays.has(day)) {
      tips.push({
        tip: `Day ${day} has anchors but no day boundary set. Consider adding latest-end-time constraints.`,
        severity: "info",
      });
    }
  }

  return tips;
}
