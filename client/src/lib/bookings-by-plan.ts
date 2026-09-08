/**
 * BOOKINGS ARE GROUPED BY PLAN — the ONE grouping derivation for My Bookings.
 *
 * Ledger `2026-09-07-bookings-by-plan`; Console & AI Concierge brief §7 ("Bookings. Grouped by
 * plan; every row names the service and the provider through an allowlist projection … A balance
 * is paid on the slip (D9) and only noted here") and §11.2 finding F10 ("Bookings rows name no
 * service, provider or plan; the Trips tab never cross-links").
 *
 * The plan facts on each booking are SERVER-projected (`server/utils/booking-read-scope.ts`) and
 * only ever describe the session user's own plan — this module never re-derives them, it only
 * groups (§18 rule 1).
 *
 * §13 — ABSENCES ARE ANSWERS, and there are three distinct ones here:
 *   • `trip: null` means the booking is NOT on a plan. That is a real, common state (a service
 *     bought before any plan existed), so it gets its own honestly-named group and is never
 *     attached to the nearest plan.
 *   • A plan with no `startDate` is not given one. Undated groups sort AFTER dated ones rather
 *     than being placed at an invented position.
 *   • A ready-made purchase whose plan has no bookings is NOT turned into a plan group of its own:
 *     the purchase row carries a clone trip id but none of the plan's facts (no destination, no
 *     dates), and a header built from an id alone would be a group nobody could read. Those come
 *     back as `unattachedPurchases`, which the surface names out loud as living on the Trips tab —
 *     that is the cross-link F10 asks for, in the direction the data can actually support.
 */

/** The plan facts a booking row carries — exactly `BOOKING_TRIP_FIELDS`, server-projected. */
export interface BookingPlanRef {
  id: string;
  title?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface GroupableBooking {
  id: string;
  trip?: BookingPlanRef | null;
}

/** A ready-made STORE purchase, as `/api/ready-made/purchases/mine` returns it. */
export interface GroupablePurchase {
  id: string;
  cloneTripId?: string | null;
}

export interface PlanBookingGroup<B extends GroupableBooking, P extends GroupablePurchase> {
  /** Stable react key: the plan id, or the sentinel for the unlinked group. */
  key: string;
  /** `null` for the unlinked group — never a synthesised plan. */
  plan: BookingPlanRef | null;
  bookings: B[];
  /** Ready-made purchases whose clone lives on THIS plan (the Trips-tab cross-link). */
  purchases: P[];
}

export interface GroupedBookings<B extends GroupableBooking, P extends GroupablePurchase> {
  groups: PlanBookingGroup<B, P>[];
  /** Purchases whose plan carries no bookings — see the §13 note in the header. */
  unattachedPurchases: P[];
}

export const UNLINKED_GROUP_KEY = "__no_plan__";

/**
 * The header line for a group. Never invents a destination or a name: a plan whose title and
 * destination are both blank falls back to the neutral word "Plan", which claims nothing.
 */
export function planGroupLabel(plan: BookingPlanRef | null): string {
  if (!plan) return "Not linked to a plan";
  const destination = plan.destination?.trim();
  if (destination) return destination;
  const title = plan.title?.trim();
  if (title) return title;
  return "Plan";
}

function startTime(plan: BookingPlanRef | null): number | null {
  if (!plan?.startDate) return null;
  const t = new Date(plan.startDate).getTime();
  return Number.isFinite(t) ? t : null;
}

export function groupBookingsByPlan<B extends GroupableBooking, P extends GroupablePurchase>(
  bookings: readonly B[],
  purchases: readonly P[] = [],
): GroupedBookings<B, P> {
  const byPlan = new Map<string, PlanBookingGroup<B, P>>();

  for (const booking of bookings) {
    const plan = booking.trip ?? null;
    const key = plan?.id ?? UNLINKED_GROUP_KEY;
    let group = byPlan.get(key);
    if (!group) {
      group = { key, plan, bookings: [], purchases: [] };
      byPlan.set(key, group);
    }
    group.bookings.push(booking);
  }

  const unattachedPurchases: P[] = [];
  for (const purchase of purchases) {
    const group = purchase.cloneTripId ? byPlan.get(purchase.cloneTripId) : undefined;
    if (group) group.purchases.push(purchase);
    else unattachedPurchases.push(purchase);
  }

  const groups = Array.from(byPlan.values()).sort((a, b) => {
    // The unlinked group is last, always — it is not a plan and has no place on a date axis.
    if (a.key === UNLINKED_GROUP_KEY) return 1;
    if (b.key === UNLINKED_GROUP_KEY) return -1;
    const at = startTime(a.plan);
    const bt = startTime(b.plan);
    // §13: an undated plan is not given a position among the dated ones.
    if (at === null && bt === null) return planGroupLabel(a.plan).localeCompare(planGroupLabel(b.plan));
    if (at === null) return 1;
    if (bt === null) return -1;
    return at - bt;
  });

  return { groups, unattachedPurchases };
}

/**
 * IS A BALANCE OUTSTANDING ON THIS BOOKING? Read off the booking's own
 * `balance_amount`/`balance_paid` columns — this is a NOTE, not a permission and not an amount
 * derivation. Who may pay, and how much, stays with `POST /api/bookings/:id/pay-balance` and
 * `canPayBalance` (server/services/balance-payer.service.ts); nothing here is a second copy of
 * either (§14/§15/§18 rule 1).
 *
 * §13: a null `balanceAmount` means no deposit split was recorded, which is not "a balance of
 * zero" — it renders nothing at all.
 */
export function outstandingBalance(booking: {
  balanceAmount?: string | number | null;
  balancePaid?: boolean | null;
}): number | null {
  if (booking.balancePaid) return null;
  if (booking.balanceAmount === null || booking.balanceAmount === undefined) return null;
  const amount = typeof booking.balanceAmount === "number" ? booking.balanceAmount : parseFloat(booking.balanceAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}
