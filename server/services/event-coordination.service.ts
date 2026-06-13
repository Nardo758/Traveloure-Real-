/**
 * Event Coordination Service (Phase 4 / CON-A.P4).
 *
 * Generalized replacement for wedding-coordination.service.ts. Reads an event-type
 * profile from the DB (anchor + vendor matrix + sequencing) and builds timelines,
 * vendor gaps, and conflict detection for ANY event type — wedding, proposal,
 * birthday, corporate, etc. No per-event-type code paths.
 *
 * Gate: proposal/birthday/corporate run through the one service from data rows;
 * no per-type service files; coordinator mandatory on Event, absent on Experience.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  eventCoordinationProfiles,
  type EventCoordinationProfile,
} from "@shared/schema";
import { storage } from "../storage";
import type { TemporalAnchor, ExpertVendorCoordination } from "@shared/schema";

export interface EventTimelineBlock {
  key: string;
  label: string;
  startTime: string; // "HH:MM"
  endTime: string;
  vendorName: string | null;
  vendorStatus: string;
  isLocked: boolean;
  offsetFromAnchor: number; // minutes
  notes: string;
}

export interface EventTimelineConflict {
  blockA: string;
  blockB: string;
  type: "overlap" | "insufficient_gap" | "vendor_missing";
  severity: "warning" | "critical";
  description: string;
  suggestion: string;
}

export interface EventTimeline {
  anchorTime: string; // "HH:MM"
  anchorDate: string; // "YYYY-MM-DD"
  eventType: string;
  anchorType: string;
  blocks: EventTimelineBlock[];
  totalDuration: number; // minutes
  conflicts: EventTimelineConflict[];
}

export interface VendorGap {
  category: string;
  label: string;
  neededFrom: string;
  neededUntil: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
}

/**
 * Read the event-type profile from the DB. Returns null if the event type
 * has no active profile (e.g. Trip/Experience types).
 */
export async function getEventProfile(
  eventType: string
): Promise<EventCoordinationProfile | null> {
  const [row] = await db
    .select()
    .from(eventCoordinationProfiles)
    .where(
      and(
        eq(eventCoordinationProfiles.eventType, eventType),
        eq(eventCoordinationProfiles.isActive, true)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Build a timeline for ANY event type by reading its profile from the DB.
 * The profile defines the anchor type, sequencing blocks, and vendor matrix.
 */
export async function buildEventTimeline(
  tripId: string,
  eventType: string
): Promise<EventTimeline> {
  const profile = await getEventProfile(eventType);

  if (!profile) {
    return {
      anchorTime: "",
      anchorDate: "",
      eventType,
      anchorType: "",
      blocks: [],
      totalDuration: 0,
      conflicts: [
        {
          blockA: "",
          blockB: "",
          type: "vendor_missing",
          severity: "critical",
          description: `No coordination profile found for event type '${eventType}'.`,
          suggestion: "Contact support to configure this event type.",
        },
      ],
    };
  }

  const anchors = await storage.getTemporalAnchors(tripId);
  const vendors = await storage.getVendorCoordination(tripId);

  // Find the anchor (e.g. ceremony_time, proposal_moment, keynote_time)
  const anchor = anchors.find((a) => a.anchorType === profile.anchorType);
  if (!anchor) {
    return {
      anchorTime: "",
      anchorDate: "",
      eventType,
      anchorType: profile.anchorType,
      blocks: [],
      totalDuration: 0,
      conflicts: [
        {
          blockA: profile.anchorType,
          blockB: "",
          type: "vendor_missing",
          severity: "critical",
          description: `No ${profile.anchorType} anchor set. Add a temporal anchor first.`,
          suggestion: `Create a temporal anchor with type '${profile.anchorType}'`,
        },
      ],
    };
  }

  const anchorDt = new Date(anchor.anchorDatetime);
  const anchorDate = anchorDt.toISOString().slice(0, 10);
  const anchorMinutes = anchorDt.getHours() * 60 + anchorDt.getMinutes();
  const anchorTimeStr = anchorDt.toTimeString().slice(0, 5);

  const ruleset = (profile.sequencingRuleset ?? []) as Array<{
    key: string;
    label: string;
    offset: number;
    duration: number;
    isLocked: boolean;
  }>;

  const vendorMatrix = (profile.vendorMatrix ?? []) as Array<{
    category: string;
    required: boolean;
    priority: "critical" | "high" | "medium" | "low";
    label: string;
    blocks: string[];
  }>;

  // Build timeline blocks from the profile's sequencing ruleset
  const blocks: EventTimelineBlock[] = [];
  for (const rule of ruleset) {
    const startMinutes = anchorMinutes + rule.offset;
    const endMinutes = startMinutes + rule.duration;

    // Find assigned vendor for this block via the vendor matrix
    const relatedCategories = vendorMatrix
      .filter((v) => v.blocks.includes(rule.key))
      .map((v) => v.category);

    const assignedVendor = vendors.find(
      (v) =>
        relatedCategories.includes(v.vendorCategory) &&
        v.serviceDate === anchorDate
    );

    blocks.push({
      key: rule.key,
      label: rule.label,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes),
      vendorName: assignedVendor?.vendorName || null,
      vendorStatus: assignedVendor?.status || "unassigned",
      isLocked: rule.isLocked,
      offsetFromAnchor: rule.offset,
      notes: assignedVendor?.anchorConstraintNote || "",
    });
  }

  blocks.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const conflicts = detectConflicts(blocks, vendors, anchorDate, vendorMatrix);

  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  const totalDuration =
    first && last
      ? parseTimeMinutes(last.endTime) - parseTimeMinutes(first.startTime)
      : 0;

  return {
    anchorTime: anchorTimeStr,
    anchorDate,
    eventType,
    anchorType: profile.anchorType,
    blocks,
    totalDuration,
    conflicts,
  };
}

/**
 * Detect conflicts generically: overlaps, missing vendors, vendor timing mismatches.
 */
function detectConflicts(
  blocks: EventTimelineBlock[],
  vendors: ExpertVendorCoordination[],
  eventDate: string,
  vendorMatrix: Array<{
    category: string;
    required: boolean;
    priority: string;
    label: string;
    blocks: string[];
  }>
): EventTimelineConflict[] {
  const conflicts: EventTimelineConflict[] = [];

  // 1. Block overlaps
  for (let i = 0; i < blocks.length - 1; i++) {
    const current = blocks[i];
    const next = blocks[i + 1];
    if (current.endTime > next.startTime) {
      conflicts.push({
        blockA: current.label,
        blockB: next.label,
        type: "overlap",
        severity: "warning",
        description: `${current.label} (ends ${current.endTime}) overlaps with ${next.label} (starts ${next.startTime})`,
        suggestion: `Shorten ${current.label} or push ${next.label} later`,
      });
    }
  }

  // 2. Missing required vendors (from the profile's vendor matrix)
  const requiredVendors = vendorMatrix.filter((v) => v.required);
  for (const vendorDef of requiredVendors) {
    const hasVendor = vendors.some(
      (v) => v.vendorCategory === vendorDef.category && v.serviceDate === eventDate
    );
    if (!hasVendor) {
      const severity =
        vendorDef.priority === "critical" ? "critical" : "warning";
      conflicts.push({
        blockA: vendorDef.category,
        blockB: "",
        type: "vendor_missing",
        severity,
        description: `No ${vendorDef.label} assigned for ${eventDate}`,
        suggestion: `Find and assign a ${vendorDef.label} for the event day`,
      });
    }
  }

  // 3. Vendor timing vs their assigned blocks
  for (const vendor of vendors) {
    if (
      vendor.serviceDate !== eventDate ||
      !vendor.startTime ||
      !vendor.endTime
    )
      continue;

    const vendorDef = vendorMatrix.find(
      (v) => v.category === vendor.vendorCategory
    );
    if (!vendorDef) continue;

    const expectedBlockKeys = vendorDef.blocks;
    for (const blockKey of expectedBlockKeys) {
      const block = blocks.find((b) => b.key === blockKey);
      if (!block) continue;

      if (vendor.startTime > block.startTime || vendor.endTime < block.endTime) {
        const coversMismatch =
          vendor.startTime > block.startTime
            ? `arrives too late for ${block.label} (${block.startTime})`
            : `leaves too early for ${block.label} (ends ${block.endTime})`;

        conflicts.push({
          blockA: vendor.vendorName,
          blockB: block.label,
          type: "insufficient_gap",
          severity: "warning",
          description: `${vendor.vendorName} (${vendor.startTime}-${vendor.endTime}) ${coversMismatch}`,
          suggestion: `Extend ${vendor.vendorName}'s hours or adjust ${block.label} timing`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Get vendor assignment gaps for ANY event type by reading its profile.
 */
export async function getEventVendorGaps(
  tripId: string,
  eventType: string
): Promise<VendorGap[]> {
  const profile = await getEventProfile(eventType);
  if (!profile) return [];

  const timeline = await buildEventTimeline(tripId, eventType);
  const vendors = await storage.getVendorCoordination(tripId);
  const assignedCategories = new Set(vendors.map((v) => v.vendorCategory));

  const vendorMatrix = (profile.vendorMatrix ?? []) as Array<{
    category: string;
    required: boolean;
    priority: "critical" | "high" | "medium" | "low";
    label: string;
    blocks: string[];
  }>;

  const gaps: VendorGap[] = [];

  for (const vendorDef of vendorMatrix) {
    if (assignedCategories.has(vendorDef.category)) continue;

    const blocks = vendorDef.blocks
      .map((k) => timeline.blocks.find((b) => b.key === k))
      .filter(Boolean) as EventTimelineBlock[];

    if (blocks.length === 0) continue;

    const earliestStart = blocks.reduce(
      (min, b) => (b.startTime < min ? b.startTime : min),
      blocks[0].startTime
    );
    const latestEnd = blocks.reduce(
      (max, b) => (b.endTime > max ? b.endTime : max),
      blocks[0].endTime
    );

    gaps.push({
      category: vendorDef.category,
      label: vendorDef.label,
      neededFrom: earliestStart,
      neededUntil: latestEnd,
      priority: vendorDef.priority,
      reason: `Covers: ${blocks.map((b) => b.label).join(", ")}`,
    });
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  gaps.sort((a, b) => order[a.priority] - order[b.priority]);

  return gaps;
}

// ---- Helpers ----

function parseTimeMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, minutes);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
