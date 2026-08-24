/**
 * Constraint Propagation Service
 *
 * When a temporal anchor changes (e.g., ceremony time moves from 4PM to 3PM),
 * this service cascades the change to all affected vendors, bookings, and
 * participant schedules. Implements the "constraint flow" pattern:
 * Traveler constraints → Expert sees impact → Provider gets updated context.
 */

import { storage } from "../storage";
import type { TemporalAnchor, ExpertVendorCoordination, ProviderBookingRequest } from "@shared/schema";

export interface PropagationResult {
  anchorId: string;
  anchorType: string;
  affectedVendors: AffectedVendor[];
  affectedBookings: AffectedBooking[];
  conflicts: PropagationConflict[];
  suggestions: string[];
}

interface AffectedVendor {
  vendorId: string;
  vendorName: string;
  vendorCategory: string;
  currentArrival: string | null;
  suggestedArrival: string | null;
  currentStart: string | null;
  suggestedStart: string | null;
  impactLevel: "none" | "minor" | "major" | "critical";
  reason: string;
}

interface AffectedBooking {
  bookingId: string;
  providerId: string;
  serviceType: string;
  currentTime: string;
  suggestedTime: string;
  status: string;
  impactLevel: "none" | "minor" | "major" | "critical";
  reason: string;
}

export interface PropagationConflict {
  type: "vendor_overlap" | "provider_unavailable" | "insufficient_buffer" | "energy_exceeded";
  severity: "warning" | "critical";
  description: string;
  vendorId?: string;
  bookingId?: string;
  suggestedResolution: string;
}

/**
 * Propagate an anchor change to all downstream vendors and bookings.
 * Call this when a temporal anchor is created, updated, or deleted.
 */
export async function propagateAnchorChange(
  tripId: string,
  changedAnchorId: string,
  previousDatetime?: string
): Promise<PropagationResult> {
  const anchors = await storage.getTemporalAnchors(tripId);
  const vendors = await storage.getVendorCoordination(tripId);
  const bookings = await storage.getBookingRequestsByTrip(tripId);

  const changedAnchor = anchors.find(a => a.id === changedAnchorId);
  if (!changedAnchor) {
    return {
      anchorId: changedAnchorId,
      anchorType: "unknown",
      affectedVendors: [],
      affectedBookings: [],
      conflicts: [],
      suggestions: ["Anchor not found — it may have been deleted."],
    };
  }

  const affectedVendors = analyzeVendorImpact(changedAnchor, vendors, previousDatetime);
  const affectedBookings = analyzeBookingImpact(changedAnchor, bookings, previousDatetime);
  const conflicts = detectPropagationConflicts(changedAnchor, anchors, vendors, bookings);
  const suggestions = generatePropagationSuggestions(changedAnchor, affectedVendors, affectedBookings, conflicts);

  return {
    anchorId: changedAnchorId,
    anchorType: changedAnchor.anchorType,
    affectedVendors,
    affectedBookings,
    conflicts,
    suggestions,
  };
}

/**
 * Analyze how a changed anchor affects coordinated vendors.
 */
function analyzeVendorImpact(
  anchor: TemporalAnchor,
  vendors: ExpertVendorCoordination[],
  previousDatetime?: string
): AffectedVendor[] {
  const anchorTime = new Date(anchor.anchorDatetime);
  const anchorTimeStr = anchorTime.toTimeString().slice(0, 5);
  const bufferBefore = anchor.bufferBefore || 0;

  // Only vendors linked to this anchor or on the same date
  const anchorDate = anchorTime.toISOString().slice(0, 10);
  const relatedVendors = vendors.filter(v =>
    v.primaryAnchorId === anchor.id || v.serviceDate === anchorDate
  );

  return relatedVendors.map(vendor => {
    let impactLevel: "none" | "minor" | "major" | "critical" = "none";
    let reason = "";
    let suggestedArrival = vendor.arrivalTime;
    let suggestedStart = vendor.startTime;

    if (vendor.primaryAnchorId === anchor.id) {
      // This vendor is directly linked to the changed anchor
      // Calculate suggested times based on anchor + buffer
      const anchorMinutes = anchorTime.getHours() * 60 + anchorTime.getMinutes();
      const vendorMustEndBy = anchorMinutes - bufferBefore;

      if (vendor.endTime) {
        const [endH, endM] = vendor.endTime.split(":").map(Number);
        const vendorEndMinutes = endH * 60 + endM;

        if (vendorEndMinutes > vendorMustEndBy) {
          impactLevel = "critical";
          const suggestedEndMinutes = vendorMustEndBy;
          const duration = vendor.startTime && vendor.endTime
            ? parseTimeMinutes(vendor.endTime) - parseTimeMinutes(vendor.startTime)
            : 0;

          suggestedStart = minutesToTime(suggestedEndMinutes - duration);
          suggestedArrival = minutesToTime(suggestedEndMinutes - duration - 30);
          reason = `Must finish ${bufferBefore}min before ${anchor.anchorType.replace(/_/g, " ")} at ${anchorTimeStr}`;
        } else {
          impactLevel = "none";
          reason = "Current schedule is compatible with anchor timing";
        }
      } else {
        impactLevel = "minor";
        reason = "No end time set — verify vendor will finish before anchor";
      }
    } else {
      // Same-day vendor, check for time overlaps
      if (vendor.startTime && vendor.endTime) {
        const vendorStart = parseTimeMinutes(vendor.startTime);
        const vendorEnd = parseTimeMinutes(vendor.endTime);
        const anchorStart = parseTimeMinutes(anchorTimeStr) - bufferBefore;
        const anchorEnd = parseTimeMinutes(anchorTimeStr) + (anchor.bufferAfter || 0);

        if (vendorStart < anchorEnd && vendorEnd > anchorStart) {
          impactLevel = "major";
          reason = `Time overlaps with ${anchor.anchorType.replace(/_/g, " ")} window (${minutesToTime(anchorStart)}-${minutesToTime(anchorEnd)})`;
        }
      }
    }

    return {
      vendorId: vendor.id,
      vendorName: vendor.vendorName,
      vendorCategory: vendor.vendorCategory,
      currentArrival: vendor.arrivalTime,
      suggestedArrival: impactLevel !== "none" ? suggestedArrival : null,
      currentStart: vendor.startTime,
      suggestedStart: impactLevel !== "none" ? suggestedStart : null,
      impactLevel,
      reason,
    };
  });
}

/**
 * Analyze how a changed anchor affects active booking requests.
 */
function analyzeBookingImpact(
  anchor: TemporalAnchor,
  bookings: ProviderBookingRequest[],
  previousDatetime?: string
): AffectedBooking[] {
  const anchorTime = new Date(anchor.anchorDatetime);
  const anchorDate = anchorTime.toISOString().slice(0, 10);
  const anchorTimeStr = anchorTime.toTimeString().slice(0, 5);
  const bufferBefore = anchor.bufferBefore || 0;

  // Only active bookings on the same date
  const sameDay = bookings.filter(b =>
    b.requestedDate === anchorDate && b.status !== "declined"
  );

  return sameDay.map(booking => {
    const bookingStart = parseTimeMinutes(booking.requestedStartTime);
    const bookingEnd = parseTimeMinutes(booking.requestedEndTime);
    const anchorStartWindow = parseTimeMinutes(anchorTimeStr) - bufferBefore;
    const anchorEndWindow = parseTimeMinutes(anchorTimeStr) + (anchor.bufferAfter || 0);

    let impactLevel: "none" | "minor" | "major" | "critical" = "none";
    let reason = "";
    let suggestedTime = booking.requestedStartTime;

    if (bookingStart < anchorEndWindow && bookingEnd > anchorStartWindow) {
      // Overlap
      const duration = bookingEnd - bookingStart;
      if (bookingEnd > anchorStartWindow && bookingStart < anchorStartWindow) {
        // Booking runs into anchor window — needs to end earlier
        impactLevel = "major";
        const newEnd = anchorStartWindow;
        const newStart = Math.max(newEnd - duration, 480); // not before 8am
        suggestedTime = minutesToTime(newStart);
        reason = `Runs into ${anchor.anchorType.replace(/_/g, " ")} buffer. Move to ${suggestedTime}-${minutesToTime(newEnd)}`;
      } else {
        // Booking is within anchor window
        impactLevel = "critical";
        const newStart = anchorEndWindow;
        suggestedTime = minutesToTime(newStart);
        reason = `Directly conflicts with ${anchor.anchorType.replace(/_/g, " ")}. Suggest moving to ${suggestedTime}`;
      }
    }

    return {
      bookingId: booking.id,
      providerId: booking.providerId,
      serviceType: booking.serviceType,
      currentTime: `${booking.requestedStartTime}-${booking.requestedEndTime}`,
      suggestedTime,
      status: booking.status || "pending",
      impactLevel,
      reason,
    };
  });
}

/**
 * Detect conflicts that arise from the propagation.
 */
function detectPropagationConflicts(
  changedAnchor: TemporalAnchor,
  allAnchors: TemporalAnchor[],
  vendors: ExpertVendorCoordination[],
  bookings: ProviderBookingRequest[]
): PropagationConflict[] {
  const conflicts: PropagationConflict[] = [];
  const anchorTime = new Date(changedAnchor.anchorDatetime);
  const anchorDate = anchorTime.toISOString().slice(0, 10);
  const anchorTimeStr = anchorTime.toTimeString().slice(0, 5);

  // Check anchor-to-anchor conflicts (same day)
  const sameDayAnchors = allAnchors.filter(a => {
    const d = new Date(a.anchorDatetime).toISOString().slice(0, 10);
    return d === anchorDate && a.id !== changedAnchor.id;
  });

  for (const other of sameDayAnchors) {
    const otherTime = new Date(other.anchorDatetime);
    const diffMinutes = Math.abs(anchorTime.getTime() - otherTime.getTime()) / 60000;
    const requiredGap = (changedAnchor.bufferAfter || 0) + (other.bufferBefore || 0);

    if (diffMinutes < requiredGap && anchorTime < otherTime) {
      conflicts.push({
        type: "insufficient_buffer",
        severity: "warning",
        description: `Only ${Math.round(diffMinutes)}min between ${changedAnchor.anchorType.replace(/_/g, " ")} and ${other.anchorType.replace(/_/g, " ")} (need ${requiredGap}min)`,
        suggestedResolution: `Add ${requiredGap - Math.round(diffMinutes)} more minutes between these events`,
      });
    }
  }

  // Check vendor-to-vendor overlaps (same day)
  const sameDayVendors = vendors.filter(v => v.serviceDate === anchorDate);
  for (let i = 0; i < sameDayVendors.length; i++) {
    for (let j = i + 1; j < sameDayVendors.length; j++) {
      const a = sameDayVendors[i];
      const b = sameDayVendors[j];
      if (a.startTime && a.endTime && b.startTime && b.endTime) {
        if (a.startTime < b.endTime && a.endTime > b.startTime) {
          conflicts.push({
            type: "vendor_overlap",
            severity: "warning",
            description: `${a.vendorName} (${a.startTime}-${a.endTime}) overlaps with ${b.vendorName} (${b.startTime}-${b.endTime})`,
            vendorId: a.id,
            suggestedResolution: `Adjust ${a.vendorName} or ${b.vendorName} timing to remove overlap`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Generate human-readable suggestions for the expert.
 */
function generatePropagationSuggestions(
  anchor: TemporalAnchor,
  affectedVendors: AffectedVendor[],
  affectedBookings: AffectedBooking[],
  conflicts: PropagationConflict[]
): string[] {
  const suggestions: string[] = [];

  const criticalVendors = affectedVendors.filter(v => v.impactLevel === "critical");
  const majorVendors = affectedVendors.filter(v => v.impactLevel === "major");
  const criticalBookings = affectedBookings.filter(b => b.impactLevel === "critical");

  if (criticalVendors.length > 0) {
    suggestions.push(
      `${criticalVendors.length} vendor(s) need immediate rescheduling: ${criticalVendors.map(v => v.vendorName).join(", ")}`
    );
  }

  if (majorVendors.length > 0) {
    suggestions.push(
      `${majorVendors.length} vendor(s) have time overlaps that should be reviewed: ${majorVendors.map(v => v.vendorName).join(", ")}`
    );
  }

  if (criticalBookings.length > 0) {
    suggestions.push(
      `${criticalBookings.length} booking request(s) conflict with the new timing. Send updated requests to providers.`
    );
  }

  if (conflicts.length === 0 && criticalVendors.length === 0 && criticalBookings.length === 0) {
    suggestions.push("No conflicts detected. All vendors and bookings are compatible with this anchor change.");
  }

  return suggestions;
}

// ---- Helpers ----

function parseTimeMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(Math.max(0, minutes) / 60);
  const m = Math.max(0, minutes) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
