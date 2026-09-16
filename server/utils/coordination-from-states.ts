/**
 * `coordination_states` STATUS ORDER AND FROM-STATE ALLOW-LISTS — one home (§18 rule 1), on the
 * `booking-from-states.ts` pattern one table over.
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-39, option A; ledger
 * `2026-09-15-d36-d39-completion-declared`; brief Part II §9, §13 D-39, §15 F3, §17 lane 5).
 *
 * WHAT A COORDINATION ENGAGEMENT IS, MONEY-WISE — stated here because every list below follows from
 * it. The coordination fee is captured UP FRONT (`fee_payment_status`, which HAS a DB CHECK and
 * grows NO value here) and recorded as `platform_revenue`. **NO COORDINATOR EARNING IS EVER MINTED**
 * — no `expert_earnings` or `provider_earnings` row exists for an engagement, and `completed` on a
 * `coordination_states` row moves NO money. So the traveler's declared window on THIS rail cannot
 * gate a release (there is nothing to release, and saying so would describe a payout the platform
 * does not make, §13). What it honestly gates is the ADMIN REFUND of the captured fee
 * (`POST /api/coordination-states/:id/refund`): open while the window runs or the traveler has
 * objected, closed once the window elapsed undisputed. Whether a coordinator is ever paid an earning
 * out of that fee is a SEPARATE, UNRULED money question (owner = the memberships/engagement lane)
 * and is NOT decided here or anywhere in this module.
 *
 * NEGATIVE SPACE (§18d): these lists say which statuses a transition may consume. They say nothing
 * about WHO may ask — the route's own `userId` / `assignedExpertId` gate (§14) — and nothing about
 * the fee, whose amount is read from the row (`feeAmountCents`) and never from a body.
 */

import { COMPLETION_DECLARED_STATUS, COORDINATION_DISPUTED_STATUS } from "@shared/declared-completion-window";

/**
 * THE COORDINATOR'S FORWARD ORDER — the ONE list (V-25(a)'s F6b pinned that there was exactly one;
 * it moved here from the `server/routes.ts` monolith so the window's close could read it too).
 *
 * `completion_declared` sits between `in_progress` and `completed` (D-39: the ASSIGNED COORDINATOR
 * declares). `completed` STAYS in the order because it is still a real state — it is just no longer
 * the coordinator's to set: see `coordinatorMayAdvance`.
 */
export const COORDINATION_FORWARD_ORDER: readonly string[] = [
  "intake",
  "expert_matching",
  "vendor_discovery",
  "itinerary_generation",
  "optimization",
  "booking_coordination",
  "confirmed",
  "in_progress",
  COMPLETION_DECLARED_STATUS,
  "completed",
];

/**
 * THE WINDOW'S CLOSE ON THIS RAIL. `completion_declared → completed`, made by the nightly job once
 * the derived deadline has passed (`coordinationDeclaredAt` + `declaredCompletionWindowDays()`).
 * One entry: a `disputed` engagement is deliberately absent, so a traveler's objection stops the
 * close by construction (the guarded UPDATE matches zero rows).
 */
export const COORDINATION_WINDOW_CLOSE_FROM_STATUSES: readonly string[] = [COMPLETION_DECLARED_STATUS];

/**
 * Why a coordinator's requested advance is refused. Stated as a reason, never a bare 403, so the
 * console can say which rule spoke (§13).
 */
export type CoordinatorAdvanceRefusal =
  /** The target is not in the order, or is not strictly ahead of the current status. */
  | "not_forward"
  /**
   * D-39: `completed` is the WINDOW'S word, not the coordinator's. A coordinator declares
   * (`completion_declared`); the traveler then has the config window; the nightly job says
   * "completed" when it closes undisputed. Letting the coordinator write `completed` directly would
   * say the window closed on the day it opened — the exact §13 lie the declared state exists to fix.
   */
  | "window_closes_engagement";

/**
 * MAY THE COORDINATOR MOVE `from → to`? Forward only, never `completed`. This is the PRE-CHECK; the
 * guard is `storage.updateCoordinationStatus`'s `expectedFromStatuses` (V-25b) — a pre-check is
 * only the error message (§18b).
 */
export function coordinatorMayAdvance(from: string, to: string): { ok: true } | { ok: false; reason: CoordinatorAdvanceRefusal } {
  const currentIdx = COORDINATION_FORWARD_ORDER.indexOf(from);
  const nextIdx = COORDINATION_FORWARD_ORDER.indexOf(to);
  if (nextIdx === -1 || nextIdx <= currentIdx) return { ok: false, reason: "not_forward" };
  if (to === "completed") return { ok: false, reason: "window_closes_engagement" };
  return { ok: true };
}

/**
 * THE TRAVELER ARM'S RULE — F3 (brief §15), OWNED BY D-39 and answered here. Until this lane the
 * traveler could set ANY string in ANY direction (`completed` on a fresh intake; an engagement
 * walked backwards). Under D-39 the COORDINATOR declares, so the traveler's one move on the status
 * rail is to OBJECT inside the declared window: `completion_declared → disputed`. That is the whole
 * allow-list (§19 shape — target → the statuses it may consume), and a target absent from it is
 * refused with the reason, never silently written.
 *
 * WHAT A TRAVELER DISPUTE DOES HERE, AND DOES NOT. It stops the window's close (not in
 * `COORDINATION_WINDOW_CLOSE_FROM_STATUSES`) and keeps the admin refund OPEN past the deadline
 * (`coordinationRefundWindowGate`). It moves no money — a dispute is a QUESTION; the admin's refund
 * is the ANSWER (brief §14). It is visible to admins where every engagement already is
 * (`GET /api/admin/concierge-requests` joins the row and its status). NOT BUILT, and named: an
 * admin "reject" that puts a disputed engagement back to `completed` — no admin arm exists on the
 * status PATCH and this lane adds no new rail; the refund route is the one resolution that exists.
 */
export const TRAVELER_COORDINATION_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  [COORDINATION_DISPUTED_STATUS]: [COMPLETION_DECLARED_STATUS],
};

export function travelerMaySet(from: string, to: string): boolean {
  const allowedFrom = TRAVELER_COORDINATION_TRANSITIONS[to];
  return Array.isArray(allowedFrom) && allowedFrom.includes(from);
}

/**
 * D-39: WHAT THE WINDOW GATES ON THIS RAIL — the admin REFUND, never a payout.
 *
 *   `no_window`      the engagement was never declared (legacy direct `completed`, or still in
 *                    progress) ⇒ NO window exists and the refund is not gated by one (§13: a window
 *                    the server cannot date does not start). Today's behaviour, verbatim.
 *   `open`           declared, deadline not yet passed ⇒ refundable.
 *   `disputed`       the traveler objected inside the window ⇒ refundable regardless of the clock;
 *                    the refund is the admin's answer to the question.
 *   `closed`         declared, undisputed, deadline passed ⇒ the fee window for a refund has closed.
 *                    The surface may say exactly that — and never that "earnings were released",
 *                    because none exist (brief §14).
 *
 * Pure: the caller passes the row's status, the derived declaration instant and the config window.
 */
export type CoordinationRefundWindow = "no_window" | "open" | "disputed" | "closed";

export function coordinationRefundWindowGate(input: {
  status: string | null | undefined;
  declaredAt: Date | null;
  windowDays: number;
  now: Date;
}): CoordinationRefundWindow {
  if (input.status === COORDINATION_DISPUTED_STATUS) return "disputed";
  if (!input.declaredAt) return "no_window";
  if (!Number.isFinite(input.windowDays) || input.windowDays < 0) return "no_window";
  const deadlineMs = input.declaredAt.getTime() + input.windowDays * 24 * 60 * 60 * 1000;
  return input.now.getTime() >= deadlineMs ? "closed" : "open";
}
