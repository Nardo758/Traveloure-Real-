/**
 * Plan-approval mode-flip predicate (migration 164; QA_PUNCH_LIST W2-A item 13, ratified
 * decision-maker Aug 1 2026: "the mode-flip rule stands — approval flips expert direct-edit to
 * suggest-mode. Pre-approval stays direct-edit").
 *
 * Once the customer approves the delivered plan on an assignment, that assigned expert's DIRECT
 * itinerary-item writes on the trip are refused — post-approval changes must go through the
 * suggestion rail instead (which stays open unconditionally). This predicate is the single
 * source of truth for "is this expert's direct-edit mode currently gated on this trip?" — it is
 * consulted ONLY on the advisor/assigned-expert write path (never for the trip owner, never for
 * an authored-build author — see call sites).
 */
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { tripExpertAdvisors } from "@shared/schema";

/**
 * True iff an advisor row exists for (tripId, userId) with plan_approval_status = 'approved'.
 * NULL / 'changes_requested' / no row at all → false (direct-edit stays open).
 */
export async function isPlanApprovedForExpert(
  tripId: string | undefined | null,
  userId: string | undefined | null,
): Promise<boolean> {
  if (!tripId || !userId) return false;
  const [row] = await db
    .select({ status: tripExpertAdvisors.planApprovalStatus })
    .from(tripExpertAdvisors)
    .where(
      and(
        eq(tripExpertAdvisors.tripId, tripId),
        eq(tripExpertAdvisors.localExpertId, userId),
      ),
    )
    .limit(1);
  return row?.status === "approved";
}

/** Shared 409 payload — the client's parseApiErrorMessage-style handlers read `.message`. */
export const PLAN_APPROVED_SUGGEST_INSTEAD_ERROR = {
  code: "plan_approved_suggest_instead",
  message: "This plan is approved — send changes as a suggestion for your client to approve.",
} as const;
