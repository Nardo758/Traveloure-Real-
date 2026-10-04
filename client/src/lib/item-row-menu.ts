/**
 * The `ItemRow` ⋯ menu's two plan-reading decisions — PURE (surface spec v1.2 §3, step 1; ledger
 * `2026-10-03-surface-step1-item-row`).
 *
 * "Find a host" is offered on EVERY generic item — one that names no particular place (the SAME
 * `namedPlaceTokens` the server's place-facts lookup gates on, so "generic" means one thing on both
 * sides, §18 rule 1) — WHATEVER ITS TYPE (R-w; step 5 ruling 7). The category preset comes from the
 * item's type through the table below, which reads BOTH spellings a row can arrive in — the raw
 * `item_type` and the plancard's mapped type (`mapItemType`: activity → attraction, meal → dining).
 * The slip passes the MAPPED type, so the old raw-only table offered "Find a host" on transport and
 * stays alone (verified, ledger `2026-10-04-surface-step5-map-versions`). A type with no hireable
 * counterpart still gets "Find a host", unfiltered — said as a browse, not as a preset.
 */
import { namedPlaceTokens } from "@shared/place-name-gate";
import { buildServicesBrowseHref } from "@/lib/services-browse";

/** `itinerary_items.item_type` → `service_categories.category_key`. Absent ⇒ no "Find a host". */
export const FIND_A_HOST_CATEGORY: Readonly<Record<string, string>> = {
  activity: "activity_provider",
  attraction: "activity_provider",
  sightseeing: "activity_provider",
  tour: "activity_provider",
  entertainment: "activity_provider",
  meal: "dining_venue",
  dining: "dining_venue",
  transport: "private_transportation",
  accommodation: "accommodation",
};

/** The category a generic item's "Find a host" presets, or null (an unfiltered browse). */
export function findHostCategory(type: string | null | undefined): string | null {
  return (type && FIND_A_HOST_CATEGORY[type]) || null;
}

export function findHostHref(
  item: { name: string; type?: string | null; locationName?: string | null },
  ctx: { city: string | null | undefined; tripId: string },
): string | null {
  if (namedPlaceTokens({ title: item.name, locationName: item.locationName ?? null }, ctx.city).size > 0) return null;
  return buildServicesBrowseHref({ categoryKey: findHostCategory(item.type), tripId: ctx.tripId, location: ctx.city ?? null });
}

/**
 * The `AnchorRow` "from <tool>" — WHERE this fixed point was fixed. Only two tools fix an item on the
 * slip today: the lodging set's "Where to stay" panel and "Build my days around this" (M8). A purchased
 * row a real optimization was applied around is fixed by its booking. Null ⇒ the row is not an anchor.
 */
export function anchorFromTool(input: {
  isPrimaryAnchor: boolean;
  anchorSetCategory: string | null;
  purchasedAndOptimized: boolean;
}): string | null {
  if (input.isPrimaryAnchor) return input.anchorSetCategory === "accommodation" ? "Where to stay" : "Build my days around this";
  if (input.purchasedAndOptimized) return "your booking";
  return null;
}

/**
 * R-r — "Ask a local about this". The words, ONCE. A city with a live local opens the expert door; a
 * city with none records the item and the question (`expert_interest`, level `question`) and charges
 * nothing. It promises no notification: telling the traveler when supply goes live is a later lane,
 * and a sentence about a message nothing sends would be a claim (§13).
 */
export const ASK_LOCAL_WORDS = {
  prompt: "What would you like to ask a local about this?",
  save: "Save my question",
  saved: (city: string | null) =>
    city
      ? `Saved. No local expert is live in ${city} yet — your question is recorded, and nothing was charged.`
      : "Saved. No local expert is live here yet — your question is recorded, and nothing was charged.",
  /** Smoke 7 item 4: the row's standing line once a question is saved (read from the interest row). */
  savedRow: (city: string | null) =>
    city ? `Question saved · we'll tell you when a ${city} local joins` : "Question saved · we'll tell you when a local joins",
  /** …and the ⋯ entry that replaces "Ask a local about this" on that row. */
  seeQuestion: "See your question",
  yourQuestion: "Your question",
} as const;

/** Is any local expert live in the plan's city, by the door's own overview read? */
export function anyLocalLive(overview: { levels?: ReadonlyArray<{ expertCount: number }> } | null | undefined): boolean {
  return !!overview?.levels?.some((l) => l.expertCount > 0);
}
