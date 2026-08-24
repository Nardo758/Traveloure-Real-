/**
 * Shared vocabulary for the F2 client-channel format views (DISTRIBUTION_FORMATS.md).
 *
 * Console tokens (§17 two-palettes rule): these resolve against the `.console-scope` block in
 * client/src/index.css — never raw hex in console surfaces. The Workstation canvas that renders
 * these views is wrapped by BackofficeShell (via ExpertLayout), so the tokens always resolve.
 */
export const INK = "var(--console-ink)";
export const MID = "var(--console-mid)";
export const FAINT = "var(--console-faint)";
export const LINE = "var(--console-line)";
export const GROUND = "var(--console-ground)";
export const CARD = "var(--console-card)";
export const BRAND = "var(--console-brand)";
export const BRAND_SOFT = "var(--console-brand-soft)";
export const OK = "var(--console-ok)";
export const OK_SOFT = "var(--console-ok-soft)";

/**
 * The itinerary-item shape the views consume — a permissive subset of the real
 * `itinerary_items` row served by GET /api/trips/:tripId/itinerary-items (the endpoint returns
 * full rows, so `locationAddress` / `providerServiceId` are present at runtime even though the
 * workspace's local interface types a narrower slice). Everything beyond id/title is optional
 * so the workspace's `ItineraryItem[]` assigns structurally.
 */
export interface FormatItem {
  id: string;
  title: string;
  itemType?: string | null;
  dayNumber?: number;
  startTime?: string | null;
  estimatedCost?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  notes?: string | null;
  providerServiceId?: string | null;
}

export interface FormatDay {
  dayNumber: number;
  items: FormatItem[];
}

/** FormatItem with the day it belongs to pinned from its containing day group. */
export type FlatFormatItem = FormatItem & { dayNumber: number };

/** Flatten day groups, pinning each item's dayNumber from its group (authoritative). */
export function flattenDays(days: FormatDay[]): FlatFormatItem[] {
  return days.flatMap((d) => d.items.map((it) => ({ ...it, dayNumber: d.dayNumber })));
}

/** "HH:MM" → minutes since midnight; null when absent/unparseable (missing sorts last). */
export function timeToMinutes(t?: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((t ?? "").trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Chronological compare: day asc, then time asc, untimed last within a day. */
export function compareChrono(a: FlatFormatItem, b: FlatFormatItem): number {
  if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
  const ta = timeToMinutes(a.startTime);
  const tb = timeToMinutes(b.startTime);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return ta - tb;
}

/** The right-aligned day ribbon: "Day N · time" when the item has a time, else "Day N". */
export function dayRibbon(item: FlatFormatItem): string {
  const time = (item.startTime ?? "").trim();
  return time ? `Day ${item.dayNumber} · ${time}` : `Day ${item.dayNumber}`;
}

/**
 * Item-level note row — the binding expert-notes contract (DISTRIBUTION_FORMATS.md `client:*`):
 * an item's notes render WITH the item inside whatever group/panel the format assigns.
 * Rendered only when a real note exists (§13 — never an empty slot).
 */
export function itemNote(item: FormatItem): string | null {
  const n = (item.notes ?? "").trim();
  return n.length > 0 ? n : null;
}
