/**
 * Cut-list #1, slice A — the header's plan state.
 *
 * One question, four answers, and no guessing (§13):
 *
 *   start   nothing to reopen .................. "Start a plan" (today's newPlan CTA)
 *   resume  a plan exists but holds 0 stops .... "Start a plan" that REOPENS that plan (no newPlan)
 *   chip    1+ stops ........................... "Your {city} plan · {n}" + dates or "Add dates"
 *   chip    count unknown ...................... not claimed: falls back to `resume`
 *
 * A guest's expired/absent plan (404) and a failed read are both `start` — the header's current
 * behaviour, which is what an expired plan should degrade to rather than showing a dead chip.
 *
 * Pure and dependency-free so the matrix is a unit test, not a browser test.
 */

export interface HeaderGuestPlan {
  plan: {
    id: string;
    destination: string;
    startDate: string;
    endDate: string;
    datesConfirmed: boolean;
  };
  items: readonly unknown[];
}

/** The subset of a signed-in trip the header needs. `itemCount` is absent when the list omits it. */
export interface HeaderTrip {
  id: string;
  destination: string;
  updatedAt?: string | null;
  finalizedAt?: string | null;
  status?: string | null;
  itemCount?: number | null;
}

export type HeaderPlanState =
  | { kind: "start" }
  | { kind: "resume"; planId: string; city: string | null; guest: boolean }
  | { kind: "chip"; planId: string; city: string | null; stops: number; dates: string | null };

/** Wording approved — Leon (Nov 10, 11:27 AM ET): the chip's date fallback. */
export const HEADER_ADD_DATES_LABEL = "Add dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `YYYY-MM-DD` → {month, day} without a Date object, so no timezone can shift the day. */
function parseDay(iso: string | null | undefined): { month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return null;
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { month, day };
}

/** "Nov 12–15" in one month, "Nov 12 – Dec 3" across two; null when either end is unreadable. */
export function headerDatesLabel(startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  const a = parseDay(startDate);
  const b = parseDay(endDate);
  if (!a || !b) return null;
  if (a.month === b.month) return `${MONTHS[a.month]} ${a.day}\u2013${b.day}`;
  return `${MONTHS[a.month]} ${a.day} \u2013 ${MONTHS[b.month]} ${b.day}`;
}

const FINISHED_STATUSES = new Set(["completed", "cancelled"]);

/** The signed-in plan the header speaks for: most recently updated, never finalized, not finished. */
export function activeHeaderTrip(trips: readonly HeaderTrip[] | null | undefined): HeaderTrip | null {
  const live = (trips ?? []).filter(
    (t) => !t.finalizedAt && !FINISHED_STATUSES.has(String(t.status ?? "").toLowerCase()),
  );
  if (live.length === 0) return null;
  return [...live].sort((x, y) => String(y.updatedAt ?? "").localeCompare(String(x.updatedAt ?? "")))[0];
}

export function headerPlanState(input: {
  isSignedIn: boolean;
  guestStatus: "idle" | "loading" | "ready" | "error";
  guestPlan: HeaderGuestPlan | null | undefined;
  trips: readonly HeaderTrip[] | null | undefined;
}): HeaderPlanState {
  if (!input.isSignedIn) {
    // Nothing a guest could reopen yet, a failed read, or an expired plan: today's Start a plan.
    if (input.guestStatus === "error" || input.guestStatus === "loading" || input.guestStatus === "idle") return { kind: "start" };
    const guest = input.guestPlan;
    if (!guest) return { kind: "start" };
    const city = String(guest.plan.destination ?? "").trim() || null;
    const stops = guest.items.length;
    if (stops === 0) return { kind: "resume", planId: guest.plan.id, city, guest: true };
    return {
      kind: "chip",
      planId: guest.plan.id,
      city,
      stops,
      dates: guest.plan.datesConfirmed ? headerDatesLabel(guest.plan.startDate, guest.plan.endDate) : null,
    };
  }

  const trip = activeHeaderTrip(input.trips);
  if (!trip) return { kind: "start" };
  const city = String(trip.destination ?? "").trim() || null;
  const stops = typeof trip.itemCount === "number" ? trip.itemCount : null;
  // The list does not always carry a count. Claim no number rather than invent one: reopening the
  // plan is honest, "Your plan · 0" is not.
  if (stops == null || stops === 0) return { kind: "resume", planId: trip.id, city, guest: false };
  return { kind: "chip", planId: trip.id, city, stops, dates: headerDatesLabel((trip as any).startDate, (trip as any).endDate) };
}

/** "Your Kyoto plan · 3" / "Your plan · 3"; null for the non-chip states. */
export function headerPlanLabel(state: HeaderPlanState): string | null {
  if (state.kind !== "chip") return null;
  return state.city ? `Your ${state.city} plan \u00b7 ${state.stops}` : `Your plan \u00b7 ${state.stops}`;
}

/** The chip's second line: the dates, or "Add dates" when they are not confirmed. */
export function headerDatesLine(state: HeaderPlanState): string | null {
  if (state.kind !== "chip") return null;
  return state.dates ?? HEADER_ADD_DATES_LABEL;
}
