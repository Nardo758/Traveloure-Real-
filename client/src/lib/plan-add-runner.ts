/**
 * Cut-list #1 slice C — what happens around ONE add: the pending spinner, the one-slot wait for the session and mode
 * reads, the toast with Undo and Change day, the recovery toast with Retry, and the first-add calendar.
 *
 * Module state, not component state, on purpose: when the session read answers, the browse shell swaps its layout and
 * remounts the page (A-12), so a card cannot hold a press across that moment. The slot lives here; the host
 * (`PlanAddFeedbackHost`, mounted once in App) runs it when both reads answer and draws the two dialogs.
 *
 * Every write goes through a rail that already exists: the guest item rail (`saveToGuestPlan`) or the signed-in
 * PlanItemRef rail (`POST /api/trips/:tripId/itinerary-items` with `{ ref }`). Undo and Change day write to the SAME
 * rail that added the item (`planItemPath`).
 */
import { useSyncExternalStore } from "react";
import { apiRequest, queryClient } from "./queryClient";
import { refreshSavedRefs } from "./saved-refs";
import { GUEST_PLAN_QUERY_KEY, guestSaveErrorMessage, saveToGuestPlan, type GuestItemBody, type GuestPlanView, type GuestSaveResult } from "./waitlist-guest-plan";
import { activeHeaderTrip, type HeaderTrip } from "./header-plan";
import { boundTripId } from "./active-plan";
import { getTripContext } from "./trip-context";
import { planTitle } from "./trip-slip";
import { FIRST_ADD_DATES_KEY, shouldOpenFirstAddDates, type PlanAddRail } from "./add-to-plan";

// ── Pending state, by the item's saved key (survives a remount of the card that was pressed) ──────────────────────
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function setAddPending(key: string | null | undefined, on: boolean): void {
  if (!key) return;
  if (on ? !pending.has(key) : pending.has(key)) {
    if (on) pending.add(key);
    else pending.delete(key);
    emit();
  }
}
export function isAddPending(key: string | null | undefined): boolean {
  return !!key && pending.has(key);
}
/** True while an add of this item is in flight (or waiting in the slot). */
export function useAddPending(key: string | null | undefined): boolean {
  return useSyncExternalStore(subscribe, () => isAddPending(key), () => isAddPending(key));
}

// ── Feedback events the host draws ───────────────────────────────────────────────────────────────────────────────
export type AddedEvent = { rail: PlanAddRail; itemId: string; dayNumber: number | null; located: boolean | null };
export type FeedbackEvent =
  | { kind: "added"; event: AddedEvent }
  | { kind: "failed"; message: string; retry: () => void }
  | { kind: "change_day"; event: AddedEvent }
  | { kind: "first_add_dates"; rail: PlanAddRail; planId: string; startDate: string | null; endDate: string | null };
const feedbackListeners = new Set<(e: FeedbackEvent) => void>();
export function onPlanAddFeedback(l: (e: FeedbackEvent) => void): () => void {
  feedbackListeners.add(l);
  return () => feedbackListeners.delete(l);
}
export function emitPlanAddFeedback(e: FeedbackEvent): void {
  feedbackListeners.forEach((l) => l(e));
}

// ── The one-slot wait ────────────────────────────────────────────────────────────────────────────────────────────
export interface QueuedAdd {
  key: string | null;
  ref: GuestItemBody;
  city: string;
  chosenDate: string | null;
  queuedAt: number;
}
let slot: QueuedAdd | null = null;
const slotListeners = new Set<() => void>();
/** A press made before the reads answer. A second press replaces the first (one slot). */
export function queuePlanAdd(job: Omit<QueuedAdd, "queuedAt">): void {
  if (slot && slot.key !== job.key) setAddPending(slot.key, false);
  slot = { ...job, queuedAt: Date.now() };
  setAddPending(job.key, true);
  slotListeners.forEach((l) => l());
}
export function takeQueuedPlanAdd(): QueuedAdd | null {
  const s = slot;
  slot = null;
  return s;
}
export function onQueuedPlanAdd(l: () => void): () => void {
  slotListeners.add(l);
  return () => slotListeners.delete(l);
}
export function hasQueuedPlanAdd(): boolean {
  return slot !== null;
}

// ── The two add rails ────────────────────────────────────────────────────────────────────────────────────────────
function dayOf(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
}

/** The guest rail: the session's guest plan (made by the first add). */
export function runGuestAdd(job: Pick<QueuedAdd, "key" | "ref" | "city" | "chosenDate">): Promise<GuestSaveResult | null> {
  setAddPending(job.key, true);
  return saveToGuestPlan(job.ref, job.city, job.chosenDate).then(
    async (result) => {
      setAddPending(job.key, false);
      emitPlanAddFeedback({
        kind: "added",
        event: { rail: { kind: "guest" }, itemId: result.id, dayNumber: dayOf(result.item?.dayNumber), located: result.located },
      });
      const view = queryClient.getQueryData<GuestPlanView | null>(GUEST_PLAN_QUERY_KEY) ?? null;
      if (view?.plan) maybeOpenFirstAddDates({ kind: "guest" }, view.plan.id, view.plan.datesConfirmed, view.plan.startDate, view.plan.endDate);
      return result;
    },
    (err) => {
      setAddPending(job.key, false);
      emitPlanAddFeedback({ kind: "failed", message: guestSaveErrorMessage(err), retry: () => void runGuestAdd(job) });
      return null;
    },
  );
}

/**
 * The signed-in rail for a press that waited in the slot (the card that held its own handler is gone): the item goes
 * to the traveler's active plan by its PlanItemRef — or, with no plan yet, to a new plan in the press's city (dates
 * optional on that body: the server stores its one-day placeholder and claims no dates).
 */
export async function runSignedInRefAdd(job: Pick<QueuedAdd, "key" | "ref" | "city">): Promise<void> {
  setAddPending(job.key, true);
  try {
    const trips = await queryClient.fetchQuery<HeaderTrip[]>({ queryKey: ["/api/trips"] });
    // The ONE active-plan rule, with the same binding the strip reads (`?tripId=`, then the pen).
    let trip = activeHeaderTrip(trips, boundTripId(typeof window === "undefined" ? "" : window.location.search, getTripContext().tripId));
    if (!trip) {
      const res = await apiRequest("POST", "/api/trips", { destination: job.city, title: planTitle({ city: job.city.split(",")[0].trim() }) });
      trip = (await res.json()) as HeaderTrip;
      void queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
    }
    const res = await apiRequest("POST", `/api/trips/${trip.id}/itinerary-items`, { ref: job.ref });
    const item = (await res.json()) as { id: string; dayNumber?: number | null; latitude?: unknown; longitude?: unknown };
    setAddPending(job.key, false);
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${trip.id}/itinerary-items`] });
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${trip.id}/plancard`] });
    void refreshSavedRefs(queryClient);
    const located = item.latitude != null && item.longitude != null;
    emitPlanAddFeedback({ kind: "added", event: { rail: { kind: "trip", tripId: trip.id }, itemId: item.id, dayNumber: dayOf(item.dayNumber), located } });
    maybeOpenFirstAddDates({ kind: "trip", tripId: trip.id }, trip.id, trip.datesConfirmedAt ? true : false, trip.startDate ?? null, trip.endDate ?? null);
  } catch (err) {
    setAddPending(job.key, false);
    emitPlanAddFeedback({ kind: "failed", message: guestSaveErrorMessage(err), retry: () => void runSignedInRefAdd(job) });
  }
}

/** The signed-in picker rail calls this after its own write, so its toast carries Undo and Change day too. */
export function announceTripAdd(tripId: string, item: { id?: string | null; dayNumber?: number | null } | null, trip?: Pick<HeaderTrip, "datesConfirmedAt" | "startDate" | "endDate"> | null): void {
  if (!item?.id) return;
  emitPlanAddFeedback({ kind: "added", event: { rail: { kind: "trip", tripId }, itemId: item.id, dayNumber: dayOf(item.dayNumber), located: null } });
  if (trip) maybeOpenFirstAddDates({ kind: "trip", tripId }, tripId, trip.datesConfirmedAt ? true : false, trip.startDate ?? null, trip.endDate ?? null);
}

// ── First add on an undated plan: the calendar, once ─────────────────────────────────────────────────────────────
function readFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* storage off: the calendar may open again on the next add, which is the harmless failure */
  }
}
export function maybeOpenFirstAddDates(rail: PlanAddRail, planId: string, datesConfirmed: boolean | null | undefined, startDate: string | null, endDate: string | null): void {
  const key = FIRST_ADD_DATES_KEY(planId);
  if (!shouldOpenFirstAddDates({ datesConfirmed, alreadyAsked: readFlag(key) })) return;
  writeFlag(key);
  emitPlanAddFeedback({ kind: "first_add_dates", rail, planId, startDate, endDate });
}

// ── Undo and Change day ──────────────────────────────────────────────────────────────────────────────────────────
function refreshAfter(rail: PlanAddRail) {
  if (rail.kind === "guest") void queryClient.invalidateQueries({ queryKey: GUEST_PLAN_QUERY_KEY });
  else {
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${rail.tripId}/itinerary-items`] });
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${rail.tripId}/plancard`] });
    void queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
  }
  void refreshSavedRefs(queryClient);
}

export async function undoPlanAdd(e: AddedEvent, path: string): Promise<void> {
  try {
    await apiRequest("DELETE", path);
  } finally {
    refreshAfter(e.rail);
  }
}

export async function movePlanAdd(e: AddedEvent, path: string, dayNumber: number): Promise<void> {
  try {
    await apiRequest("PATCH", path, { dayNumber });
  } finally {
    refreshAfter(e.rail);
  }
}

/** Test seam. */
export const __planAddRunner = {
  reset() {
    pending.clear();
    slot = null;
    emit();
  },
  get version() {
    return version;
  },
};
