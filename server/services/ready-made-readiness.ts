/**
 * The ADVISORY half of the ready-made readiness read (work plan L1-9, enhancement 1; ruling R-bi).
 * Pure. Advisory lines never stop a submit; the BLOCKING half is the publish gate itself
 * (`assertReadyMadeComplete`), so submit's 400 and the readiness read cannot drift.
 *
 * Every line names what it is about so a checklist can jump to it (`dayNumber`, `itemId`, the leg's
 * stops, `anchorId`).
 *
 * STATED LIMITS (§13):
 *  · "legs not checked in 90 days" needs `transport_legs.checked_at` (migration 346, L1-1), which is
 *    not on this branch's base — it is not reported here.
 *  · photos: `place_photos` does not exist yet (slip step 6); one line says so instead of a check.
 */
import { anchorConflicts } from "@shared/optimizer-lead";
import { isLodgingItem } from "@shared/where-to-stay";
import type { ReadyMadeLegLine } from "./trip-transport-legs.service";

export type ReadinessLine = {
  requirement: string;
  message: string;
  dayNumber?: number;
  itemId?: string;
  fromItemId?: string;
  toItemId?: string;
  legId?: string;
  anchorId?: string;
};

export const PHOTO_CHECK_PENDING_LINE: ReadinessLine = {
  requirement: "photos",
  message: "Photo checks arrive with the stop photo picker (slip step 6)",
};

type Item = {
  id: string;
  title: string;
  dayNumber: number;
  itemType?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
};
type Anchor = {
  id: string;
  anchorType: string;
  anchorDatetime: string | Date;
  bufferBefore?: number | null;
  bufferAfter?: number | null;
  description?: string | null;
};

function located(i: Item): boolean {
  const la = Number(i.latitude);
  const ln = Number(i.longitude);
  return i.latitude != null && i.longitude != null && Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0);
}

/** `YYYY-MM-DD` of `start` plus `days`. */
function addDays(start: string, days: number): string {
  return new Date(Date.parse(`${start.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function readinessAdvisory(input: {
  items: readonly Item[];
  legAdvisory: readonly ReadyMadeLegLine[];
  /** item id → the fact types the plan already holds for it (`factsForTrip`). */
  factTypesByItem: ReadonlyMap<string, ReadonlySet<string>>;
  anchors: readonly Anchor[];
  buildStartDate: string | null;
  durationDays: number;
}): ReadinessLine[] {
  const out: ReadinessLine[] = [...input.legAdvisory];

  // Stops with no opening hours on file: located, non-lodging stops only (a hotel or a transfer has
  // no opening hours to check).
  for (const i of input.items) {
    if (!located(i) || isLodgingItem({ type: i.itemType ?? null, title: i.title })) continue;
    if (input.factTypesByItem.get(i.id)?.has("hours")) continue;
    out.push({ requirement: "hours", message: `Day ${i.dayNumber}: ${i.title} has no opening hours checked`, dayNumber: i.dayNumber, itemId: i.id });
  }

  out.push(PHOTO_CHECK_PENDING_LINE);

  if (input.buildStartDate) {
    const first = input.buildStartDate.slice(0, 10);
    const last = addDays(first, Math.max(0, input.durationDays - 1));
    // Anchors outside the build's day window would land on no day of the buyer's copy (R-bg).
    for (const a of input.anchors) {
      // `anchor_datetime` is a plain timestamp; drizzle maps it as UTC, so its stored calendar day is
      // the UTC day of the Date it returns.
      const day = new Date(a.anchorDatetime).toISOString().slice(0, 10);
      if (day < first || day > last) {
        out.push({ requirement: "anchor_window", message: `${a.anchorType.replace(/_/g, " ")} falls outside the trip's ${input.durationDays} day(s)`, anchorId: a.id });
      }
    }
    // Activities inside an anchor's buffer — THE rule `validate-schedule` runs (`anchorConflicts`).
    const scheduled = input.items.map((i) => ({ ...i, date: addDays(first, i.dayNumber - 1) }));
    for (const c of anchorConflicts(input.anchors, scheduled)) {
      out.push({ requirement: "schedule", message: c.conflict, anchorId: c.anchorId, ...(c.dayNumber != null ? { dayNumber: c.dayNumber } : {}) });
    }
  }
  return out;
}
