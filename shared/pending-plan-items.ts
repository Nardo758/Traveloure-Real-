/**
 * Pre-trip itinerary items held until a traveler-owned plan is minted.
 *
 * These are itinerary items, not plan events: they do not have a chosen day or
 * time, and must not be routed through the user_experiences event pen.
 */
export const MAX_PENDING_PLAN_ITEMS = 20;
export const MAX_PENDING_PLAN_ITEM_ID = 255;
export const MAX_PENDING_PLAN_ITEM_TITLE = 255;
export const MAX_PENDING_PLAN_ITEM_CITY = 255;

export interface PendingPlanItem {
  id: string;
  title: string;
  city: string;
}

export interface PendingPlanItemValues {
  title: string;
  description: string;
  itemType: "activity";
  status: "planned";
  /** Required ordinal by itinerary_items; no calendar date is asserted. */
  dayNumber: 1;
  locationName: string;
  /** Keeps the real source id available for idempotency and traceability. */
  notes: string;
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

/** Normalize the persisted pen; malformed rows never become fabricated items. */
export function normalizePendingPlanItems(input: unknown): PendingPlanItem[] {
  if (!Array.isArray(input)) return [];
  const result: PendingPlanItem[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const id = cleanText(item.id, MAX_PENDING_PLAN_ITEM_ID);
    const title = cleanText(item.title, MAX_PENDING_PLAN_ITEM_TITLE);
    const city = cleanText(item.city, MAX_PENDING_PLAN_ITEM_CITY);
    if (!id || !title || !city || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, title, city });
    if (result.length >= MAX_PENDING_PLAN_ITEMS) break;
  }
  return result;
}

export function pendingPlanItemMarker(id: string): string {
  return `Billboard gem id: ${id}`;
}

/** The one conversion from a held gem to the canonical itinerary-item input. */
export function pendingPlanItemValues(item: PendingPlanItem): PendingPlanItemValues {
  return {
    title: item.title,
    description: "",
    itemType: "activity",
    status: "planned",
    dayNumber: 1,
    locationName: item.city,
    notes: pendingPlanItemMarker(item.id),
  };
}