/**
 * Cut-list #1 slice C — THE ADD ACTION's words and rules, in one place (ledger `2026-11-11-cutlist1-slice-c-add-actions`).
 *
 * One button component (`AddToPlanButton`) draws every add on the discover/location feed, /experiences and the
 * planning surface. Its label is "Add to plan", or "Add to Day {n}" when the day is known; once the server confirmed
 * the row it reads "Added ✓". The toast after an add reads "Added to Day {n}." with Undo and Change day; a failed
 * save is a recovery toast with Retry; the header chip carries "View plan".
 *
 * These strings SUPERSEDE, for the add action only, the Nov 6 "Save to plan" (CAP-2 Phase 3) and the Nov 7
 * "Saved to Day {n}." (QW-3). `WAITLIST_COPY` keeps "Save to plan" / "Saved to plan" for the P-1c stand-ins (a buy on
 * an item already on the plan), which are not adds.
 *
 * Wording approved — Leon (Nov 10, 11:27 AM ET): "Add to plan", "Add to Day {n}", "Added to Day {n}.", "Undo",
 * "Change day", "View plan", "Retry". Wording approved — Leon (Nov 10, 11:44 AM ET): "Added ✓".
 * "Day {n}" (the Change day choices) is the plan's own day vocabulary. "We don't have this spot on the map yet." is
 * the existing approved unlocated sentence (A-18).
 */
import { GUEST_PLAN_COPY } from "@shared/guest-plan-copy";

export const ADD_COPY = {
  addToPlan: "Add to plan",
  addToDay: (n: number) => `Add to Day ${n}`,
  added: "Added ✓",
  addedToDay: (n: number) => `Added to Day ${n}.`,
  undo: "Undo",
  changeDay: "Change day",
  viewPlan: "View plan",
  retry: "Retry",
  dayOption: (n: number) => `Day ${n}`,
} as const;

const NOT_ON_MAP = "We don't have this spot on the map yet.";

function positiveDay(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
}

/** The button's label: "Added ✓" once confirmed; "Add to Day {n}" when the day is known; else "Add to plan". */
export function addLabel(input: { added?: boolean; dayNumber?: number | null }): string {
  if (input.added) return ADD_COPY.added;
  const day = positiveDay(input.dayNumber);
  return day ? ADD_COPY.addToDay(day) : ADD_COPY.addToPlan;
}

/**
 * The toast title for a confirmed add: "Added to Day {n}.", and an unlocated place keeps the map fact as a second
 * sentence. A row always carries its day (an undated plan's add lands on Day 1), so the day-less branch is a defensive
 * fallback that claims no day: "Added ✓", or the existing approved unlocated sentence unchanged.
 */
export function addedMessage(input: { dayNumber?: unknown; located?: boolean | null }): string {
  const day = positiveDay(input.dayNumber);
  if (!day) return input.located === false ? GUEST_PLAN_COPY.savedNotOnMap : ADD_COPY.added;
  return input.located === false ? `${ADD_COPY.addedToDay(day)} ${NOT_ON_MAP}` : ADD_COPY.addedToDay(day);
}

/** Where an added item lives, so Undo and Change day write to the same rail that added it. */
export type PlanAddRail = { kind: "guest" } | { kind: "trip"; tripId: string };

/** The item's own path on its rail (DELETE = Undo, PATCH `{ dayNumber }` = Change day). */
export function planItemPath(rail: PlanAddRail, itemId: string): string {
  const id = encodeURIComponent(itemId);
  return rail.kind === "guest"
    ? `/api/guest-plans/current/items/${id}`
    : `/api/trips/${encodeURIComponent(rail.tripId)}/itinerary-items/${id}`;
}

/** Days a plan holds, from its window (end − start + 1); 1 when the window cannot be read. */
export function planDayCount(startDate: string | null | undefined, endDate: string | null | undefined): number {
  const a = Date.parse(String(startDate ?? "").slice(0, 10));
  const b = Date.parse(String(endDate ?? "").slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** The Change day choices: every day of the plan, the item's own day marked current. */
export function changeDayOptions(dayCount: number, current: number | null): Array<{ day: number; label: string; current: boolean }> {
  const n = Math.max(1, Math.min(60, Math.floor(dayCount)));
  return Array.from({ length: n }, (_, i) => ({ day: i + 1, label: ADD_COPY.dayOption(i + 1), current: current === i + 1 }));
}

/**
 * The first add on a plan with no chosen dates opens the calendar — once per plan per tab (a dismissed or skipped
 * calendar does not reopen on the next add). Dates already chosen ⇒ never.
 */
export const FIRST_ADD_DATES_KEY = (planId: string) => `traveloure_first_add_dates:${planId}`;

export function shouldOpenFirstAddDates(input: { datesConfirmed: boolean | null | undefined; alreadyAsked: boolean }): boolean {
  return input.datesConfirmed === false && !input.alreadyAsked;
}

/**
 * A press made while the session or mode read is still in flight waits in ONE slot (a second press replaces it) and
 * runs when both reads answer. A slot older than this is not run: the recovery toast offers Retry instead, so a stale
 * press is never committed silently.
 */
export const PENDING_ADD_MAX_AGE_MS = 15_000;

export function pendingAddIsStale(queuedAt: number, now: number): boolean {
  return now - queuedAt > PENDING_ADD_MAX_AGE_MS;
}
