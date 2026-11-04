/**
 * GATE-1B (ledger `2026-11-04-gate1b-guest-plan`): the client half of the server-side guest plan. In waitlist mode a
 * signed-out visitor's plan lives on the server, named by the `X-Guest-Session` id `apiRequest` already sends
 * (queryClient.ts). "Saved to plan" is said ONLY after the server confirms the write (G-2); a refusal says the approved
 * failure or rate-limit sentence instead.
 *
 * Not to be confused with `guest-plan.ts` (row 280b: an invited event guest's "Plan my day" button).
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { GUEST_PLAN_COPY } from "@shared/guest-plan-copy";
import { mapDayChips } from "@/lib/map-days";
import { planTitle } from "@/lib/trip-slip";
import type { BrowsePlace } from "@/lib/map-scene";
import type { PlanCardDay } from "@/components/plancard/plancard-types";

export const GUEST_PLAN_QUERY_KEY = ["/api/guest-plans/current"] as const;
export const GUEST_SESSION_STORAGE_KEY = "traveloure_guest_session";

export interface GuestPlanItem {
  id: string;
  title: string;
  description: string | null;
  itemType: string | null;
  dayNumber: number;
  locationName: string | null;
  latitude: string | null;
  longitude: string | null;
}

export interface GuestPlanView {
  plan: {
    id: string;
    title: string | null;
    destination: string;
    startDate: string;
    endDate: string;
    datesConfirmed: boolean;
    adults: number | null;
    kids: number | null;
    numberOfTravelers: number | null;
    eventType: string | null;
    updatedAt: string | null;
  };
  items: GuestPlanItem[];
  retentionDays: number | null;
}

export interface GuestPlanCreateInput {
  destination: string;
  /** E-1: the plan's title, composed by `planTitle` from the traveler's choice and the city. */
  title?: string;
  startDate?: string;
  endDate?: string;
  adults?: number;
  kids?: number;
  occasionSlug?: string;
}

export interface GuestItemBody {
  title: string;
  description?: string;
  itemType?: "activity" | "meal" | "accommodation" | "free_time";
  dayNumber?: number;
  locationName?: string;
  latitude?: string;
  longitude?: string;
  gemId?: string;
}

/** `apiRequest` throws "<status>: <body>"; the status is all a caller needs. */
export function statusOf(err: unknown): number | null {
  const m = /^(\d{3}):/.exec(String((err as Error | null)?.message ?? ""));
  return m ? Number(m[1]) : null;
}

/** The approved sentence for a failed save: rate limit, else the general failure. */
export function guestSaveErrorMessage(err: unknown): string {
  return statusOf(err) === 429 ? GUEST_PLAN_COPY.rateLimited : GUEST_PLAN_COPY.saveFailed;
}

/** The session's guest plan, or null when it has none (404). */
export async function fetchGuestPlan(): Promise<GuestPlanView | null> {
  try {
    return (await (await apiRequest("GET", "/api/guest-plans/current")).json()) as GuestPlanView;
  } catch (err) {
    if (statusOf(err) === 404) return null;
    throw err;
  }
}

export function useGuestPlan(enabled: boolean) {
  return useQuery<GuestPlanView | null>({
    queryKey: GUEST_PLAN_QUERY_KEY,
    queryFn: fetchGuestPlan,
    enabled,
    retry: false,
    staleTime: 0,
  });
}

export async function createGuestPlan(input: GuestPlanCreateInput): Promise<GuestPlanView> {
  const view = (await (await apiRequest("POST", "/api/guest-plans", input)).json()) as GuestPlanView;
  queryClient.setQueryData(GUEST_PLAN_QUERY_KEY, view);
  return view;
}

export async function updateGuestPlan(patch: {
  startDate?: string;
  endDate?: string;
  adults?: number | null;
  kids?: number | null;
}): Promise<GuestPlanView> {
  const view = (await (await apiRequest("PATCH", "/api/guest-plans/current", patch)).json()) as GuestPlanView;
  queryClient.setQueryData(GUEST_PLAN_QUERY_KEY, view);
  return view;
}

/**
 * Save one item to the guest plan. With no plan yet, one is created for `destination` first (a save from the city
 * page before the plan page was ever opened). Resolves only after the server has the item; throws otherwise.
 */
export async function saveToGuestPlan(body: GuestItemBody, destination: string | null | undefined): Promise<void> {
  let plan = await fetchGuestPlan();
  if (!plan) {
    const city = (destination ?? "").trim();
    if (!city) throw new Error("400: no destination");
    // A plan born from a city-page save has no chosen occasion: the city's own title ("Kyoto trip").
    plan = await createGuestPlan({ destination: city, title: planTitle({ city: city.split(",")[0].trim() }) });
  }
  await apiRequest("POST", "/api/guest-plans/current/items", body);
  await queryClient.invalidateQueries({ queryKey: GUEST_PLAN_QUERY_KEY });
}

const ITEM_TYPES = new Set(["activity", "meal", "accommodation", "free_time"]);

/**
 * A browse card's add payload → the guest save body. Gems name their row (`sourceContentId`) so the server reads the
 * name and point; everything else saves its own title. Card types outside the item vocabulary save as activities.
 */
export function guestItemFromFeedItem(item: any): GuestItemBody | null {
  const title = typeof item?.title === "string" ? item.title.trim() : "";
  if (!title) return null;
  const type = item?.type === "hotel" ? "accommodation" : ITEM_TYPES.has(item?.type) ? item.type : "activity";
  return {
    title: title.slice(0, 255),
    ...(typeof item?.description === "string" && item.description ? { description: item.description.slice(0, 2000) } : {}),
    itemType: type,
    ...(item?.type === "gem" && typeof item?.sourceContentId === "string" && item.sourceContentId ? { gemId: item.sourceContentId } : {}),
  };
}

let claimInFlight: Promise<string[]> | null = null;

/**
 * Ruling 5, on sign-in (beside /api/cart/migrate): the session's guest plans become the account's. Two callers (the
 * app-level sign-in watcher and the plan page) share ONE request, so both see the same claimed ids.
 */
export function claimGuestPlans(): Promise<string[]> {
  if (!claimInFlight) {
    claimInFlight = claimGuestPlansOnce().finally(() => {
      claimInFlight = null;
    });
  }
  return claimInFlight;
}

async function claimGuestPlansOnce(): Promise<string[]> {
  let guestSessionId: string | null = null;
  try {
    guestSessionId = localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!guestSessionId) return [];
  try {
    const res = await apiRequest("POST", "/api/guest-plans/claim", { guestSessionId });
    const out = (await res.json()) as { tripIds?: string[] };
    queryClient.removeQueries({ queryKey: GUEST_PLAN_QUERY_KEY });
    const ids = Array.isArray(out.tripIds) ? out.tripIds.filter((id) => typeof id === "string" && id) : [];
    if (ids[0]) {
      try {
        sessionStorage.setItem(CLAIMED_PLAN_STORAGE_KEY, ids[0]);
      } catch {
        // No session storage: the plan page falls back to "no plan waiting" (§13), the plan is still the account's.
      }
    }
    return ids;
  } catch {
    return [];
  }
}

const CLAIMED_PLAN_STORAGE_KEY = "traveloure_claimed_guest_plan";

/** The plan the last sign-in claimed in this tab, read once (the plan page opens it). */
export function takeClaimedGuestPlanId(): string | null {
  try {
    const id = sessionStorage.getItem(CLAIMED_PLAN_STORAGE_KEY);
    if (id) sessionStorage.removeItem(CLAIMED_PLAN_STORAGE_KEY);
    return id || null;
  } catch {
    return null;
  }
}

/** A browse place → the guest save body. A gem names its row (the server reads its name and point). */
export function guestBodyForPlace(place: BrowsePlace, dayNumber: number): GuestItemBody {
  if (place.kind === "gem") return { title: place.name, gemId: place.id, dayNumber };
  const located = place.lat != null && place.lng != null;
  return {
    title: place.name,
    dayNumber,
    ...(place.kind === "event" ? {} : { locationName: place.name }),
    ...(located ? { latitude: String(place.lat), longitude: String(place.lng) } : {}),
  };
}

/** The plan's items as map days over the plan's window (stops carry their own points; none is guessed). */
export function guestPlanDays(view: GuestPlanView): PlanCardDay[] {
  const byDay = new Map<number, PlanCardDay>();
  for (const it of view.items) {
    const d =
      byDay.get(it.dayNumber) ??
      ({ dayNum: it.dayNumber, date: "", label: `Day ${it.dayNumber}`, activities: [], transports: [] } as unknown as PlanCardDay);
    const lat = it.latitude != null ? Number(it.latitude) : NaN;
    const lng = it.longitude != null ? Number(it.longitude) : NaN;
    (d.activities as any[]).push({
      id: it.id,
      name: it.title,
      type: it.itemType ?? "activity",
      status: "planned",
      time: "",
      location: it.locationName ?? "",
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
      cost: 0,
      comments: 0,
    });
    byDay.set(it.dayNumber, d);
  }
  return mapDayChips(Array.from(byDay.values()), { startDate: view.plan.startDate, endDate: view.plan.endDate });
}
