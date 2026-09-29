import type { PlanningSource } from "@/contexts/PlanningContext";
import {
  normalizePendingPlanItems,
  pendingPlanItemMarker,
  pendingPlanItemValues,
  type PendingPlanItem,
} from "@shared/pending-plan-items";

export type BillboardGemPlanningInput = {
  id: string;
  title?: string;
  /** The billboard slot contract calls its real display title `name`. */
  name?: string;
  city: string;
};

/** The billboard door's explicit plan source; no slot resolver or UI assumptions are required. */
export function buildBillboardGemPlanningSource(input: BillboardGemPlanningInput): PlanningSource {
  const [item] = normalizePendingPlanItems([{ ...input, title: input.title ?? input.name }]);
  if (!item) throw new Error("This gem is missing its id, title, or city and cannot seed a plan.");
  return {
    city: item.city,
    destination: item.city,
    newPlan: true,
    pendingItem: item,
  };
}

export type PendingGemItemFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Attach the source gem to a freshly minted plan. The marker makes retries safe, and the read
 * failure is explicit: without knowing the plan's current items we cannot safely avoid a duplicate.
 */
export async function addPendingGemToTrip(
  tripId: string,
  item: PendingPlanItem,
  fetcher: PendingGemItemFetch = fetch,
): Promise<void> {
  const marker = pendingPlanItemMarker(item.id);
  const existingResponse = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/itinerary-items`, {
    credentials: "include",
  });
  if (!existingResponse.ok) throw new Error("Could not verify whether the gem is already on the new plan.");
  const existing = (await existingResponse.json()) as {
    days?: Array<{ items?: Array<{ notes?: string | null }> }>;
  };
  if (
    !Array.isArray(existing.days) ||
    existing.days.some((day) => !Array.isArray(day?.items))
  ) {
    throw new Error("Could not verify the new plan's items, so the gem was not added.");
  }
  if (existing.days.some((day) => day.items!.some((row) => row.notes === marker))) return;

  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/itinerary-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...pendingPlanItemValues(item), pendingGemId: item.id }),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { message?: string };
      detail = body.message || "";
    } catch {
      // The HTTP status remains an explicit failure when no JSON message is available.
    }
    throw new Error(detail || "The new plan was created, but the gem could not be added.");
  }
}