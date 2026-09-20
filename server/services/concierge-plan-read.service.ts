/**
 * concierge-plan-read.service.ts — THE BOOKING CONCIERGE READS THE PLAN IT WORKS.
 *
 * Decision-maker ruling 2026-09-20 (ledger `2026-09-20-concierge-plan-read`). CLAUDE.md Locked
 * Decisions 12, 32 (incl. the ONE-author paragraph), 40 (D22 advisor address kind), 42 D7/D16,
 * 44, 51 (incl. its Sep 20 addenda); §13, §14, §15, §18 rule 1.
 *
 * THE RULING, IN ONE SENTENCE. The Booking Concierge gets READ access to the plan it is working:
 * at HAND-OFF for a listing owner stamped on a created `affiliate_booking_requests` row, and at
 * CLAIM for whoever takes a pooled request. What is handed over is the request rows, not the
 * slip — the concierge reads the SLIP LIVE (Locked Decision 32's intent) through the ONE read
 * predicate the trip routes already use, `isTripAdvisor` (`server/utils/trip-advisor.ts`), backed
 * by `trip_expert_advisors`.
 *
 * §12 — READ-ONLY MEANS THE READ RANK, NEVER THE WRITE ONE. This grants `status: "pending"` —
 * the one status in Locked Decision 32's ladder that is in `TRIP_ADVISOR_READ_ACCESS_STATUSES`
 * (so `isTripAdvisor` admits it: the concierge sees the plancard, the itinerary, the logistics
 * surfaces) and NOT in `TRIP_ADVISOR_WRITE_ACCESS_STATUSES` (so the item-mutation rails, gated on
 * `isTripAdvisorWithWriteAccess`, refuse it exactly as they refuse any other pending invitation —
 * Locked Decision 12, "a PENDING advisor may not write"). This grant never asks for more than
 * that; it is not an invitation to accept, and there is no accept/decline affordance for it.
 *
 * THE ONE AUTHOR IS UNCHANGED (Locked Decision 32's correction paragraph). This module is a
 * CALLER of `upsertTripAdvisorRow` (`server/services/booking-actions.service.ts`), never a second
 * insert site — `scripts/check-advisor-row-author.cjs` refuses a raw insert here exactly as it
 * refuses one anywhere else outside that one file. The upsert's own rank ladder
 * (`server/utils/trip-advisor-status.ts`) is what makes this grant safe to call blindly: A
 * CONFLICT NEVER DOWNGRADES. An expert already `accepted`/`assigned` on this plan — a hired
 * advisor who also happens to be running the booking concierge for one of its lines — keeps that
 * higher standing; `pending` cannot demote it. And a concierge already `pending` here stays
 * `pending` on a second grant (hand-off AND a later claim, or two hand-offs for the same pair):
 * the write is idempotent by construction, so this module never needs to check before it writes.
 *
 * §15b — NEVER THROWS INTO THE OPERATION THAT AUTHORIZES IT. The hand-off runs after a booking is
 * confirmed and Stripe has already been charged (`concierge-handoff.service.ts`'s own §15b
 * posture); the claim's write is the very statement that decides who owns the pooled request
 * (`booking-agent-claim.service.ts`'s §15 atomic conditional). A failed grant must undo neither.
 * This function therefore never throws: every failure is caught, logged loudly with the request
 * id that caused the grant, and the caller's own result is returned exactly as it would have been
 * without this call.
 *
 * §13 — THE ABSENCES ARE ANSWERS, NEVER INVENTED.
 *   · no `tripId`                    ⇒ nothing granted. A claimed request with no plan link, or a
 *                                       hand-off that itself found `no_plan_link`, names no plan
 *                                       to read.
 *   · no `expertUserId`              ⇒ nothing granted (defensive; the platform's own reserved
 *                                       concierge account already resolves to `expertId: null`
 *                                       before hand-off ever calls this — Locked Decision 51 lane
 *                                       F — because the platform account never "works" a plan the
 *                                       way a person who claimed the request does).
 *   · a grant that fails             ⇒ logged, never retried here, never surfaced to the
 *                                       traveler — the hand-off/claim it rode in on stands.
 *
 * NEGATIVE SPACE (§18d). This grants access; it sends no notification and no email — telling the
 * concierge is what the hand-off/claim flow itself already does. It writes NOTHING else on the
 * row (`workspace_status`, `expert_response`, the plan-approval columns stay the one author's
 * insert-only fields, per Locked Decision 32). It decides no money and no rate (§14/§18).
 */
import { logger } from "../infrastructure/logger";
import { upsertTripAdvisorRow, type TripAdvisorRowExecutor } from "./booking-actions.service";
import { CONCIERGE_READ_GRANT_MESSAGE } from "@shared/concierge-plan-read";

export { CONCIERGE_READ_GRANT_MESSAGE };

export interface GrantConciergePlanReadInput {
  tripId: string | null | undefined;
  /** The concierge's USER id — the listing owner at hand-off, the claimant at claim. */
  expertUserId: string | null | undefined;
  /** The `affiliate_booking_requests` id (claim) or `service_bookings` id (hand-off, where many
   *  requests may share one grant) this call is attributed to — for the log line only, never
   *  part of the write itself. */
  requestId: string;
  /** Optional transaction handle, on the `upsertTripAdvisorRow` precedent — a caller already
   *  inside a transaction writes the row inside it rather than opening a second connection. */
  tx?: TripAdvisorRowExecutor;
}

/**
 * Grant (or no-op onto) the concierge's read-only standing on the plan they are now working.
 *
 * NEVER THROWS to its caller — see the module header's §15b note. Every branch resolves; nothing
 * here can turn a successful hand-off or claim into a failed response.
 */
export async function grantConciergePlanRead(input: GrantConciergePlanReadInput): Promise<void> {
  const { tripId, expertUserId, requestId, tx } = input;
  if (!tripId || !expertUserId) {
    // §13: nothing to grant against. Not an error — a fact about this request, logged at info
    // level only when it might otherwise look like a silent no-op (it is one, deliberately).
    return;
  }
  try {
    await upsertTripAdvisorRow({
      tripId,
      localExpertId: expertUserId,
      status: "pending",
      message: CONCIERGE_READ_GRANT_MESSAGE,
      tx,
    });
  } catch (err) {
    logger.error(
      { err, requestId, tripId, expertUserId },
      "[concierge-plan-read] grant failed — the hand-off/claim it is attached to stands (§15b: " +
        "an ancillary effect may not break the operation that authorizes it)",
    );
  }
}
