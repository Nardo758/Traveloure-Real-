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
 *
 * QA round 3 PR 1 (Leon, Nov 11, 2026): the first add on a plan whose dates were never chosen asks for the dates BEFORE
 * the item lands (`askFirstAddDates`). Nothing is written until the traveler answers: Save writes the dates, then the
 * item (on the press's own day when that day is inside the chosen range, otherwise Day 1); "Skip for now" — and
 * Escape or a click outside — writes the item as before. A guest with no plan yet is asked first too; the plan and the
 * item are then created on the answer.
 */
import { useSyncExternalStore } from "react";
import { apiRequest, queryClient } from "./queryClient";
import { refreshSavedRefs } from "./saved-refs";
import {
  GUEST_PLAN_QUERY_KEY,
  createGuestPlan,
  guestSaveErrorMessage,
  saveToGuestPlan,
  updateGuestPlan,
  type GuestItemBody,
  type GuestPlanView,
  type GuestSaveResult,
} from "./waitlist-guest-plan";
import { activeHeaderTrip, type HeaderTrip } from "./header-plan";
import { boundTripId } from "./active-plan";
import { getTripContext } from "./trip-context";
import { planTitle } from "./trip-slip";
import { FIRST_ADD_DATES_KEY, planDayCount, shouldOpenFirstAddDates, type PlanAddRail } from "./add-to-plan";
import { writePlanAnswersToContext } from "./trip-context";

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
  | {
      kind: "first_add_dates";
      rail: PlanAddRail;
      /** Null for a guest whose plan the answer will create. */
      planId: string | null;
      startDate: string | null;
      endDate: string | null;
      /** The pressed add button, when there is one: a popover anchors to it from `sm` up; none ⇒ the sheet. */
      anchor: HTMLElement | null;
      /** The traveler's answer; the add writes only after it. */
      answer: (a: FirstAddAnswer) => void;
    };
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

// ── The pressed add button, by the item's saved key (the first-add popover anchors to it) ────────────────────────
const pressed = new Map<string, HTMLElement>();
/** `AddToPlanButton` records the element it drew for this key on every press. */
export function notePressedAdd(key: string | null | undefined, el: HTMLElement | null): void {
  if (!key || !el) return;
  pressed.set(key, el);
}
function pressedFor(key: string | null | undefined): HTMLElement | null {
  const el = key ? pressed.get(key) ?? null : null;
  return el && el.isConnected ? el : null;
}

// ── First add on an undated plan: the calendar, once per plan per tab, BEFORE the write ──────────────────────────
export type FirstAddAnswer = { kind: "save"; startDate: string; endDate: string } | { kind: "skip" };

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
/** Mark a plan as asked (a guest plan created by an answer is recorded under its new id). */
export function noteFirstAddAsked(planId: string | null | undefined): void {
  if (planId) writeFlag(FIRST_ADD_DATES_KEY(planId));
}

/**
 * Ask for the dates before the first add on a plan whose dates were never chosen. Resolves `null` when there is
 * nothing to ask (dates chosen or unknown, already asked on this plan in this tab, or no host is mounted to draw the
 * panel) — the caller then writes exactly as before. `planId` null is a guest whose plan does not exist yet: always
 * asked (its plan will be created without chosen dates).
 */
export function askFirstAddDates(input: {
  rail: PlanAddRail;
  planId: string | null;
  datesConfirmed: boolean | null | undefined;
  startDate: string | null;
  endDate: string | null;
  anchor: HTMLElement | null;
}): Promise<FirstAddAnswer | null> {
  const asked = input.planId ? readFlag(FIRST_ADD_DATES_KEY(input.planId)) : false;
  if (!shouldOpenFirstAddDates({ datesConfirmed: input.datesConfirmed, alreadyAsked: asked })) return Promise.resolve(null);
  if (feedbackListeners.size === 0) return Promise.resolve(null);
  noteFirstAddAsked(input.planId);
  return new Promise<FirstAddAnswer>((resolve) => {
    let done = false;
    const answer = (a: FirstAddAnswer) => {
      if (done) return;
      done = true;
      resolve(a);
    };
    emitPlanAddFeedback({ kind: "first_add_dates", rail: input.rail, planId: input.planId, startDate: input.startDate, endDate: input.endDate, anchor: input.anchor, answer });
  });
}

/**
 * Pure. The press's own day survives a Save only when it is inside the chosen range; otherwise the item lands on
 * Day 1 (Leon, Nov 11, 2026). Null in ⇒ null out (the rail's own default, Day 1).
 */
export function dayInsideChosenRange(day: number | null | undefined, range: { startDate: string; endDate: string }): number | null {
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1) return null;
  return day <= planDayCount(range.startDate, range.endDate) ? day : null;
}

/** A ref whose `placement.day_number` is kept only when it is inside the chosen range. */
function refForChosenRange<T extends { placement?: { day_number?: number } | null }>(ref: T, range: { startDate: string; endDate: string }): T {
  const day = dayInsideChosenRange(ref.placement?.day_number, range);
  if (day != null || !ref.placement || ref.placement.day_number == null) return ref;
  const { day_number: _drop, ...rest } = ref.placement;
  return { ...ref, placement: rest };
}

/** Save's dates on a signed-in plan: the slip's own rail (PATCH /api/trips/:id, ONLY the two dates — §19). */
export async function saveTripDatesForFirstAdd(tripId: string, range: { startDate: string; endDate: string }): Promise<void> {
  await apiRequest("PATCH", `/api/trips/${tripId}`, { startDate: range.startDate, endDate: range.endDate });
  writePlanAnswersToContext(tripId, { startDate: range.startDate, endDate: range.endDate });
  void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
  void queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
  void queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
}

// ── The two add rails ────────────────────────────────────────────────────────────────────────────────────────────
function dayOf(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
}

/** The guest rail: the session's guest plan (made by the first add). */
export async function runGuestAdd(job: Pick<QueuedAdd, "key" | "ref" | "city" | "chosenDate">): Promise<GuestSaveResult | null> {
  const view = queryClient.getQueryData<GuestPlanView | null>(GUEST_PLAN_QUERY_KEY) ?? null;
  // Asked BEFORE the write (a guest with no plan yet: its plan will be created undated, so it is asked too).
  const answer = await askFirstAddDates({
    rail: { kind: "guest" },
    planId: view?.plan?.id ?? null,
    datesConfirmed: view?.plan ? view.plan.datesConfirmed : false,
    startDate: view?.plan?.startDate ?? null,
    endDate: view?.plan?.endDate ?? null,
    anchor: pressedFor(job.key),
  });
  setAddPending(job.key, true);
  try {
    let ref = job.ref;
    if (answer?.kind === "save") {
      // The dates first, so the item is placed on the chosen window; a plan the answer creates is born with them.
      if (view?.plan) await updateGuestPlan({ startDate: answer.startDate, endDate: answer.endDate });
      else {
        const city = (job.city ?? "").trim();
        if (!city) throw new Error("400: no destination");
        const made = await createGuestPlan({ destination: city, title: planTitle({ city: city.split(",")[0].trim() }), startDate: answer.startDate, endDate: answer.endDate });
        noteFirstAddAsked(made?.plan?.id);
      }
      ref = refForChosenRange(ref, answer);
    }
    const result = await saveToGuestPlan(ref, job.city, job.chosenDate);
    setAddPending(job.key, false);
    // A plan the first press created (Skip, or no host to ask) is recorded as asked: the calendar opens once per plan.
    if (!view?.plan) noteFirstAddAsked(queryClient.getQueryData<GuestPlanView | null>(GUEST_PLAN_QUERY_KEY)?.plan?.id);
    emitPlanAddFeedback({
      kind: "added",
      event: { rail: { kind: "guest" }, itemId: result.id, dayNumber: dayOf(result.item?.dayNumber), located: result.located },
    });
    return result;
  } catch (err) {
    setAddPending(job.key, false);
    emitPlanAddFeedback({ kind: "failed", message: guestSaveErrorMessage(err), retry: () => void runGuestAdd(job) });
    return null;
  }
}

/**
 * The signed-in rail for a press that waited in the slot (the card that held its own handler is gone): the item goes
 * to the traveler's active plan by its PlanItemRef — or, with no plan yet, to a new plan in the press's city (dates
 * optional on that body: the server stores its one-day placeholder and claims no dates).
 */
export async function runSignedInRefAdd(job: Pick<QueuedAdd, "key" | "ref" | "city">): Promise<void> {
  try {
    const trips = await queryClient.fetchQuery<HeaderTrip[]>({ queryKey: ["/api/trips"] });
    // The ONE active-plan rule, with the same binding the strip reads (`?tripId=`, then the pen).
    let trip = activeHeaderTrip(trips, boundTripId(typeof window === "undefined" ? "" : window.location.search, getTripContext().tripId));
    // Asked BEFORE any write — before the mint too, when there is no plan yet (a new plan is undated).
    const answer = await askFirstAddDates({
      rail: { kind: "trip", tripId: trip?.id ?? "" },
      planId: trip?.id ?? null,
      datesConfirmed: trip ? !!trip.datesConfirmedAt : false,
      startDate: trip?.startDate ?? null,
      endDate: trip?.endDate ?? null,
      anchor: pressedFor(job.key),
    });
    setAddPending(job.key, true);
    if (!trip) {
      // A Save answer mints with the chosen dates (the server stamps them confirmed); otherwise its one-day placeholder.
      const dates = answer?.kind === "save" ? { startDate: answer.startDate, endDate: answer.endDate } : {};
      const res = await apiRequest("POST", "/api/trips", { destination: job.city, title: planTitle({ city: job.city.split(",")[0].trim() }), ...dates });
      trip = (await res.json()) as HeaderTrip;
      noteFirstAddAsked(trip.id);
      void queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
    } else if (answer?.kind === "save") {
      await saveTripDatesForFirstAdd(trip.id, answer);
    }
    const ref = answer?.kind === "save" ? refForChosenRange(job.ref, answer) : job.ref;
    const res = await apiRequest("POST", `/api/trips/${trip.id}/itinerary-items`, { ref });
    const item = (await res.json()) as { id: string; dayNumber?: number | null; latitude?: unknown; longitude?: unknown };
    setAddPending(job.key, false);
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${trip.id}/itinerary-items`] });
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${trip.id}/plancard`] });
    void refreshSavedRefs(queryClient);
    const located = item.latitude != null && item.longitude != null;
    emitPlanAddFeedback({ kind: "added", event: { rail: { kind: "trip", tripId: trip.id }, itemId: item.id, dayNumber: dayOf(item.dayNumber), located } });
  } catch (err) {
    setAddPending(job.key, false);
    emitPlanAddFeedback({ kind: "failed", message: guestSaveErrorMessage(err), retry: () => void runSignedInRefAdd(job) });
  }
}

/**
 * The signed-in picker rail calls this after its own write, so its toast carries Undo and Change day too. It no longer
 * opens the dates calendar: a caller that asks does so BEFORE its write (`askFirstAddDates`, QA round 3 PR 1).
 */
export function announceTripAdd(tripId: string, item: { id?: string | null; dayNumber?: number | null } | null): void {
  if (!item?.id) return;
  emitPlanAddFeedback({ kind: "added", event: { rail: { kind: "trip", tripId }, itemId: item.id, dayNumber: dayOf(item.dayNumber), located: null } });
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
    pressed.clear();
    slot = null;
    emit();
  },
  get version() {
    return version;
  },
};
