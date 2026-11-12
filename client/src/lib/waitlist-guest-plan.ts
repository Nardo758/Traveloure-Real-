/**
 * GATE-1B (ledger `2026-11-04-gate1b-guest-plan`): the client half of the server-side guest plan. In waitlist mode a
 * signed-out visitor's plan lives on the server, named by the `X-Guest-Session` id `apiRequest` already sends
 * (queryClient.ts). "Saved to plan" is said ONLY after the server confirms the write (G-2); a refusal says the approved
 * failure or rate-limit sentence instead.
 *
 * Not to be confused with `guest-plan.ts` (row 280b: an invited event guest's "Plan my day" button).
 */
import { addedMessage } from "./add-to-plan";
import { planSaveRefusalMessage } from "./plan-save-refusal";
import { dayNumberForDate, planItemRefFromFeedItem, type PlanItemKind, type PlanItemRef } from "@shared/plan-item-ref";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { GUEST_PLAN_COPY } from "@shared/guest-plan-copy";
import { toast } from "@/hooks/use-toast";
import { shouldClaimGuestPlans } from "@shared/guest-presence";
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
  /** R4b-5: the item's own day (`YYYY-MM-DD`) and wall-clock start ("17:30") when stored — an event's. */
  scheduledDate?: string | null;
  startTime?: string | null;
  /** PLAN-1 (shared DTO): the stored wall-clock end. */
  endTime?: string | null;
  /** R4b-3: the content row it was saved from — "Saved to plan" reads it. */
  contentType?: string | null;
  contentId?: string | null;
  /** PLAN-1 (shared DTO): a listing or partner product the item names. */
  providerServiceId?: string | null;
  affiliateProductId?: string | null;
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
    /** PLAN-1 (shared DTO): the plan's occasion in words, as the plancard sends it. */
    occasionLabel?: string | null;
    /** R5-3 (option b): the stored occasion slug. */
    occasionSlug?: string | null;
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
  /** The stored row the save answered with — its `dayNumber` is the day it landed on. */
  item?: { dayNumber?: number | null } | null;
}

/** `apiRequest` throws "<status>: <body>"; the status is all a caller needs. */
export function statusOf(err: unknown): number | null {
  const m = /^(\d{3}):/.exec(String((err as Error | null)?.message ?? ""));
  return m ? Number(m[1]) : null;
}

/** The approved sentence for a failed save: rate limit, an event outside the plan's dates (R4b-1), else the general failure. */
export function guestSaveErrorMessage(err: unknown): string {
  if (statusOf(err) === 429) return GUEST_PLAN_COPY.rateLimited;
  return planSaveRefusalMessage(err) ?? GUEST_PLAN_COPY.saveFailed;
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

/**
 * QA round 3 PR 5 (Leon, Nov 12, 2026): the ONE rule for whether the page may read `GET /api/guest-plans/current` —
 * signed out, and the session read settled. That route is `guestOnly`: a signed-in caller is answered 409 `signed_in`,
 * so a read sent while `/api/auth/user` is still in flight (the user reads as absent then) is a console error for every
 * member who was ever a guest (the presence cookie is never cleared). Every caller reads this, never its own copy.
 */
export function guestPlanReadAllowed(auth: { authLoading: boolean; signedIn: boolean }): boolean {
  return !auth.authLoading && !auth.signedIn;
}

/** The session's guest plan. `auth` is the caller's session read; `enabled` is the caller's own extra condition. */
export function useGuestPlan(auth: { authLoading: boolean; signedIn: boolean }, enabled = true) {
  return useQuery<GuestPlanView | null>({
    queryKey: GUEST_PLAN_QUERY_KEY,
    queryFn: fetchGuestPlan,
    enabled: enabled && guestPlanReadAllowed(auth),
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
    // R4b-3: "Saved to plan" reads the refreshed plan below (its items), never a client-side flag.
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

/**
 * A-18: the toast for a confirmed save. Cut-list #1 slice C: "Added to Day {n}." (supersedes the Nov 7 "Saved to Day
 * {n}."), with the unlocated place's map fact as a second sentence — ONE wording, `addedMessage` (lib/add-to-plan.ts).
 */
export function guestSavedMessage(result: Pick<GuestSaveResult, "located"> & Pick<GuestSaveResult, "item">): string {
  return addedMessage({ dayNumber: result.item?.dayNumber, located: result.located });
}

/**
 * A-1 / CAP-2: a browse card's add payload → its PlanItemRef (`planItemRefFromFeedItem`, the ONE mapping). A card that
 * names no row the server can place (a recommendation category, a search result with no row) is null.
 */
export function guestItemFromFeedItem(item: any, city?: string | null, dayNumber?: number | null): GuestItemBody | null {
  return planItemRefFromFeedItem(item, city ?? (typeof item?.city === "string" ? item.city : null), dayNumber);
}

/**
 * QA round 3 PR 3 (Leon, Nov 11, 2026): what one claim request came back with — the ids it claimed (possibly none), or
 * a real failure (a rejected request or a non-2xx answer). An empty claim and a failed one are different facts: only a
 * failure is said out loud, and only a success stamps the memo, so the next sign-in tries again.
 */
export type GuestClaimOutcome = { ok: true; ids: string[] } | { ok: false };

/** The one failure toast: the existing save-failed sentence, no new string. Swappable in tests only. */
let announceClaimFailure: () => void = () => {
  toast({ variant: "destructive", title: guestSaveErrorMessage(null) });
};
export function setClaimFailureAnnouncerForTests(fn: (() => void) | null): void {
  announceClaimFailure = fn ?? (() => toast({ variant: "destructive", title: guestSaveErrorMessage(null) }));
}

let claimInFlight: Promise<GuestClaimOutcome> | null = null;
/** A-37: the sign-in this tab already claimed for, and what it claimed. One claim request per sign-in. */
let claimedFor: { userId: string; ids: string[] } | null = null;
const CLAIMED_FOR_STORAGE_KEY = "traveloure_guest_claimed_for";

/**
 * Ruling 5, on sign-in (beside /api/cart/migrate): the session's guest plans become the account's. A-37: ONE request
 * per sign-in — the app-level watcher, the sign-in modal and the plan page share it (in flight), and a later call for
 * the same account in this tab answers what was claimed without asking again. The endpoint is idempotent either way.
 * QA round 3 PR 3: a failed request answers `[]` to the caller, is toasted once (the existing save-failed sentence,
 * `guestSaveErrorMessage(null)`), and stamps no memo — the next sign-in claims again. An empty claim is not a failure.
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
      .then((out) => {
        if (!out.ok) {
          // Said once per failed request, whichever caller started it.
          announceClaimFailure();
          return out;
        }
        if (who) {
          claimedFor = { userId: who, ids: out.ids };
          try {
            sessionStorage.setItem(CLAIMED_FOR_STORAGE_KEY, who);
          } catch {
            // Best effort: the module memo still holds for this page.
          }
        }
        return out;
      })
      .finally(() => {
        claimInFlight = null;
      });
  }
  return claimInFlight.then((out) => (out.ok ? out.ids : []));
}

/** Tests: forget this tab's claim memo. */
export function _resetGuestClaimMemo(): void {
  claimedFor = null;
  claimInFlight = null;
}

/**
 * QA round 3 PR 3: forget this tab's claim memo AND the claimed-plan hand-off — on sign-out, and on a 401 after a
 * session had existed — so the next sign-in in this tab asks the server again (TB2: a guest save made after signing out
 * was never claimed, because the memo still named the account).
 */
export function clearGuestClaimMemo(): void {
  claimedFor = null;
  try {
    sessionStorage.removeItem(CLAIMED_FOR_STORAGE_KEY);
    sessionStorage.removeItem(CLAIMED_PLAN_STORAGE_KEY);
  } catch {
    // No session storage: nothing was kept there.
  }
}

/** Was this tab's claim memo stamped for a signed-in account (evidence a session existed here)? */
export function hasGuestClaimMemo(): boolean {
  if (claimedFor) return true;
  try {
    return sessionStorage.getItem(CLAIMED_FOR_STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

async function claimGuestPlansOnce(): Promise<GuestClaimOutcome> {
  // A-10 (ledger `2026-11-05-lane6-guest-cookie`): the guest cookie rides the request and names the guest; the
  // localStorage id is sent too, and the server reads it only when this browser's cookies are off.
  let guestSessionId: string | null = null;
  try {
    guestSessionId = localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
  } catch {
    guestSessionId = null;
  }
  // PLAN-2 C4: no guest in this browser ⇒ no claim request (and no 400). Nothing to claim is a success.
  const cookieString = typeof document !== "undefined" ? document.cookie : "";
  const cookiesEnabled = typeof navigator !== "undefined" ? navigator.cookieEnabled : undefined;
  if (!shouldClaimGuestPlans({ cookieString, cookiesEnabled, localGuestId: guestSessionId })) return { ok: true, ids: [] };
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
    return { ok: true, ids };
  } catch (err) {
    // Leon, Nov 12, 2026: a 400 `guest_session_required` means this browser has no guest to claim (the presence
    // cookie outlived the guest cookie). That is nothing to claim — empty, memo stamped, no toast — never a failure.
    if (isNoGuestSession(err)) return { ok: true, ids: [] };
    // `apiRequest` throws on any other non-2xx answer as on a network failure: both are a real failure, never "nothing".
    return { ok: false };
  }
}

/** Pure: the claim's 400 that says no guest session rode the request (`guest-plans.routes.ts`, `guest_session_required`). */
export function isNoGuestSession(err: unknown): boolean {
  if (statusOf(err) !== 400) return false;
  const body = String((err as Error | null)?.message ?? "").replace(/^\d{3}:\s*/, "");
  try {
    return (JSON.parse(body) as { code?: unknown })?.code === "guest_session_required";
  } catch {
    return false;
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
      // R4b-5: an event's stated start ("17:30") is drawn on its row; an untimed item stays "".
      time: it.startTime ?? "",
      ...(it.endTime ? { endTime: it.endTime } : {}),
      location: it.locationName ?? "",
      ...(it.providerServiceId ? { providerServiceId: it.providerServiceId } : {}),
      ...(it.affiliateProductId ? { affiliateProductId: it.affiliateProductId } : {}),
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
      cost: 0,
      comments: 0,
    });
    byDay.set(it.dayNumber, d);
  }
  return mapDayChips(Array.from(byDay.values()), {
    startDate: view.plan.startDate,
    endDate: view.plan.endDate,
    datesConfirmed: view.plan.datesConfirmed === true,
  });
}


/**
 * PLAN-1 Phase 3 (ledger `2026-11-06-plan1-phase3-one-planner`): the guest's plan as the slip reads a plan — the guest
 * page draws it with `SlipView` in guest mode (one component tree for the guest and the owner). The plan's own facts
 * only: no role (the slip's guest mode gates every member surface), no change log, no metrics. PURE.
 */
export function guestSlipData(view: GuestPlanView): import("@/components/plancard/SlipView").SlipData {
  const { plan } = view;
  const adults = plan.adults ?? null;
  const kids = plan.kids ?? null;
  return {
    trip: {
      id: plan.id,
      title: plan.title,
      destination: plan.destination,
      startDate: plan.startDate,
      endDate: plan.endDate,
      travelers: plan.numberOfTravelers ?? (adults != null ? adults + (kids ?? 0) : null),
      eventType: plan.eventType ?? null,
      ...(adults != null ? { adults } : {}),
      ...(kids != null ? { kids } : {}),
      datesConfirmed: plan.datesConfirmed,
      occasionLabel: plan.occasionLabel ?? null,
      occasionSlug: plan.occasionSlug ?? null,
    } as any,
    days: guestPlanDays(view),
    changeLog: [],
    metrics: {},
    stats: {},
  } as any;
}
