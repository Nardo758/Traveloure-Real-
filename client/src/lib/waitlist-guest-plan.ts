/**
 * GATE-1B (ledger `2026-11-04-gate1b-guest-plan`): the client half of the server-side guest plan. In waitlist mode a
 * signed-out visitor's plan lives on the server, named by the `X-Guest-Session` id `apiRequest` already sends
 * (queryClient.ts). "Saved to plan" is said ONLY after the server confirms the write (G-2); a refusal says the approved
 * failure or rate-limit sentence instead.
 *
 * Not to be confused with `guest-plan.ts` (row 280b: an invited event guest's "Plan my day" button).
 */
import { dayNumberForDate, planItemRefFromFeedItem, type PlanItemKind, type PlanItemRef } from "@shared/plan-item-ref";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { GUEST_PLAN_COPY } from "@shared/guest-plan-copy";
import { WAITLIST_COPY } from "@/lib/waitlist-copy";
import { mapDayChips } from "@/lib/map-days";
import { planTitle } from "@/lib/trip-slip";
import type { BrowsePlace } from "@/lib/map-scene";
import type { PlanCardActivity, PlanCardDay } from "@/components/plancard/plancard-types";

export const GUEST_PLAN_QUERY_KEY = ["/api/guest-plans/current"] as const;
// A-13: the key has one home; re-exported for this module's existing importers.
export { GUEST_SESSION_STORAGE_KEY } from "./guest-session-key";
import { GUEST_SESSION_STORAGE_KEY } from "./guest-session-key";

export interface GuestPlanItem {
  id: string;
  title: string;
  description: string | null;
  itemType: string | null;
  dayNumber: number;
  locationName: string | null;
  latitude: string | null;
  longitude: string | null;
  /** A-18: the item has a point (the map draws it); false ⇒ listed as not on the map. */
  located?: boolean;
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

/**
 * A-1 / CAP-2 (ledger `2026-11-05-cap2-plan-item-ref`): what a guest save names is a PlanItemRef — a kind, the source
 * row's id, the city it was shown in, and an optional placement. The server reads the name and point from the row.
 */
export type GuestItemBody = PlanItemRef;

/** The server's answer to a save. */
export interface GuestSaveResult {
  id: string;
  located: boolean;
  existing: boolean;
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

/** A-5: the server get-or-creates — a second create (or one racing the first) answers the session's plan. */
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
 * A-2: the city a first save starts the plan in — the route's city, then the page's, then the item's own. None ⇒ null
 * (the caller shows the save-failed sentence and sends nothing).
 */
export function resolveSaveCity(routeCity: string | null | undefined, pageCity: string | null | undefined, itemCity: string | null | undefined): string | null {
  for (const c of [routeCity, pageCity, itemCity]) {
    const v = typeof c === "string" ? c.trim() : "";
    if (v) return v;
  }
  return null;
}

/** A-2: the city a browse route names (`/discover/location/:city`, `/places/:city`), decoded; otherwise null. */
export function cityFromPath(pathname: string | null | undefined): string | null {
  const m = /^\/(?:discover\/location|places)\/([^/?#]+)/.exec(pathname ?? "");
  if (!m) return null;
  try {
    const city = decodeURIComponent(m[1]).trim();
    return city || null;
  } catch {
    return null;
  }
}

/**
 * Save one item to the guest plan. With no plan yet, one is started for `destination` first (a save from the city page
 * before the plan page was ever opened); the server get-or-creates it (A-5), so two first saves land on ONE plan.
 * Resolves only after the server has the item; throws otherwise.
 */
export async function saveToGuestPlan(
  body: GuestItemBody,
  destination: string | null | undefined,
  /** CAP-2: the day a day-filtered feed was scoped to (YYYY-MM-DD) — the traveler's chosen day. */
  chosenDate?: string | null,
): Promise<GuestSaveResult> {
  // R3-1: the plan is made only by the get-or-create POST — never a GET first; a session that already has one gets it back.
  let plan = queryClient.getQueryData<GuestPlanView | null>(GUEST_PLAN_QUERY_KEY) ?? null;
  if (!plan) {
    const city = (destination ?? "").trim();
    if (!city) throw new Error("400: no destination");
    // A plan born from a city-page save has no chosen occasion: the city's own title ("Kyoto trip").
    plan = (await createGuestPlan({ destination: city, title: planTitle({ city: city.split(",")[0].trim() }) })) ?? null;
  }
  const ref: GuestItemBody = { ...body };
  if (!ref.placement?.day_number && chosenDate && plan?.plan?.datesConfirmed) {
    const day = guestChosenDay(chosenDate, plan.plan.startDate, plan.plan.endDate);
    if (day) ref.placement = { ...(ref.placement ?? {}), day_number: day };
  }
  try {
    const res = await apiRequest("POST", "/api/guest-plans/current/items", ref);
    return (await res.json()) as GuestSaveResult;
  } finally {
    // R3-1: "Your plan" follows the server on every answer — a refused save included — so the list never waits for a
    // reload to show what the plan holds.
    await queryClient.invalidateQueries({ queryKey: GUEST_PLAN_QUERY_KEY });
  }
}

/**
 * CAP-2, pure: a feed's chosen day → its day number on a plan whose dates are set; null when the day is outside the
 * plan's window (the save then lands on Day 1, never on a day the plan does not have).
 */
export function guestChosenDay(chosenDate: string, planStart: string, planEnd: string): number | null {
  if (!chosenDate || chosenDate.slice(0, 10) > String(planEnd).slice(0, 10)) return null;
  return dayNumberForDate(chosenDate, planStart);
}

/** A-18: the toast for a confirmed save — the not-on-the-map hint when the place has no point. */
export function guestSavedMessage(result: Pick<GuestSaveResult, "located">): string {
  return result.located ? WAITLIST_COPY.savedToPlan : GUEST_PLAN_COPY.savedNotOnMap;
}

/**
 * A-1 / CAP-2: a browse card's add payload → its PlanItemRef (`planItemRefFromFeedItem`, the ONE mapping). A card that
 * names no row the server can place (a recommendation category, a search result with no row) is null.
 */
export function guestItemFromFeedItem(item: any, city?: string | null, dayNumber?: number | null): GuestItemBody | null {
  return planItemRefFromFeedItem(item, city ?? (typeof item?.city === "string" ? item.city : null), dayNumber);
}

let claimInFlight: Promise<string[]> | null = null;
/** A-37: the sign-in this tab already claimed for, and what it claimed. One claim request per sign-in. */
let claimedFor: { userId: string; ids: string[] } | null = null;
const CLAIMED_FOR_STORAGE_KEY = "traveloure_guest_claimed_for";

/**
 * Ruling 5, on sign-in (beside /api/cart/migrate): the session's guest plans become the account's. A-37: ONE request
 * per sign-in — the app-level watcher and the plan page share it (in flight), and a later call for the same account in
 * this tab answers what was claimed without asking again. The endpoint is idempotent either way.
 */
export function claimGuestPlans(userId?: string | null): Promise<string[]> {
  const who = userId ?? null;
  if (who && claimedFor?.userId === who) return Promise.resolve(claimedFor.ids);
  if (who && !claimedFor) {
    try {
      if (sessionStorage.getItem(CLAIMED_FOR_STORAGE_KEY) === who) return Promise.resolve([]);
    } catch {
      // No session storage: ask the server (idempotent).
    }
  }
  if (!claimInFlight) {
    claimInFlight = claimGuestPlansOnce()
      .then((ids) => {
        if (who) {
          claimedFor = { userId: who, ids };
          try {
            sessionStorage.setItem(CLAIMED_FOR_STORAGE_KEY, who);
          } catch {
            // Best effort: the module memo still holds for this page.
          }
        }
        return ids;
      })
      .finally(() => {
        claimInFlight = null;
      });
  }
  return claimInFlight;
}

/** Tests: forget this tab's claim memo. */
export function _resetGuestClaimMemo(): void {
  claimedFor = null;
  claimInFlight = null;
}

async function claimGuestPlansOnce(): Promise<string[]> {
  // A-10 (ledger `2026-11-05-lane6-guest-cookie`): the guest cookie rides the request and names the guest; the
  // localStorage id is sent too, and the server reads it only when this browser's cookies are off.
  let guestSessionId: string | null = null;
  try {
    guestSessionId = localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
  } catch {
    guestSessionId = null;
  }
  try {
    const res = await apiRequest("POST", "/api/guest-plans/claim", guestSessionId ? { guestSessionId } : {});
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

/**
 * A-1 / CAP-2: a browse place → its PlanItemRef. Every kind names its source row; the server reads its name and point.
 * The map's day chip is the traveler's chosen day. A browse partner place is an `affiliate_products` row (ruling 8).
 */
export function guestBodyForPlace(place: BrowsePlace, dayNumber: number, city: string): GuestItemBody | null {
  const kind: PlanItemKind | null =
    place.kind === "gem" ? "gem" : place.kind === "event" ? "event" : place.kind === "listing" ? "listing" : place.kind === "partner" ? "affiliate_product" : null;
  const c = (city ?? "").trim();
  if (!kind || !place.id || !c) return null;
  return { kind, source_id: place.id, city: c, placement: { day_number: dayNumber } };
}

/** A-19 / CAP-2: a door's pending add (`listing` | `partner`) → its PlanItemRef, its source id carried intact. */
export function guestBodyForPendingAdd(
  add: { kind: "listing" | "partner"; id: string; title: string; dayNumber?: number } | null | undefined,
  city: string,
): GuestItemBody | null {
  const c = (city ?? "").trim();
  if (!add?.id || !c) return null;
  return {
    kind: add.kind === "listing" ? "listing" : "affiliate_product",
    source_id: add.id,
    city: c,
    ...(add.dayNumber ? { placement: { day_number: add.dayNumber } } : {}),
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

/**
 * A-22 (ledger `2026-11-05-lane7-guest-slip`): the guest plan's days as the Trip Slip draws them — every day of the
 * window in day order (an empty day reads "0 stops", as on the slip), each with its machine date ONLY when the guest
 * chose the dates. A placeholder window is never read as a weekday (§13); the heading is then the plan's own "Day N".
 * PURE.
 */
export function guestSlipDays(view: GuestPlanView): Array<{ dayNum: number; dateIso: string | null; activities: PlanCardActivity[] }> {
  const days = guestPlanDays(view)
    .map((d) => ({ dayNum: Number(d.dayNum), activities: d.activities as PlanCardActivity[] }))
    .sort((a, b) => a.dayNum - b.dayNum);
  const start = view.plan.datesConfirmed ? /^(\d{4})-(\d{2})-(\d{2})/.exec(view.plan.startDate ?? "") : null;
  return days.map((d) => {
    if (!start) return { ...d, dateIso: null };
    const dt = new Date(Date.UTC(Number(start[1]), Number(start[2]) - 1, Number(start[3]) + d.dayNum - 1));
    return { ...d, dateIso: dt.toISOString().slice(0, 10) };
  });
}
