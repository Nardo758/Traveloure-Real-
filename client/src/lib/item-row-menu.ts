/**
 * The `ItemRow` ⋯ menu's two plan-reading decisions — PURE (surface spec v1.2 §3, step 1; ledger
 * `2026-10-03-surface-step1-item-row`).
 *
 * "Find a host" is offered on a GENERIC item only — one that names no particular place (the SAME
 * `namedPlaceTokens` the server's place-facts lookup gates on, so "generic" means one thing on both
 * sides, §18 rule 1) — and opens the EXISTING `/services` search with the item's category preset. The
 * category comes from the item's own `item_type` (the `itineraryItemTypeEnum` value set) through the
 * table below; a type with no hireable counterpart (free time, a meeting, a checkpoint) gets NO entry,
 * never an unfiltered browse dressed up as a preset (§13). The Browse layer replaces the target in
 * step 8; the decision of WHICH items offer it stays here.
 */
import { namedPlaceTokens } from "@shared/place-name-gate";
import { buildServicesBrowseHref } from "@/lib/services-browse";

/** `itinerary_items.item_type` → `service_categories.category_key`. Absent ⇒ no "Find a host". */
export const FIND_A_HOST_CATEGORY: Readonly<Record<string, string>> = {
  activity: "activity_provider",
  meal: "dining_venue",
  transport: "private_transportation",
  accommodation: "accommodation",
};

export function findHostHref(
  item: { name: string; type?: string | null; locationName?: string | null },
  ctx: { city: string | null | undefined; tripId: string },
): string | null {
  const categoryKey = item.type ? FIND_A_HOST_CATEGORY[item.type] : undefined;
  if (!categoryKey) return null;
  if (namedPlaceTokens({ title: item.name, locationName: item.locationName ?? null }, ctx.city).size > 0) return null;
  return buildServicesBrowseHref({ categoryKey, tripId: ctx.tripId, location: ctx.city ?? null });
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
} as const;

/** Is any local expert live in the plan's city, by the door's own overview read? */
export function anyLocalLive(overview: { levels?: ReadonlyArray<{ expertCount: number }> } | null | undefined): boolean {
  return !!overview?.levels?.some((l) => l.expertCount > 0);
}
