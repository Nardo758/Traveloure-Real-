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

/** The subset of a signed-in trip the header needs. `itemCount` is absent when the payload omits it. */
export interface HeaderTrip {
  id: string;
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  /** NULL = the dates were never chosen (a NOT NULL placeholder window). */
  datesConfirmedAt?: string | null;
  updatedAt?: string | null;
  finalizedAt?: string | null;
  itemCount?: number | null;
}

export type HeaderPlanState =
  | { kind: "start" }
  | { kind: "resume"; planId: string; city: string | null; guest: boolean }
  | { kind: "chip"; planId: string; city: string | null; stops: number; dates: string | null; guest: boolean };

/** Wording approved — Leon (Nov 10, 11:27 AM ET): the chip's date fallback. */
export const HEADER_ADD_DATES_LABEL = "Add dates";

/**
 * Cut-list #1 slice A: where a GUEST's chip and 0-stop resume go.
 *
 * NOT `/plans/{id}` — that is a `ProtectedRoute`, so a guest following it is sign-in-walled. NOT
 * `PLAN_START_HREF` (`/?start=1`) either: that opens a NEW plan. `/plans/new` is the guest's own
 * slip, which is the plan the chip is speaking for. No `?view=` (Days is the ruled landing).
 */
export const GUEST_PLAN_HREF = "/plans/new";

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
  // Slice B: a same-day trip is one day, never "Nov 12–12".
  if (a.month === b.month && a.day === b.day) return `${MONTHS[a.month]} ${a.day}`;
  if (a.month === b.month) return `${MONTHS[a.month]} ${a.day}\u2013${b.day}`;
  return `${MONTHS[a.month]} ${a.day} \u2013 ${MONTHS[b.month]} ${b.day}`;
}

/**
 * The signed-in plan the header speaks for: most recently updated, never finalized.
 *
 * Filtered on `finalizedAt` ONLY. `trips.status` is a display lifecycle that a reopen or an admin
 * action can move without touching finality, so filtering on it would silently drop a plan the
 * traveler is still working on.
 */
export function activeHeaderTrip(trips: readonly HeaderTrip[] | null | undefined): HeaderTrip | null {
  const live = (trips ?? []).filter((t) => !t.finalizedAt);
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
      guest: true,
    };
  }

  const trip = activeHeaderTrip(input.trips);
  if (!trip) return { kind: "start" };
  const city = String(trip.destination ?? "").trim() || null;
  const stops = typeof trip.itemCount === "number" ? trip.itemCount : null;
  // A genuinely missing count claims no number rather than inventing one — reopening the plan is
  // honest, "Your plan · 0" is not.
  if (stops == null || stops === 0) return { kind: "resume", planId: trip.id, city, guest: false };
  // Only CONFIRMED dates are formatted. A plan's startDate/endDate are NOT NULL and are routinely a
  // one-day placeholder nobody chose, so printing them would show a date the traveler never picked.
  const dates = trip.datesConfirmedAt ? headerDatesLabel(trip.startDate, trip.endDate) : null;
  return { kind: "chip", planId: trip.id, city, stops, dates, guest: false };
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

/**
 * Cut-list #1 slice B: what the chip's dates segment opens the ONE dates panel on. Only the chip
 * state has one; it names the same plan the chip names (guest plan or the active trip) and carries
 * that plan's own dates, so the panel opens empty when they were never chosen.
 */
export interface HeaderDatesTarget {
  guest: boolean;
  planId: string;
  startDate: string | null;
  endDate: string | null;
  datesConfirmed: boolean;
}

export function headerDatesTarget(
  state: HeaderPlanState,
  input: { guestPlan: HeaderGuestPlan | null | undefined; trips: readonly HeaderTrip[] | null | undefined },
): HeaderDatesTarget | null {
  if (state.kind !== "chip") return null;
  if (state.guest) {
    const p = input.guestPlan?.plan;
    if (!p || p.id !== state.planId) return null;
    return { guest: true, planId: p.id, startDate: p.startDate ?? null, endDate: p.endDate ?? null, datesConfirmed: !!p.datesConfirmed };
  }
  const t = activeHeaderTrip(input.trips);
  if (!t || t.id !== state.planId) return null;
  return {
    guest: false,
    planId: t.id,
    startDate: t.startDate ?? null,
    endDate: t.endDate ?? null,
    datesConfirmed: !!t.datesConfirmedAt,
  };
}
