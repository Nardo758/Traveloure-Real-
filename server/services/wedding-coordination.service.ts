/**
 * Wedding Coordination Service
 *
 * Ceremony-aware vendor scheduling for weddings. The ceremony time is the
 * primary immovable anchor — everything schedules around it.
 *
 * Timeline pattern:
 *   Hair/Makeup → First Look Photos → Ceremony → Cocktail Hour → Reception → Send-off
 *
 * Each vendor category has known timing relationships to the ceremony anchor.
 */

import { storage } from "../storage";
import type { TemporalAnchor, ExpertVendorCoordination } from "@shared/schema";

export interface WeddingTimeline {
  ceremonyTime: string; // "15:00"
  ceremonyDate: string; // "2026-06-15"
  blocks: TimelineBlock[];
  totalDuration: number; // minutes from first to last event
  conflicts: TimelineConflict[];
}

interface TimelineBlock {
  label: string;
  category: string;
  startTime: string;
  endTime: string;
  vendorName: string | null;
  vendorStatus: string;
  isLocked: boolean;    // immovable anchor
  offsetFromCeremony: number; // minutes (negative = before ceremony)
  notes: string;
}

interface TimelineConflict {
  blockA: string;
  blockB: string;
  type: "overlap" | "insufficient_gap" | "vendor_missing";
  severity: "warning" | "critical";
  description: string;
  suggestion: string;
}

// Default offsets from ceremony time (in minutes)
const WEDDING_BLOCK_DEFAULTS: Record<string, { offset: number; duration: number; label: string }> = {
  hair_makeup:      { offset: -420, duration: 180, label: "Hair & Makeup" },       // 7hrs before
  getting_ready:    { offset: -240, duration: 60,  label: "Getting Ready" },        // 4hrs before
  first_look:       { offset: -180, duration: 30,  label: "First Look Photos" },    // 3hrs before
  bridal_portraits: { offset: -150, duration: 60,  label: "Bridal Portraits" },     // 2.5hrs before
  guest_arrival:    { offset: -30,  duration: 30,  label: "Guest Arrival" },        // 30min before
  ceremony:         { offset: 0,    duration: 30,  label: "Ceremony" },             // anchor
  cocktail_hour:    { offset: 30,   duration: 60,  label: "Cocktail Hour" },        // right after
  reception_start:  { offset: 90,   duration: 30,  label: "Grand Entrance" },       // 1.5hrs after
  dinner:           { offset: 120,  duration: 90,  label: "Dinner" },               // 2hrs after
  speeches:         { offset: 210,  duration: 30,  label: "Speeches & Toasts" },    // 3.5hrs after
  first_dance:      { offset: 240,  duration: 15,  label: "First Dance" },          // 4hrs after
  cake_cutting:     { offset: 255,  duration: 15,  label: "Cake Cutting" },         // 4.25hrs after
  dancing:          { offset: 270,  duration: 120, label: "Dancing & Party" },      // 4.5hrs after
  send_off:         { offset: 390,  duration: 15,  label: "Send-off" },             // 6.5hrs after
};

// Vendor categories mapped to timeline blocks
const VENDOR_TO_BLOCK: Record<string, string[]> = {
  photographer:    ["first_look", "bridal_portraits", "ceremony", "reception_start"],
  videographer:    ["ceremony", "reception_start", "first_dance"],
  florist:         ["ceremony", "reception_start"],
  caterer:         ["cocktail_hour", "dinner"],
  dj_band:         ["cocktail_hour", "reception_start", "dancing"],
  hair_makeup:     ["hair_makeup"],
  officiant:       ["ceremony"],
  cake_bakery:     ["cake_cutting"],
  transportation:  ["guest_arrival", "send_off"],
  coordinator:     ["hair_makeup", "ceremony", "reception_start", "send_off"],
  entertainment:   ["cocktail_hour", "dancing"],
  av_tech:         ["ceremony", "reception_start", "speeches"],
};

/**
 * Build a complete ceremony-anchored wedding timeline.
 */
export async function buildWeddingTimeline(tripId: string): Promise<WeddingTimeline> {
  const anchors = await storage.getTemporalAnchors(tripId);
  const vendors = await storage.getVendorCoordination(tripId);

  // Find the ceremony anchor
  const ceremonyAnchor = anchors.find(a => a.anchorType === "ceremony_time");
  if (!ceremonyAnchor) {
    return {
      ceremonyTime: "15:00",
      ceremonyDate: "",
      blocks: [],
      totalDuration: 0,
      conflicts: [
        {
          blockA: "ceremony",
          blockB: "",
          type: "vendor_missing",
          severity: "critical",
          description: "No ceremony time anchor set. Add a ceremony_time anchor first.",
          suggestion: "Create a temporal anchor with type 'ceremony_time'",
        },
      ],
    };
  }

  const ceremonyDt = new Date(ceremonyAnchor.anchorDatetime);
  const ceremonyDate = ceremonyDt.toISOString().slice(0, 10);
  const ceremonyMinutes = ceremonyDt.getHours() * 60 + ceremonyDt.getMinutes();
  const ceremonyTimeStr = ceremonyDt.toTimeString().slice(0, 5);

  // Build timeline blocks from defaults, adjusted to ceremony time
  const blocks: TimelineBlock[] = [];

  for (const [key, def] of Object.entries(WEDDING_BLOCK_DEFAULTS)) {
    const startMinutes = ceremonyMinutes + def.offset;
    const endMinutes = startMinutes + def.duration;

    // Find assigned vendor for this block
    const relatedCategories = Object.entries(VENDOR_TO_BLOCK)
      .filter(([, blockKeys]) => blockKeys.includes(key))
      .map(([cat]) => cat);

    const assignedVendor = vendors.find(v =>
      relatedCategories.includes(v.vendorCategory) && v.serviceDate === ceremonyDate
    );

    blocks.push({
      label: def.label,
      category: key,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes),
      vendorName: assignedVendor?.vendorName || null,
      vendorStatus: assignedVendor?.status || "unassigned",
      isLocked: key === "ceremony",
      offsetFromCeremony: def.offset,
      notes: assignedVendor?.anchorConstraintNote || "",
    });
  }

  // Sort by start time
  blocks.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Detect conflicts
  const conflicts = detectWeddingConflicts(blocks, vendors, ceremonyDate);

  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  const totalDuration = first && last
    ? parseTimeMinutes(last.endTime) - parseTimeMinutes(first.startTime)
    : 0;

  return {
    ceremonyTime: ceremonyTimeStr,
    ceremonyDate,
    blocks,
    totalDuration,
    conflicts,
  };
}

function detectWeddingConflicts(
  blocks: TimelineBlock[],
  vendors: ExpertVendorCoordination[],
  weddingDate: string
): TimelineConflict[] {
  const conflicts: TimelineConflict[] = [];

  // Check for block overlaps
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

  // Check for critical vendor gaps
  const criticalCategories = ["photographer", "officiant", "caterer", "coordinator"];
  for (const cat of criticalCategories) {
    const hasVendor = vendors.some(v => v.vendorCategory === cat && v.serviceDate === weddingDate);
    if (!hasVendor) {
      conflicts.push({
        blockA: cat,
        blockB: "",
        type: "vendor_missing",
        severity: cat === "officiant" ? "critical" : "warning",
        description: `No ${cat} assigned for ${weddingDate}`,
        suggestion: `Find and assign a ${cat} for the wedding day`,
      });
    }
  }

  // Check vendor timing vs their assigned blocks
  for (const vendor of vendors) {
    if (vendor.serviceDate !== weddingDate || !vendor.startTime || !vendor.endTime) continue;

    const expectedBlocks = VENDOR_TO_BLOCK[vendor.vendorCategory] || [];
    for (const blockKey of expectedBlocks) {
      const block = blocks.find(b => b.category === blockKey);
      if (!block) continue;

      if (vendor.startTime > block.startTime || vendor.endTime < block.endTime) {
        const coversMismatch = vendor.startTime > block.startTime
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
 * Get vendor assignment suggestions for a wedding based on ceremony time
 * and gaps in the current vendor roster.
 */
export async function getWeddingVendorGaps(tripId: string): Promise<Array<{
  category: string;
  label: string;
  neededFrom: string;
  neededUntil: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
}>> {
  const timeline = await buildWeddingTimeline(tripId);
  const vendors = await storage.getVendorCoordination(tripId);
  const assignedCategories = new Set(vendors.map(v => v.vendorCategory));

  const gaps: Array<{
    category: string;
    label: string;
    neededFrom: string;
    neededUntil: string;
    priority: "critical" | "high" | "medium" | "low";
    reason: string;
  }> = [];

  const PRIORITY_MAP: Record<string, "critical" | "high" | "medium" | "low"> = {
    officiant: "critical",
    photographer: "critical",
    caterer: "critical",
    coordinator: "high",
    florist: "high",
    dj_band: "high",
    hair_makeup: "high",
    videographer: "medium",
    cake_bakery: "medium",
    transportation: "medium",
    entertainment: "low",
    av_tech: "low",
    rental_company: "low",
  };

  for (const [category, blockKeys] of Object.entries(VENDOR_TO_BLOCK)) {
    if (assignedCategories.has(category)) continue;

    // Find the time range this vendor needs to cover
    const blocks = blockKeys
      .map(k => timeline.blocks.find(b => b.category === k))
      .filter(Boolean) as TimelineBlock[];

    if (blocks.length === 0) continue;

    const earliestStart = blocks.reduce((min, b) => b.startTime < min ? b.startTime : min, blocks[0].startTime);
    const latestEnd = blocks.reduce((max, b) => b.endTime > max ? b.endTime : max, blocks[0].endTime);

    gaps.push({
      category,
      label: category.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      neededFrom: earliestStart,
      neededUntil: latestEnd,
      priority: PRIORITY_MAP[category] || "medium",
      reason: `Covers: ${blocks.map(b => b.label).join(", ")}`,
    });
  }

  // Sort by priority
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
