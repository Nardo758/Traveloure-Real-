/**
 * Corporate Coordination Service
 *
 * Handles group logistics for corporate events: staggered arrivals,
 * split activities, dietary/accessibility aggregation, and multi-track
 * scheduling where subgroups attend different sessions simultaneously.
 */

import { storage } from "../storage";
import { CoordinationService } from "./coordination.service";

const coordinationService = new CoordinationService();

export interface StaggeredArrivalPlan {
  tripId: string;
  date: string;
  groups: ArrivalGroup[];
  totalParticipants: number;
  registrationDuration: number; // minutes
  conflicts: string[];
}

interface ArrivalGroup {
  groupLabel: string;       // "Group A", "VIP", "Remote Team"
  participantCount: number;
  arrivalTime: string;
  registrationTime: string;
  readyBy: string;          // when this group is settled and ready
  notes: string;
}

export interface SplitActivityPlan {
  tripId: string;
  date: string;
  timeSlot: string; // "14:00-16:00"
  tracks: ActivityTrack[];
  totalCapacity: number;
  unassignedCount: number;
}

interface ActivityTrack {
  trackLabel: string;       // "Leadership Workshop", "Tech Deep-dive", "Wellness"
  location: string;
  capacity: number;
  assignedCount: number;
  facilitator: string | null;
  startTime: string;
  endTime: string;
}

export interface CorporateLogisticsSummary {
  tripId: string;
  participantStats: {
    total: number;
    confirmed: number;
    pending: number;
    responseRate: number;
  };
  dietarySummary: {
    restrictions: Array<{ name: string; count: number }>;
    accessibilityNeeds: Array<{ name: string; count: number }>;
  };
  arrivalPlan: StaggeredArrivalPlan | null;
  splitActivities: SplitActivityPlan[];
  warnings: string[];
}

/**
 * Generate a staggered arrival plan for a corporate event.
 * Spreads arrivals across time slots to prevent registration bottlenecks.
 */
export async function generateStaggeredArrivalPlan(
  tripId: string,
  date: string,
  options: {
    firstArrivalTime?: string;       // "08:00"
    registrationMinutes?: number;    // per-person registration time
    groupSize?: number;              // participants per wave
    gapBetweenGroups?: number;       // minutes between arrival waves
  } = {}
): Promise<StaggeredArrivalPlan> {
  const participants = await coordinationService.getParticipants(tripId);
  const confirmed = participants.filter(p => p.status === "confirmed" || p.status === "invited");

  const firstArrival = options.firstArrivalTime || "08:00";
  const regTime = options.registrationMinutes || 5;
  const groupSize = options.groupSize || Math.ceil(confirmed.length / 4);
  const gap = options.gapBetweenGroups || 15;
  const conflicts: string[] = [];

  // Check for anchor constraints
  const anchors = await storage.getTemporalAnchors(tripId);
  const meetingAnchor = anchors.find(a => a.anchorType === "meeting_time");

  let deadlineMinutes = 600; // 10:00 by default
  if (meetingAnchor) {
    const mt = new Date(meetingAnchor.anchorDatetime);
    deadlineMinutes = mt.getHours() * 60 + mt.getMinutes() - (meetingAnchor.bufferBefore || 15);
  }

  // Build groups
  const groups: ArrivalGroup[] = [];
  let currentMinutes = parseTimeMinutes(firstArrival);
  let remaining = confirmed.length;
  let groupIndex = 0;

  while (remaining > 0) {
    const count = Math.min(groupSize, remaining);
    const arrivalTime = minutesToTime(currentMinutes);
    const regDuration = count * regTime;
    const registrationTime = minutesToTime(currentMinutes + regDuration);
    const readyBy = minutesToTime(currentMinutes + regDuration + 5);

    if (currentMinutes + regDuration > deadlineMinutes) {
      conflicts.push(
        `Group ${String.fromCharCode(65 + groupIndex)} may not finish registration before the meeting start`
      );
    }

    groups.push({
      groupLabel: `Group ${String.fromCharCode(65 + groupIndex)}`,
      participantCount: count,
      arrivalTime,
      registrationTime,
      readyBy,
      notes: groupIndex === 0 ? "VIP / Speakers arrive first" : "",
    });

    remaining -= count;
    currentMinutes += regDuration + gap;
    groupIndex++;
  }

  const totalRegDuration = groups.length > 0
    ? parseTimeMinutes(groups[groups.length - 1].readyBy) - parseTimeMinutes(groups[0].arrivalTime)
    : 0;

  return {
    tripId,
    date,
    groups,
    totalParticipants: confirmed.length,
    registrationDuration: totalRegDuration,
    conflicts,
  };
}

/**
 * Generate a split activity plan for parallel breakout sessions.
 */
export async function generateSplitActivityPlan(
  tripId: string,
  date: string,
  tracks: Array<{
    label: string;
    location: string;
    capacity: number;
    facilitator?: string;
    startTime: string;
    endTime: string;
  }>
): Promise<SplitActivityPlan> {
  const participants = await coordinationService.getParticipants(tripId);
  const confirmed = participants.filter(p => p.status === "confirmed" || p.status === "invited");

  const totalCapacity = tracks.reduce((sum, t) => sum + t.capacity, 0);
  const unassigned = Math.max(0, confirmed.length - totalCapacity);

  // Find overall time slot
  const earliest = tracks.reduce((min, t) => t.startTime < min ? t.startTime : min, tracks[0]?.startTime || "14:00");
  const latest = tracks.reduce((max, t) => t.endTime > max ? t.endTime : max, tracks[0]?.endTime || "16:00");

  return {
    tripId,
    date,
    timeSlot: `${earliest}-${latest}`,
    tracks: tracks.map(t => ({
      trackLabel: t.label,
      location: t.location,
      capacity: t.capacity,
      assignedCount: 0, // Would be filled from participant preferences
      facilitator: t.facilitator || null,
      startTime: t.startTime,
      endTime: t.endTime,
    })),
    totalCapacity,
    unassignedCount: unassigned,
  };
}

/**
 * Get a full corporate logistics summary for the expert dashboard.
 */
export async function getCorporateLogisticsSummary(tripId: string): Promise<CorporateLogisticsSummary> {
  const stats = await coordinationService.getParticipantStats(tripId);
  const dietary = await coordinationService.getDietaryRequirements(tripId);
  const warnings: string[] = [];

  if (stats.responseRate < 80) {
    warnings.push(`Only ${stats.responseRate}% response rate. Consider sending reminders to ${stats.pending} pending invitees.`);
  }

  if (dietary.restrictions.length > 3) {
    warnings.push(`${dietary.restrictions.length} different dietary restrictions. Coordinate with caterer early.`);
  }

  if (dietary.accessibilityNeeds.length > 0) {
    warnings.push(`${dietary.accessibilityNeeds.reduce((s, a) => s + a.count, 0)} participant(s) with accessibility needs. Verify venue compliance.`);
  }

  // Check energy levels
  const energy = await storage.getEnergyTracking(tripId);
  const lowEnergyDays = energy.filter(e => (e.endingEnergy || 0) < 30);
  if (lowEnergyDays.length > 0) {
    warnings.push(`Day(s) ${lowEnergyDays.map(e => e.dayNumber).join(", ")} have low ending energy. Schedule lighter afternoon activities.`);
  }

  return {
    tripId,
    participantStats: {
      total: stats.total,
      confirmed: stats.confirmed,
      pending: stats.pending,
      responseRate: stats.responseRate,
    },
    dietarySummary: dietary,
    arrivalPlan: null, // Generated on demand
    splitActivities: [],
    warnings,
  };
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
